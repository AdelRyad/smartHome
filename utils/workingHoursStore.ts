import {create} from 'zustand';
import {readLampHours, readLifeHoursSetpoint} from './modbus';
import {getSectionsWithStatus, getDevicesForSection} from './db';
import {AppState} from 'react-native';
import modbusConnectionManager from './modbusConnectionManager';

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

const POLLING_INTERVAL = 10000; // 20 seconds
const LAMP_REQUEST_DELAY = 500; // Increased to 500ms between lamp requests
const INITIAL_DELAY = 2000; // 2 second delay before first request
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const GLOBAL_POLLING_REGISTRY: Record<string, NodeJS.Timeout> = {};

function getPollingKey(sectionId: number) {
  return `workingHours:${sectionId}`;
}

const useWorkingHoursStore = create<WorkingHoursState>((set, _get) => {
  let appStateListener: ReturnType<typeof AppState.addEventListener> | null =
    null;
  let isFirstRequest = true;

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

  const fetchWorkingHours = async (
    sectionId: number,
    ip: string,
    retryCount = 0,
  ) => {
    if (modbusConnectionManager.isSuspended(ip, 502)) {
      console.log(
        `[WorkingHours] Skipping fetch for suspended section ${sectionId} (${ip})`,
      );
      set(state => ({
        workingHours: {
          ...state.workingHours,
          [sectionId]: {
            ...state.workingHours[sectionId],
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

    if (!currentIp) {
      return;
    }

    try {
      if (isFirstRequest) {
        await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY));
        isFirstRequest = false;
      }

      console.log(
        `[WorkingHours] Fetching for section ${sectionId} (IP: ${currentIp})`,
      );

      set(state => ({
        workingHours: {
          ...state.workingHours,
          [sectionId]: {
            ...state.workingHours[sectionId],
          },
        },
        isLoading: true,
        error: null,
      }));

      let maxHours = null;
      try {
        maxHours = await readLifeHoursSetpoint(currentIp, 502);
        console.log(`Max hours setpoint for section ${sectionId}: ${maxHours}`);
      } catch (error) {
        console.warn(`Failed to read life hours setpoint: ${error}`);
      }

      // Fetch device IDs for this section
      const devices = await new Promise<any[]>(resolve =>
        getDevicesForSection(sectionId, resolve),
      );
      const updatedWorkingHours: Record<number, LampHoursData> = {};

      for (let i = 0; i < 4; i++) {
        const device = devices[i];
        const lampIndex = i + 1;

        try {
          const result = await readLampHours(currentIp, 502, lampIndex);
          console.log(
            `Lamp ${lampIndex} hours for section ${sectionId}: ${result.currentHours}`,
          );

          updatedWorkingHours[device.id] = {
            currentHours: result.currentHours,
            maxHours,
            error: null,
            lastUpdated: Date.now(),
          };
        } catch (error: any) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          if (
            errorMessage.includes('Socket closed') ||
            errorMessage.includes('timeout')
          ) {
            if (retryCount < MAX_RETRIES) {
              console.log(
                `[Working Hours] Retrying fetch for lamp ${
                  device.id
                } (attempt ${retryCount + 1}/${MAX_RETRIES})...`,
              );
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              return fetchWorkingHours(sectionId, currentIp, retryCount + 1);
            }
          }

          if (error.message?.includes('Modbus Exception 4')) {
            updatedWorkingHours[device.id] = {
              currentHours: null,
              maxHours,
              error: 'Device failure - lamp may be offline',
              lastUpdated: Date.now(),
            };
          } else {
            updatedWorkingHours[device.id] = {
              currentHours: null,
              maxHours,
              error: errorMessage,
              lastUpdated: Date.now(),
            };
          }
        }
        // Always wait between lamp requests, even if there was an error
        await new Promise(resolve => setTimeout(resolve, LAMP_REQUEST_DELAY));
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
        return fetchWorkingHours(sectionId, currentIp, retryCount + 1);
      }

      set({
        error: `Failed to fetch working hours: ${errorMessage}`,
        isLoading: false,
      });
    }
  };

  const stopPolling = (sectionId: number) => {
    const key = getPollingKey(sectionId);
    if (GLOBAL_POLLING_REGISTRY[key]) {
      clearInterval(GLOBAL_POLLING_REGISTRY[key]);
      delete GLOBAL_POLLING_REGISTRY[key];
    }
  };

  const startPolling = (
    sectionId: number,
    ip: string,
    interval = POLLING_INTERVAL,
  ) => {
    stopPolling(sectionId);
    fetchWorkingHours(sectionId, ip);
    getSafeInterval(interval).then(safeInterval => {
      const key = getPollingKey(sectionId);
      GLOBAL_POLLING_REGISTRY[key] = setInterval(() => {
        fetchWorkingHours(sectionId, ip);
      }, safeInterval);
    });
    return () => stopPolling(sectionId);
  };

  const stopAllPolling = () => {
    Object.keys(GLOBAL_POLLING_REGISTRY)
      .filter(key => key.startsWith('workingHours:'))
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

      console.log(
        '[Polling Init] Sections:',
        sections.map(s => ({id: s.id, ip: s.ip})),
      );

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
