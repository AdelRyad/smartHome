import {create} from 'zustand';
import {readPowerStatus, toggleLamp} from './modbus';
import {getSectionsWithStatus} from './db';
import {AppState} from 'react-native';

interface PowerStatusState {
  sections: Record<
    number,
    {
      isPowered: boolean | null;
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
  setPowerStatus: (
    sectionId: number,
    ip: string,
    status: boolean,
  ) => Promise<void>;
}

const ACTIVE_POLLING_INTERVAL = 20000; // 20 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second initial delay
const MAX_QUEUE_SIZE = 50;
const REQUEST_TIMEOUT = 5000; // 5 second timeout

const useSectionsPowerStatusStore = create<PowerStatusState>((set, get) => {
  let pollingIntervals: Record<number, NodeJS.Timeout> = {};
  let activeRequests: Record<number, boolean> = {};
  let requestQueue: Array<{sectionId: number; ip: string; timestamp: number}> =
    [];
  let isProcessing = false;
  let lastSuccessfulFetch: Record<number, number> = {};
  let appStateListener: ReturnType<typeof AppState.addEventListener> | null =
    null;

  const processQueue = async () => {
    if (isProcessing || requestQueue.length === 0) return;

    isProcessing = true;

    try {
      // Sort and clean queue
      requestQueue.sort((a, b) => a.timestamp - b.timestamp);
      const now = Date.now();
      requestQueue = requestQueue.filter(req => now - req.timestamp < 15000); // Drop old requests

      if (requestQueue.length === 0) return;

      const {sectionId, ip} = requestQueue.shift()!;

      // Check if we should skip based on last successful fetch
      const lastFetch = lastSuccessfulFetch[sectionId] || 0;
      if (now - lastFetch < ACTIVE_POLLING_INTERVAL * 0.8) {
        return; // Skip if fetched too recently
      }

      if (!activeRequests[sectionId]) {
        await fetchPowerStatus(sectionId, ip);
      }
    } finally {
      isProcessing = false;
      if (requestQueue.length > 0) {
        setTimeout(processQueue, 50); // Small delay between processing
      }
    }
  };

  const fetchPowerStatus = async (
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

      // Add timeout protection
      const powerStatus = await Promise.race([
        readPowerStatus(ip, 502),
        new Promise<null>((_, reject) =>
          setTimeout(
            () => reject(new Error('Power status timeout')),
            REQUEST_TIMEOUT,
          ),
        ),
      ]);

      const fetchDuration = Date.now() - startTime;
      console.log(
        `Power status fetch completed in ${fetchDuration}ms for section ${sectionId}`,
      );

      // Update last successful fetch time
      lastSuccessfulFetch[sectionId] = Date.now();

      set(state => ({
        sections: {
          ...state.sections,
          [sectionId]: {
            isPowered: powerStatus,
            lastUpdated: Date.now(),
            error: null,
          },
        },
        isLoading: false,
      }));
    } catch (error) {
      console.error(
        `Error fetching power status for section ${sectionId}:`,
        error,
      );

      if (retryCount < MAX_RETRIES) {
        const delay = Math.min(RETRY_DELAY * Math.pow(2, retryCount), 10000);
        console.log(
          `Retrying power status fetch in ${delay}ms (attempt ${
            retryCount + 1
          }/${MAX_RETRIES})`,
        );

        await new Promise(resolve => setTimeout(resolve, delay));
        delete activeRequests[sectionId];
        return fetchPowerStatus(sectionId, ip, retryCount + 1);
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
        error: `Failed to fetch power status: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }));
    } finally {
      delete activeRequests[sectionId];
    }
  };

  const setPowerStatus = async (
    sectionId: number,
    ip: string,
    status: boolean,
  ) => {
    if (!ip) return;

    try {
      // Optimistically update the UI
      set(state => ({
        sections: {
          ...state.sections,
          [sectionId]: {
            ...(state.sections[sectionId] || {}),
            isPowered: status,
            lastUpdated: Date.now(),
            error: null,
          },
        },
        isLoading: true,
        error: null,
      }));

      // Try to toggle the lamp with timeout protection
      await Promise.race([
        toggleLamp(ip, 502, status),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Toggle lamp timeout')),
            REQUEST_TIMEOUT,
          ),
        ),
      ]);

      // Update last successful fetch time
      lastSuccessfulFetch[sectionId] = Date.now();

      // Confirm the status update
      set(state => ({
        sections: {
          ...state.sections,
          [sectionId]: {
            ...(state.sections[sectionId] || {}),
            isPowered: status,
            lastUpdated: Date.now(),
            error: null,
          },
        },
        isLoading: false,
      }));
    } catch (error) {
      console.error(
        `Error toggling power status for section ${sectionId}:`,
        error,
      );

      // Revert the optimistic update on error
      set(state => ({
        sections: {
          ...state.sections,
          [sectionId]: {
            ...(state.sections[sectionId] || {}),
            isPowered: !status, // Revert to previous state
            error: error instanceof Error ? error.message : String(error),
            lastUpdated: Date.now(),
          },
        },
        isLoading: false,
        error: `Failed to toggle power status: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }));

      throw error; // Propagate error to caller
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

    // Set up polling with jitter to prevent request bunching
    const jitteredInterval = interval + Math.random() * 1000 - 500;
    pollingIntervals[sectionId] = setInterval(() => {
      if (requestQueue.length < MAX_QUEUE_SIZE) {
        requestQueue.push({
          sectionId,
          ip,
          timestamp: Date.now(),
        });
        processQueue();
      } else {
        console.warn(
          `Power status request queue full for section ${sectionId}`,
        );
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
    delete lastSuccessfulFetch[sectionId];
  };

  const cleanup = () => {
    Object.keys(pollingIntervals).forEach(sectionId => {
      stopPolling(Number(sectionId));
    });
    activeRequests = {};
    requestQueue = [];
    lastSuccessfulFetch = {};
    if (appStateListener) {
      appStateListener.remove();
      appStateListener = null;
    }
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
      appStateListener = AppState.addEventListener('change', nextAppState => {
        if (nextAppState === 'active') {
          initialize();
        } else if (nextAppState === 'background') {
          cleanup();
        }
      });
    } catch (error) {
      console.error('Error initializing power status store:', error);
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
    setPowerStatus,
  };
});

export default useSectionsPowerStatusStore;
