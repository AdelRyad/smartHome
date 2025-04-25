import {create} from 'zustand';
import {readLampHours, readLifeHoursSetpoint} from './modbus';
import {getSectionsWithStatus} from './db';
import {AppState} from 'react-native';

interface LampHoursData {
  currentHours: number | null;
  maxHours: number | null;
  lastUpdated?: number;
  error?: string | null;
}

interface WorkingHoursState {
  workingHours: Record<number, Record<number, LampHoursData>>;
  isLoading: boolean;
  error: string | null;
  fetchWorkingHours: (sectionId: number, ip: string) => Promise<void>;
  startPolling: (
    sectionId: number,
    ip: string,
    interval?: number,
  ) => () => void;
  stopAllPolling: () => void;
  cleanup: () => void;
}

const POLLING_INTERVAL = 10000; // 10 seconds
const LAMP_REQUEST_DELAY = 500; // Increased to 500ms between lamp requests
const INITIAL_DELAY = 2000; // 2 second delay before first request
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const useWorkingHoursStore = create<WorkingHoursState>((set, get) => {
  const pollingIntervals: Record<number, NodeJS.Timeout> = {};
  let appStateListener: ReturnType<typeof AppState.addEventListener> | null =
    null;
  let isFirstRequest = true;

  const fetchWorkingHours = async (
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
        workingHours: {
          ...state.workingHours,
          [sectionId]: {
            ...state.workingHours[sectionId],
            ...Object.fromEntries(
              [1, 2, 3, 4].map(lampId => [
                lampId,
                {
                  ...(state.workingHours[sectionId]?.[lampId] || {}),
                  error: null,
                },
              ]),
            ),
          },
        },
        isLoading: true,
        error: null,
      }));

      let maxHours = null;
      try {
        maxHours = await readLifeHoursSetpoint(ip, 502);
      } catch (error) {
        console.warn(`Failed to read life hours setpoint: ${error}`);
      }

      const updatedWorkingHours: Record<number, LampHoursData> = {};

      for (const lampId of [1, 2, 3, 4]) {
        try {
          const result = await readLampHours(ip, 502, lampId);
          updatedWorkingHours[lampId] = {
            currentHours: result.currentHours,
            maxHours,
            error: null,
            lastUpdated: Date.now(),
          };
        } catch (error: any) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          // Only retry on connection errors
          if (
            errorMessage.includes('Socket closed') ||
            errorMessage.includes('timeout')
          ) {
            if (retryCount < MAX_RETRIES) {
              console.log(
                `[Working Hours] Retrying fetch for lamp ${lampId} (attempt ${
                  retryCount + 1
                }/${MAX_RETRIES})...`,
              );
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              return fetchWorkingHours(sectionId, ip, retryCount + 1);
            }
          }

          if (error.message?.includes('Modbus Exception 4')) {
            updatedWorkingHours[lampId] = {
              currentHours: null,
              maxHours,
              error: 'Device failure - lamp may be offline',
              lastUpdated: Date.now(),
            };
          } else {
            updatedWorkingHours[lampId] = {
              currentHours: null,
              maxHours,
              error: errorMessage,
              lastUpdated: Date.now(),
            };
          }
        }

        // Always wait between lamp requests, even if there was an error
        if (lampId < 4) {
          await new Promise(resolve => setTimeout(resolve, LAMP_REQUEST_DELAY));
        }
      }

      set(state => ({
        workingHours: {
          ...state.workingHours,
          [sectionId]: updatedWorkingHours,
        },
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      console.error(
        `Failed to fetch working hours for section ${sectionId}:`,
        error,
      );

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Retry on connection errors
      if (
        (errorMessage.includes('Socket closed') ||
          errorMessage.includes('timeout')) &&
        retryCount < MAX_RETRIES
      ) {
        console.log(
          `[Working Hours] Retrying fetch (attempt ${
            retryCount + 1
          }/${MAX_RETRIES})...`,
        );
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchWorkingHours(sectionId, ip, retryCount + 1);
      }

      set({
        error: `Failed to fetch working hours: ${errorMessage}`,
        isLoading: false,
      });
    }
  };

  const stopPolling = (sectionId: number) => {
    if (pollingIntervals[sectionId]) {
      clearInterval(pollingIntervals[sectionId]);
      delete pollingIntervals[sectionId];
    }
  };

  const startPolling = (
    sectionId: number,
    ip: string,
    interval = POLLING_INTERVAL,
  ) => {
    stopPolling(sectionId);

    fetchWorkingHours(sectionId, ip);

    pollingIntervals[sectionId] = setInterval(() => {
      fetchWorkingHours(sectionId, ip);
    }, interval);

    return () => stopPolling(sectionId);
  };

  const stopAllPolling = () => {
    Object.keys(pollingIntervals).forEach(sectionId => {
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
    workingHours: {},
    isLoading: false,
    error: null,
    fetchWorkingHours,
    startPolling,
    stopAllPolling,
    cleanup,
  };
});

export default useWorkingHoursStore;
