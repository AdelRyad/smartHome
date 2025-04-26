import {create} from 'zustand';
import {
  readCleaningHoursSetpoint,
  readSingleLampCleaningRunHours,
} from './modbus';
import {getSectionsWithStatus, getDevicesForSection} from './db';
import {AppState} from 'react-native';

interface CleaningHoursData {
  setpoint: number | null;
  current: number | null;
  remaining: number | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

interface CleaningHoursState {
  remainingCleaningHours: Record<number, CleaningHoursData>;
  isLoading: boolean;
  error: string | null;
  fetchCleaningHours: (sectionId: number, ip: string) => Promise<void>;
  startPolling: (
    sectionId: number,
    ip: string,
    interval?: number,
  ) => () => void;
  stopAllPolling: () => void;
  cleanup: () => void;
}

const POLLING_INTERVAL = 20000; // 20 seconds
const INITIAL_DELAY = 2000; // 2 second delay before first request
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const GLOBAL_POLLING_REGISTRY: Record<string, NodeJS.Timeout> = {};
function getPollingKey(sectionId: number) {
  return `cleaningHours:${sectionId}`;
}

const useCleaningHoursStore = create<CleaningHoursState>((set, _get) => {
  let appStateListener: ReturnType<typeof AppState.addEventListener> | null =
    null;
  let isFirstRequest = true;
  let sectionDiscoveryInterval: NodeJS.Timeout | null = null;

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

  const fetchCleaningHours = async (
    sectionId: number,
    ip: string,
    retryCount = 0,
  ) => {
    // Always fetch the latest IP for this section before polling
    const sections = await new Promise<any[]>(resolve =>
      getSectionsWithStatus(resolve),
    );
    const section = sections.find(s => s.id === sectionId);
    const currentIp = section?.ip || ip;
    if (!currentIp) return;

    try {
      // Add delay for the first request only
      if (isFirstRequest) {
        await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY));
        isFirstRequest = false;
      }

      console.log(
        `[CleaningHours] Fetching for section ${sectionId} (IP: ${currentIp})`,
      );

      set(state => ({
        remainingCleaningHours: {
          ...state.remainingCleaningHours,
          [sectionId]: {
            ...(state.remainingCleaningHours[sectionId] || {}),
            loading: true,
            error: null,
          },
        },
        isLoading: true,
        error: null,
      }));

      // Fetch device IDs for this section
      const devices = await new Promise<any[]>(resolve =>
        getDevicesForSection(sectionId, resolve),
      );
      let setpoint: number | null = null;
      let currentHours: number | null = null;
      let errorMessage: string | null = null;
      if (devices.length > 0) {
        try {
          setpoint = await readCleaningHoursSetpoint(currentIp, 502);
          currentHours = await readSingleLampCleaningRunHours(currentIp, 502);
        } catch (error: any) {
          errorMessage = error instanceof Error ? error.message : String(error);
        }
      }
      const remaining =
        setpoint !== null && currentHours !== null
          ? Math.max(0, Math.floor(setpoint - currentHours))
          : null;

      set(state => ({
        remainingCleaningHours: {
          ...state.remainingCleaningHours,
          [sectionId]: {
            setpoint,
            current: currentHours,
            remaining,
            loading: false,
            error: errorMessage,
            lastUpdated: Date.now(),
          },
        },
        isLoading: false,
      }));
    } catch (error) {
      console.error(
        `Error fetching cleaning hours for section ${sectionId}:`,
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Retry logic for timeouts
      if (errorMessage.includes('timeout') && retryCount < MAX_RETRIES) {
        console.log(
          `Retrying cleaning hours fetch (attempt ${
            retryCount + 1
          }/${MAX_RETRIES})...`,
        );
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchCleaningHours(sectionId, currentIp, retryCount + 1);
      }

      set(state => ({
        remainingCleaningHours: {
          ...state.remainingCleaningHours,
          [sectionId]: {
            ...(state.remainingCleaningHours[sectionId] || {}),
            loading: false,
            error: errorMessage,
          },
        },
        isLoading: false,
        error: `Failed to fetch cleaning hours for section ${sectionId}: ${errorMessage}`,
      }));
    }
  };

  const startPolling = (
    sectionId: number,
    ip: string,
    interval = POLLING_INTERVAL,
  ) => {
    const stopPolling = (sectionId: number) => {
      const key = getPollingKey(sectionId);
      if (GLOBAL_POLLING_REGISTRY[key]) {
        clearInterval(GLOBAL_POLLING_REGISTRY[key]);
        delete GLOBAL_POLLING_REGISTRY[key];
      }
    };

    stopPolling(sectionId);
    getSafeInterval(interval).then(safeInterval => {
      const key = getPollingKey(sectionId);
      GLOBAL_POLLING_REGISTRY[key] = setInterval(() => {
        fetchCleaningHours(sectionId, ip);
      }, safeInterval);
    });
    fetchCleaningHours(sectionId, ip);
    return () => stopPolling(sectionId);
  };

  const stopAllPolling = () => {
    Object.keys(GLOBAL_POLLING_REGISTRY)
      .filter(key => key.startsWith('cleaningHours:'))
      .forEach(key => {
        clearInterval(GLOBAL_POLLING_REGISTRY[key]);
        delete GLOBAL_POLLING_REGISTRY[key];
      });
  };

  const cleanup = () => {
    stopAllPolling();
    if (appStateListener) {
      appStateListener.remove();
      appStateListener = null;
    }
    if (sectionDiscoveryInterval) {
      clearInterval(sectionDiscoveryInterval);
      sectionDiscoveryInterval = null;
    }
  };

  const initialize = async () => {
    cleanup();

    try {
      const sections = await new Promise<any[]>(resolve => {
        getSectionsWithStatus(resolve);
      });

      // Add null/undefined check for sections
      if (!sections || !Array.isArray(sections)) {
        throw new Error('Invalid sections data received');
      }
      console.log(
        '[Polling Init] Sections:',
        sections.map(s => ({id: s.id, ip: s.ip})),
      );

      sections.forEach(section => {
        // Add proper null checks for section and its properties
        if (section?.id && section?.ip) {
          startPolling(section.id, section.ip);
        }
      });

      // Handle app state changes
      appStateListener = AppState.addEventListener('change', nextAppState => {
        if (nextAppState === 'active') {
          initialize();
        } else if (nextAppState === 'background') {
          cleanup();
        }
      });

      // Periodically check for new sections every 60 seconds
      if (sectionDiscoveryInterval) clearInterval(sectionDiscoveryInterval);
      sectionDiscoveryInterval = setInterval(async () => {
        const latestSections = await new Promise<any[]>(resolve => {
          getSectionsWithStatus(resolve);
        });
        latestSections.forEach(section => {
          if (section?.id && section?.ip) {
            const key = getPollingKey(section.id);
            if (!GLOBAL_POLLING_REGISTRY[key]) {
              console.log(
                '[Polling Init] Detected new section, starting polling:',
                section.id,
                section.ip,
              );
              startPolling(section.id, section.ip);
            }
          }
        });
      }, 60000);
    } catch (error) {
      console.error('Error initializing cleaning hours store:', error);
      set({
        error: `Initialization failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isLoading: false,
      });
    }
  };
  initialize();

  return {
    remainingCleaningHours: {},
    isLoading: false,
    error: null,
    fetchCleaningHours,
    startPolling,
    stopAllPolling,
    cleanup,
  };
});

export default useCleaningHoursStore;
