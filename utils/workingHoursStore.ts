import {create} from 'zustand';
import {readLampHours, readLifeHoursSetpoint} from './modbus';
import {getSectionsWithStatus} from './db';

interface WorkingHoursState {
  workingHours: Record<
    number,
    Record<number, {currentHours: number | null; maxHours: number | null}>
  >; // Section ID -> Lamp ID -> { currentHours, maxHours }
  setWorkingHours: (
    sectionId: number,
    lampId: number,
    currentHours: number | null,
    maxHours: number | null,
  ) => void;
  resetWorkingHours: (sectionId?: number) => void;
  startFetching: (
    sectionId: number,
    ip: string,
    interval: number,
  ) => () => void;
}

const useWorkingHoursStore = create<WorkingHoursState>(set => {
  const fetchWorkingHours = async (sectionId: number, ip: string) => {
    try {
      const updatedWorkingHours: Record<
        number,
        {currentHours: number | null; maxHours: number | null}
      > = {};

      // Fetch max hours once for the section
      let maxHours: number | null = null;
      try {
        maxHours = await readLifeHoursSetpoint(ip, 502);
      } catch (error) {
        console.error(
          `Error fetching max hours for Section ${sectionId}:`,
          error,
        );
      }

      for (let lampId = 1; lampId <= 4; lampId++) {
        try {
          const workingHours = await readLampHours(ip, 502, lampId);
          updatedWorkingHours[lampId] = {
            currentHours: workingHours.currentHours,
            maxHours: maxHours, // Use the fetched max hours
          };
        } catch (error) {
          console.error(
            `Error fetching working hours for Lamp ${lampId}:`,
            error,
          );
          updatedWorkingHours[lampId] = {
            currentHours: null,
            maxHours: maxHours,
          };
        }
      }

      set(state => ({
        workingHours: {
          ...state.workingHours,
          [sectionId]: updatedWorkingHours,
        },
      }));
    } catch (error) {
      console.error(
        `Error fetching working hours for Section ${sectionId}:`,
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
          // Fetch working hours
          fetchWorkingHours(section.id, section.ip);
        }
      }
    } catch (error) {
      console.error('Error fetching all sections data:', error);
    }
  };

  const startFetching = (sectionId: number, ip: string, interval: number) => {
    fetchWorkingHours(sectionId, ip); // Initial fetch
    const intervalId = setInterval(
      () => fetchWorkingHours(sectionId, ip),
      interval,
    );
    return () => clearInterval(intervalId); // Return cleanup function
  };

  fetchAllSectionsData();
  setInterval(fetchAllSectionsData, 60 * 1000); // 1 minute

  return {
    workingHours: {},
    setWorkingHours: (sectionId, lampId, currentHours, maxHours) =>
      set(state => ({
        workingHours: {
          ...state.workingHours,
          [sectionId]: {
            ...state.workingHours[sectionId],
            [lampId]: {currentHours, maxHours},
          },
        },
      })),
    resetWorkingHours: sectionId =>
      set(state => {
        if (sectionId !== undefined) {
          const updatedSections = {...state.workingHours};
          delete updatedSections[sectionId];
          return {workingHours: updatedSections};
        }
        return {workingHours: {}};
      }),
    startFetching,
  };
});

export default useWorkingHoursStore;
