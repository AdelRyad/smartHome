import {create} from 'zustand';
import {
  readCleaningHoursSetpoint,
  readSingleLampCleaningRunHours,
} from './modbus';
import {getSectionsWithStatus} from './db';
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

const POLLING_INTERVAL = 15000; // 15 seconds
const INITIAL_DELAY = 2000; // 2 second delay before first request
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const useCleaningHoursStore = create<CleaningHoursState>((set, get) => {
  const pollingIntervals: Record<number, NodeJS.Timeout> = {};
  let appStateListener: ReturnType<typeof AppState.addEventListener> | null =
    null;
  let isFirstRequest = true;

  const fetchCleaningHours = async (
    sectionId: number,
    ip: string,
    retryCount = 0,
  ) => {
    if (!ip) return;

    try {
      // Add delay for the first request only
      if (isFirstRequest) {
        await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY));
        isFirstRequest = false;
      }

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

      const [setpoint, currentHours] = await Promise.all([
        readCleaningHoursSetpoint(ip, 502),
        readSingleLampCleaningRunHours(ip, 502),
      ]);

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
            error: null,
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
        return fetchCleaningHours(sectionId, ip, retryCount + 1);
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
      if (pollingIntervals[sectionId]) {
        clearInterval(pollingIntervals[sectionId]);
        delete pollingIntervals[sectionId];
      }
    };

    stopPolling(sectionId);
    pollingIntervals[sectionId] = setInterval(() => {
      fetchCleaningHours(sectionId, ip);
    }, interval);
    return () => stopPolling(sectionId);
  };

  const stopAllPolling = () => {
    Object.keys(pollingIntervals).forEach(sectionId => {
      const stopPolling = (sectionId: number) => {
        if (pollingIntervals[sectionId]) {
          clearInterval(pollingIntervals[sectionId]);
          delete pollingIntervals[sectionId];
        }
      };
      stopPolling(Number(sectionId));
    });
  };

  const cleanup = () => {
    stopAllPolling();
    if (appStateListener) {
      appStateListener.remove();
      appStateListener = null;
    }
  };

  // Initialize when store is created
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
      console.log('sections', sections);

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
