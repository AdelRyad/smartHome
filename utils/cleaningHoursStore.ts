import {create} from 'zustand';
import {
  readCleaningHoursSetpoint,
  readSingleLampCleaningRunHours,
} from './modbus';
import {getSectionsWithStatus} from './db';

interface CleaningHoursState {
  remainingCleaningHours: Record<
    number,
    {
      setpoint: number | null;
      current: number | null;
      remaining: number | null;
      loading: boolean;
      error: string | null;
      lastUpdated: number | null;
    }
  >;
  fetchStatus: {
    loading: boolean;
    error: string | null;
  };
  setRemainingCleaningHours: (sectionId: number, hours: number | null) => void;
  resetCleaningHours: (sectionId?: number) => void;
  startFetching: (
    sectionId: number,
    ip: string,
    interval: number,
  ) => () => void;
}

const useCleaningHoursStore = create<CleaningHoursState>((set, get) => {
  let pollingIntervals: Record<number, NodeJS.Timeout> = {};
  const fetchCleaningHours = async (
    sectionId: number,
    ip: string,
    retryCount = 0,
  ) => {
    try {
      set(state => ({
        remainingCleaningHours: {
          ...state.remainingCleaningHours,
          [sectionId]: {
            ...(state.remainingCleaningHours[sectionId] || {}),
            loading: true,
            error: null,
          },
        },
      }));

      // Sequential requests instead of Promise.all
      const setpoint = await readCleaningHoursSetpoint(ip, 502);
      await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between requests
      const currentHours = await readSingleLampCleaningRunHours(ip, 502);

      const remaining =
        setpoint !== null && currentHours !== null
          ? Math.max(0, Math.floor(setpoint - currentHours)) // Ensure non-negative
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
      }));
    } catch (error) {
      if (retryCount < 2) {
        await new Promise(resolve =>
          setTimeout(resolve, 1000 * (retryCount + 1)),
        );
        return fetchCleaningHours(sectionId, ip, retryCount + 1);
      }

      set(state => ({
        remainingCleaningHours: {
          ...state.remainingCleaningHours,
          [sectionId]: {
            ...(state.remainingCleaningHours[sectionId] || {}),
            loading: false,
            error: error.message,
          },
        },
        fetchStatus: {
          loading: false,
          error: `Section ${sectionId}: ${error.message}`,
        },
      }));
    }
  };

  const fetchAllSectionsData = async () => {
    try {
      set({fetchStatus: {loading: true, error: null}});
      const sections = await new Promise<any[]>(resolve => {
        getSectionsWithStatus(resolve);
      });

      // Process sections sequentially
      for (const section of sections) {
        if (section.ip) {
          await fetchCleaningHours(section.id, section.ip);
          await new Promise(resolve => setTimeout(resolve, 300)); // Delay between sections
        }
      }
    } catch (error) {
      set({
        fetchStatus: {
          loading: false,
          error: `Global fetch error: ${error.message}`,
        },
      });
    } finally {
      set({fetchStatus: {loading: false, error: null}});
    }
  };

  const startPolling = (sectionId: number, ip: string, interval = 10000) => {
    // Clear existing interval if any
    if (pollingIntervals[sectionId]) {
      clearInterval(pollingIntervals[sectionId]);
    }

    // Initial fetch
    fetchCleaningHours(sectionId, ip);

    // Set up polling with jitter to avoid request bursts
    const jitteredInterval = interval + Math.random() * 2000 - 1000;
    pollingIntervals[sectionId] = setInterval(
      () => fetchCleaningHours(sectionId, ip),
      jitteredInterval,
    );

    // Return cleanup function
    return () => {
      if (pollingIntervals[sectionId]) {
        clearInterval(pollingIntervals[sectionId]);
        delete pollingIntervals[sectionId];
      }
    };
  };
  // Throttled version of fetchAllSectionsData
  const initialize = async () => {
    try {
      const sections = await new Promise<any[]>(resolve => {
        getSectionsWithStatus(resolve);
      });

      // Start with delay between sections
      sections.forEach((section, index) => {
        if (section.ip) {
          setTimeout(
            () => startPolling(section.id, section.ip, 15000),
            index * 3000, // 3s delay between each section initialization
          );
        }
      });
    } catch (error) {
      console.error('Error initializing sections:', error);
    }
  };

  // Define startFetching function
  const startFetching = (sectionId: number, ip: string, interval: number) => {
    const intervalId = setInterval(
      () => fetchCleaningHours(sectionId, ip),
      interval,
    );
    return () => clearInterval(intervalId); // Return a cleanup function
  };

  // Initialize
  initialize();

  return {
    remainingCleaningHours: {},
    setRemainingCleaningHours: (sectionId, hours) =>
      set(state => ({
        remainingCleaningHours: {
          ...state.remainingCleaningHours,
          [sectionId]: {
            ...state.remainingCleaningHours[sectionId],
            remaining: hours,
          },
        },
      })),
    resetCleaningHours: sectionId =>
      set(state => {
        if (sectionId !== undefined) {
          const updatedSections = {...state.remainingCleaningHours};
          delete updatedSections[sectionId];
          return {remainingCleaningHours: updatedSections};
        }
        return {remainingCleaningHours: {}};
      }),
    startFetching,
  };
});

export default useCleaningHoursStore;
