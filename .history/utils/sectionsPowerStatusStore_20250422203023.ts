import {create} from 'zustand';
import {readPowerStatus} from './modbus';
import {getSectionsWithStatus} from './db';

interface SectionsPowerStatusState {
  powerStatus: Record<number, boolean | null>; // Section ID -> Power Status
  setPowerStatus: (sectionId: number, status: boolean | null) => void;
  resetPowerStatus: () => void;
  startFetching: (
    sectionId: number,
    ip: string,
    interval: number,
  ) => () => void;
}

const useSectionsPowerStatusStore = create<SectionsPowerStatusState>(set => {
  const fetchPowerStatus = async (sectionId: number, ip: string) => {
    try {
      // Use readPowerStatus instead of readCommandStatus
      const status = await readPowerStatus(ip, 502);
      set(state => ({
        powerStatus: {
          ...state.powerStatus,
          [sectionId]: status,
        },
      }));
    } catch (error) {
      console.error(
        `Error fetching power status for Section ${sectionId}:`,
        error,
      );
      set(state => ({
        powerStatus: {
          ...state.powerStatus,
          [sectionId]: null,
        },
      }));
    }
  };

  const fetchAllSectionsData = async () => {
    try {
      const sections = await new Promise<any[]>(resolve => {
        getSectionsWithStatus(resolve);
      });
      for (const section of sections) {
        if (section.ip) {
          fetchPowerStatus(section.id, section.ip);
        }
      }
    } catch (error) {
      console.error('Error fetching all power status data:', error);
    }
  };

  const startFetching = (sectionId: number, ip: string, interval: number) => {
    fetchPowerStatus(sectionId, ip);
    const intervalId = setInterval(
      () => fetchPowerStatus(sectionId, ip),
      interval,
    );
    return () => clearInterval(intervalId);
  };

  fetchAllSectionsData();
  setInterval(fetchAllSectionsData, 5 * 1000);

  return {
    powerStatus: {},
    setPowerStatus: (sectionId, status) =>
      set(state => ({
        powerStatus: {
          ...state.powerStatus,
          [sectionId]: status,
        },
      })),
    resetPowerStatus: () => set({powerStatus: {}}),
    startFetching,
  };
});

export default useSectionsPowerStatusStore;
