import {create} from 'zustand';
import {readDPS} from './modbus';
import {getSectionsWithStatus} from './db';
import {AppState} from 'react-native';
import modbusConnectionManager from './modbusConnectionManager';

interface DPSState {
  sections: Record<
    number,
    {
      isOk: boolean | null;
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

const POLLING_INTERVAL = 10000; // 20 seconds

const GLOBAL_POLLING_REGISTRY: Record<string, NodeJS.Timeout> = {};
function getPollingKey(sectionId: number) {
  return `dpsPressure:${sectionId}`;
}

const useDpsPressureStore = create<DPSState>((set, _get) => {
  let appStateListener: ReturnType<typeof AppState.addEventListener> | null =
    null;

  const fetchDpsStatus = async (sectionId: number, ip: string) => {
    if (modbusConnectionManager.isSuspended(ip, 502)) {
      console.log(
        `[DPS] Skipping fetch for suspended section ${sectionId} (${ip})`,
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
    if (!currentIp) {
      return;
    }

    try {
      console.log(`[DPS] Fetching for section ${sectionId} (IP: ${currentIp})`);
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

      const dpsStatus = await new Promise<boolean | null>(resolve => {
        readDPS(currentIp, 502, () => {}, resolve);
      });

      set(state => ({
        sections: {
          ...state.sections,
          [sectionId]: {
            isOk: dpsStatus,
            lastUpdated: Date.now(),
            error: null,
          },
        },
        isLoading: false,
      }));
    } catch (error) {
      console.error(
        `Error fetching DPS status for section ${sectionId}:`,
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
        error: `Failed to fetch DPS status: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }));
    }
  };

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
    getSafeInterval(interval).then(safeInterval => {
      const key = getPollingKey(sectionId);
      GLOBAL_POLLING_REGISTRY[key] = setInterval(() => {
        fetchDpsStatus(sectionId, ip);
      }, safeInterval);
    });
    fetchDpsStatus(sectionId, ip);
    return () => stopPolling(sectionId);
  };

  const cleanup = () => {
    Object.keys(GLOBAL_POLLING_REGISTRY)
      .filter(key => key.startsWith('dpsPressure:'))
      .forEach(key => {
        clearInterval(GLOBAL_POLLING_REGISTRY[key]);
        delete GLOBAL_POLLING_REGISTRY[key];
      });
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

export default useDpsPressureStore;
