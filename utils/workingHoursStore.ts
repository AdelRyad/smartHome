import {create} from 'zustand';
import {readLampHours, readLifeHoursSetpoint} from './modbus';
import {getSectionsWithStatus} from './db';

interface WorkingHoursState {
  workingHours: Record<
    number,
    Record<number, {currentHours: number | null; maxHours: number | null}>
  >;
  isLoading: boolean;
  error: string | null;
  fetchWorkingHours: (sectionId: number, ip: string) => Promise<void>;
  startPolling: (
    sectionId: number,
    ip: string,
    interval?: number,
  ) => () => void;
}

const useWorkingHoursStore = create<WorkingHoursState>((set, get) => {
  let pollingIntervals: Record<number, NodeJS.Timeout> = {};

  const fetchWorkingHours = async (sectionId: number, ip: string) => {
    if (!ip) {
      set({error: 'No IP address provided'});
      return;
    }

    set({isLoading: true, error: null});

    try {
      const updatedWorkingHours: Record<
        number,
        {currentHours: number | null; maxHours: number | null}
      > = {};

      // Fetch max hours for the section
      const maxHours = await readLifeHoursSetpoint(ip, 502).catch(() => null);

      // Fetch hours for each lamp in parallel
      const lampPromises = [1, 2, 3, 4].map(async lampId => {
        try {
          const result = await readLampHours(ip, 502, lampId);
          return {
            lampId,
            data: {currentHours: result.currentHours, maxHours},
          };
        } catch (error) {
          return {
            lampId,
            data: {currentHours: null, maxHours},
          };
        }
      });

      const lampResults = await Promise.all(lampPromises);
      lampResults.forEach(({lampId, data}) => {
        updatedWorkingHours[lampId] = data;
      });

      set(state => ({
        workingHours: {
          ...state.workingHours,
          [sectionId]: updatedWorkingHours,
        },
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: `Failed to fetch working hours: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isLoading: false,
      });
    }
  };

  const startPolling = (sectionId: number, ip: string, interval = 10000) => {
    // Clear existing interval if any
    if (pollingIntervals[sectionId]) {
      clearInterval(pollingIntervals[sectionId]);
    }

    // Initial fetch
    fetchWorkingHours(sectionId, ip);

    // Set up polling
    pollingIntervals[sectionId] = setInterval(
      () => fetchWorkingHours(sectionId, ip),
      interval,
    );

    // Return cleanup function
    return () => {
      if (pollingIntervals[sectionId]) {
        clearInterval(pollingIntervals[sectionId]);
        delete pollingIntervals[sectionId];
      }
    };
  };

  // Initial data fetch
  const initialize = async () => {
    try {
      const sections = await new Promise<any[]>(resolve => {
        getSectionsWithStatus(resolve);
      });

      sections.forEach(section => {
        if (section.ip) {
          startPolling(section.id, section.ip, 15000);
        }
      });
    } catch (error) {
      console.error('Error initializing sections:', error);
    }
  };

  initialize();

  return {
    workingHours: {},
    isLoading: false,
    error: null,
    fetchWorkingHours,
    startPolling,
  };
});

export default useWorkingHoursStore;
