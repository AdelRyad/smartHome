import {create} from 'zustand';
import {readLampHours, readLifeHoursSetpoint} from './modbus';
import {getSectionsWithStatus} from './db';

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
}

const useWorkingHoursStore = create<WorkingHoursState>((set, get) => {
  let pollingIntervals: Record<number, NodeJS.Timeout> = {};
  let activeConnections: Record<number, boolean> = {};

  // Enhanced fetch with retry logic
  const fetchWithRetry = async <T>(
    fn: () => Promise<T>,
    maxRetries = 2,
    retryDelay = 1000,
  ): Promise<T> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries - 1) {
          await new Promise(resolve =>
            setTimeout(resolve, retryDelay * (attempt + 1)),
          );
        }
      }
    }
    // throw lastError;
  };

  const fetchWorkingHours = async (sectionId: number, ip: string) => {
    if (!ip) {
      set({error: 'No IP address provided'});
      return;
    }

    // Skip if already fetching for this section
    if (activeConnections[sectionId]) return;
    activeConnections[sectionId] = true;

    set(state => ({
      isLoading: true,
      error: null,
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
    }));

    try {
      // Fetch max hours with retry
      const maxHours = await fetchWithRetry(() =>
        readLifeHoursSetpoint(ip, 502),
      ).catch(() => null);

      // Process lamps sequentially with delay between requests
      const updatedWorkingHours: Record<number, LampHoursData> = {};

      for (const lampId of [1, 2, 3, 4]) {
        try {
          const result = await fetchWithRetry(() =>
            readLampHours(ip, 502, lampId),
          );
          updatedWorkingHours[lampId] = {
            currentHours: result.currentHours,
            maxHours,
            lastUpdated: Date.now(),
          };

          // Small delay between lamp requests
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          updatedWorkingHours[lampId] = {
            currentHours: null,
            maxHours,
            error: error instanceof Error ? error.message : 'Unknown error',
            lastUpdated: Date.now(),
          };
        }
      }

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
    } finally {
      delete activeConnections[sectionId];
    }
  };

  const startPolling = (sectionId: number, ip: string, interval = 10000) => {
    // Clear existing interval if any
    if (pollingIntervals[sectionId]) {
      clearInterval(pollingIntervals[sectionId]);
    }

    // Initial fetch
    fetchWorkingHours(sectionId, ip);

    // Set up polling with jitter to avoid request bursts
    const jitteredInterval = interval + Math.random() * 2000 - 1000;
    pollingIntervals[sectionId] = setInterval(
      () => fetchWorkingHours(sectionId, ip),
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

  const stopAllPolling = () => {
    Object.values(pollingIntervals).forEach(clearInterval);
    pollingIntervals = {};
  };

  // Initialize with staggered loading to avoid connection floods
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

  initialize();

  return {
    workingHours: {},
    isLoading: false,
    error: null,
    fetchWorkingHours,
    startPolling,
    stopAllPolling,
  };
});

export default useWorkingHoursStore;
