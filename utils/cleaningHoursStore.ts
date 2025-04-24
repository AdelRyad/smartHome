import {create} from 'zustand';
import {
  readCleaningHoursSetpoint,
  readSingleLampCleaningRunHours,
} from './modbus';
import {getSectionsWithStatus} from './db';

interface CleaningHoursState {
  remainingCleaningHours: Record<
    number,
    {setpoint: number | null; current: number | null; remaining: number | null}
  >;
  setRemainingCleaningHours: (sectionId: number, hours: number | null) => void;
  resetCleaningHours: (sectionId?: number) => void;
  startFetching: (
    sectionId: number,
    ip: string,
    interval: number,
  ) => () => void;
}

const useCleaningHoursStore = create<CleaningHoursState>(set => {
  const fetchCleaningHours = async (sectionId: number, ip: string) => {
    try {
      const [setpoint, currentHours] = await Promise.all([
        readCleaningHoursSetpoint(ip, 502),
        readSingleLampCleaningRunHours(ip, 502),
      ]);
      const remaining =
        setpoint !== null && currentHours !== null
          ? Math.floor(setpoint - currentHours)
          : 0;
      set(state => ({
        remainingCleaningHours: {
          ...state.remainingCleaningHours,
          [sectionId]: {
            setpoint: setpoint ?? null,
            current: currentHours ?? null,
            remaining: remaining,
          },
        },
      }));
    } catch (error) {
      console.error(
        `Error fetching cleaning hours for section ${sectionId}:`,
        error,
      );
    }
  };

  const fetchAllSectionsData = async () => {
    try {
      const sections = await new Promise<any[]>(resolve => {
        getSectionsWithStatus(resolve);
      });
      for (const section of sections) {
        if (section.ip) {
          fetchCleaningHours(section.id, section.ip);
        }
      }
    } catch (error) {
      console.error('Error fetching all cleaning hours data:', error);
    }
  };

  const startFetching = (sectionId: number, ip: string, interval: number) => {
    fetchCleaningHours(sectionId, ip);
    const intervalId = setInterval(
      () => fetchCleaningHours(sectionId, ip),
      interval,
    );
    return () => clearInterval(intervalId);
  };

  fetchAllSectionsData();
  setInterval(fetchAllSectionsData, 5 * 1000);

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
