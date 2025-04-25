import {create} from 'zustand';
import {readPressureButton} from './modbus';
import {getSectionsWithStatus} from './db';

interface PressureButtonState {
  sections: Record<
    number,
    {
      isPressed: boolean | null;
      lastUpdated: number;
      error: string | null;
    }
  >;
  isLoading: boolean;
  error: string | null;
  startPolling: (
    sectionId: number,
    ip: string,
    interval?: number,
  ) => () => void;
  stopPolling: (sectionId: number) => void;
  cleanup: () => void;
}

const ACTIVE_POLLING_INTERVAL = 3000; // 3 seconds - more frequent for button state
const MAX_RETRIES = 3;
const RETRY_DELAY = 500; // 500ms initial delay - faster for button responsiveness
const MAX_QUEUE_SIZE = 30; // Smaller queue size since updates are more frequent

const usePressureButtonStore = create<PressureButtonState>((set, get) => {
  let pollingIntervals: Record<number, NodeJS.Timeout> = {};
  let activeRequests: Record<number, boolean> = {};
  let requestQueue: Array<{sectionId: number; ip: string; timestamp: number}> =
    [];
  let isProcessing = false;

  const processQueue = async () => {
    if (isProcessing || requestQueue.length === 0) return;

    isProcessing = true;

    try {
      // Sort and aggressively clean queue due to frequent updates
      requestQueue.sort((a, b) => a.timestamp - b.timestamp);
      const now = Date.now();
      requestQueue = requestQueue.filter(req => now - req.timestamp < 5000); // Drop requests older than 5s

      if (requestQueue.length === 0) return;

      const {sectionId, ip} = requestQueue.shift()!;
      if (!activeRequests[sectionId]) {
        await fetchButtonStatus(sectionId, ip);
      }
    } finally {
      isProcessing = false;
      if (requestQueue.length > 0) {
        setTimeout(processQueue, 25); // Very small delay between processing
      }
    }
  };

  const fetchButtonStatus = async (
    sectionId: number,
    ip: string,
    retryCount = 0,
  ) => {
    if (!ip || activeRequests[sectionId]) return;

    activeRequests[sectionId] = true;
    const startTime = Date.now();

    try {
      set(state => ({
        sections: {
          ...state.sections,
          [sectionId]: {
            ...(state.sections[sectionId] || {}),
            error: null,
          },
        },
        isLoading: true,
        error: null,
      }));

      // Add timeout protection - shorter timeout for button responsiveness
      const buttonStatus = await Promise.race([
        new Promise<boolean | null>(resolve => {
          readPressureButton(ip, 502, () => {}, resolve);
        }),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Button status timeout')), 3000),
        ),
      ]);

      const fetchDuration = Date.now() - startTime;
      console.log(
        `Button status fetch completed in ${fetchDuration}ms for section ${sectionId}`,
      );

      set(state => ({
        sections: {
          ...state.sections,
          [sectionId]: {
            isPressed: buttonStatus === false, // Inverted logic: false means pressed
            lastUpdated: Date.now(),
            error: null,
          },
        },
        isLoading: false,
      }));
    } catch (error) {
      console.error(
        `Error fetching button status for section ${sectionId}:`,
        error,
      );

      if (retryCount < MAX_RETRIES) {
        const delay = Math.min(RETRY_DELAY * Math.pow(2, retryCount), 5000);
        console.log(
          `Retrying button fetch in ${delay}ms (attempt ${
            retryCount + 1
          }/${MAX_RETRIES})`,
        );

        await new Promise(resolve => setTimeout(resolve, delay));
        delete activeRequests[sectionId];
        return fetchButtonStatus(sectionId, ip, retryCount + 1);
      }

      set(state => ({
        sections: {
          ...state.sections,
          [sectionId]: {
            ...(state.sections[sectionId] || {}),
            error: error instanceof Error ? error.message : String(error),
            lastUpdated: Date.now(),
          },
        },
        isLoading: false,
        error: `Failed to fetch button status: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }));
    } finally {
      delete activeRequests[sectionId];
    }
  };

  const startPolling = (
    sectionId: number,
    ip: string,
    interval = ACTIVE_POLLING_INTERVAL,
  ) => {
    stopPolling(sectionId);

    // Initial fetch
    if (requestQueue.length < MAX_QUEUE_SIZE) {
      requestQueue.push({
        sectionId,
        ip,
        timestamp: Date.now(),
      });
      processQueue();
    }

    // Set up polling with minimal jitter for responsive button state
    const jitteredInterval = interval + Math.random() * 200 - 100;
    pollingIntervals[sectionId] = setInterval(() => {
      if (requestQueue.length < MAX_QUEUE_SIZE) {
        requestQueue.push({
          sectionId,
          ip,
          timestamp: Date.now(),
        });
        processQueue();
      } else {
        console.warn(`Button request queue full for section ${sectionId}`);
      }
    }, jitteredInterval);

    return () => stopPolling(sectionId);
  };

  const stopPolling = (sectionId: number) => {
    if (pollingIntervals[sectionId]) {
      clearInterval(pollingIntervals[sectionId]);
      delete pollingIntervals[sectionId];
    }
    // Clean up any pending requests
    requestQueue = requestQueue.filter(req => req.sectionId !== sectionId);
  };

  const cleanup = () => {
    Object.keys(pollingIntervals).forEach(sectionId => {
      stopPolling(Number(sectionId));
    });
    activeRequests = {};
    requestQueue = [];
  };
  const initialize = async () => {
    cleanup();

    try {
      const sections = await new Promise<any[]>(resolve => {
        getSectionsWithStatus(resolve);
      });

      if (!sections || !Array.isArray(sections)) {
        throw new Error('Invalid sections data received');
      }

      sections.forEach(section => {
        if (section?.id && section?.ip) {
          startPolling(section.id, section.ip);
        }
      });
    } catch (error) {
      console.error('Error initializing DPS status:', error);
    }
  };
  initialize();
  return {
    sections: {},
    isLoading: false,
    error: null,
    startPolling,
    stopPolling,
    cleanup,
  };
});

export default usePressureButtonStore;
