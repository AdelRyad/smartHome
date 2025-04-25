import {create} from 'zustand';
import {readDPS} from './modbus';
import {getSectionsWithStatus} from './db';

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

const POLLING_INTERVAL = 5000; // 5 seconds

const useDpsPressureStore = create<DPSState>((set, get) => {
  const pollingIntervals: Record<number, NodeJS.Timeout> = {};

  const fetchDpsStatus = async (sectionId: number, ip: string) => {
    if (!ip) return;

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

      const dpsStatus = await new Promise<boolean | null>(resolve => {
        readDPS(ip, 502, () => {}, resolve);
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

  const startPolling = (
    sectionId: number,
    ip: string,
    interval = POLLING_INTERVAL,
  ) => {
    stopPolling(sectionId);

    // Initial fetch
    fetchDpsStatus(sectionId, ip);

    // Set up polling
    pollingIntervals[sectionId] = setInterval(() => {
      fetchDpsStatus(sectionId, ip);
    }, interval);

    return () => stopPolling(sectionId);
  };

  const stopPolling = (sectionId: number) => {
    if (pollingIntervals[sectionId]) {
      clearInterval(pollingIntervals[sectionId]);
      delete pollingIntervals[sectionId];
    }
  };

  const cleanup = () => {
    Object.keys(pollingIntervals).forEach(sectionId => {
      stopPolling(Number(sectionId));
    });
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

export default useDpsPressureStore;
