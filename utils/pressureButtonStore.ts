import {create} from 'zustand';
import {readPressureButton} from './modbus';
import {getSectionsWithStatus} from './db';
import {AppState} from 'react-native';
import modbusConnectionManager from './modbusConnectionManager';

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

const ACTIVE_POLLING_INTERVAL = 10000; // 20 seconds - match other polling intervals
const MAX_QUEUE_SIZE = 30; // Smaller queue size since updates are more frequent

const GLOBAL_POLLING_REGISTRY: Record<string, NodeJS.Timeout> = {};
function getPollingKey(sectionId: number) {
  return `pressureButton:${sectionId}`;
}

const usePressureButtonStore = create<PressureButtonState>((set, _get) => {
  let activeRequests: Record<number, boolean> = {};
  let requestQueue: Array<{sectionId: number; ip: string; timestamp: number}> =
    [];
  let isProcessing = false;
  let appStateListener: ReturnType<typeof AppState.addEventListener> | null =
    null;

  async function getSafeInterval(defaultInterval: number) {
    // @ts-ignore: performance.memory is not standard in all environments
    if (global && global.performance && global.performance.memory) {
      // @ts-ignore
      const {jsHeapSizeLimit, usedJSHeapSize} = global.performance.memory;
      if (usedJSHeapSize / jsHeapSizeLimit > 0.8) {
        return defaultInterval * 2;
      }
    }
    return defaultInterval;
  }

  const processQueue = async () => {
    if (isProcessing || requestQueue.length === 0) {
      return;
    }

    isProcessing = true;

    try {
      // Sort and aggressively clean queue due to frequent updates
      requestQueue.sort((a, b) => a.timestamp - b.timestamp);
      const now = Date.now();
      requestQueue = requestQueue.filter(req => now - req.timestamp < 5000); // Drop requests older than 5s

      if (requestQueue.length === 0) {
        return;
      }

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

  const fetchButtonStatus = async (sectionId: number, ip: string) => {
    if (modbusConnectionManager.isSuspended(ip, 502)) {
      console.log(
        `[PressureButton] Skipping fetch for suspended section ${sectionId} (${ip})`,
      );
      set(state => ({
        sections: {
          ...state.sections,
          [sectionId]: {
            ...(state.sections[sectionId] || {}),
            error: 'Polling suspended due to repeated connection failures.',
            lastUpdated: Date.now(),
          },
        },
        isLoading: false,
      }));
      return;
    }

    // Always fetch the latest IP for this section before polling
    const sections = await new Promise<any[]>(resolve =>
      getSectionsWithStatus(resolve),
    );
    const section = sections.find(s => s.id === sectionId);
    const currentIp = section?.ip || ip;
    if (!currentIp || activeRequests[sectionId]) {
      return;
    }

    activeRequests[sectionId] = true;
    const startTime = Date.now();

    try {
      console.log(
        `[PressureButton] Fetching for section ${sectionId} (IP: ${currentIp})`,
      );
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
          readPressureButton(currentIp, 502, () => {}, resolve);
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
      // Do NOT overwrite the old value on error
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
      requestQueue.push({sectionId, ip, timestamp: Date.now()});
      processQueue();
    }
    getSafeInterval(interval).then(safeInterval => {
      const key = getPollingKey(sectionId);
      GLOBAL_POLLING_REGISTRY[key] = setInterval(() => {
        if (requestQueue.length < MAX_QUEUE_SIZE) {
          requestQueue.push({sectionId, ip, timestamp: Date.now()});
          processQueue();
        } else {
          console.warn(`Button request queue full for section ${sectionId}`);
        }
      }, safeInterval + Math.random() * 200 - 100);
    });
    return () => stopPolling(sectionId);
  };

  const stopPolling = (sectionId: number) => {
    const key = getPollingKey(sectionId);
    if (GLOBAL_POLLING_REGISTRY[key]) {
      clearInterval(GLOBAL_POLLING_REGISTRY[key]);
      delete GLOBAL_POLLING_REGISTRY[key];
    }
    // Clean up any pending requests
    requestQueue = requestQueue.filter(req => req.sectionId !== sectionId);
  };

  const cleanup = () => {
    Object.keys(GLOBAL_POLLING_REGISTRY)
      .filter(key => key.startsWith('pressureButton:'))
      .forEach(key => {
        clearInterval(GLOBAL_POLLING_REGISTRY[key]);
        delete GLOBAL_POLLING_REGISTRY[key];
      });
    activeRequests = {};
    requestQueue = [];
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
