import {create} from 'zustand';
import {readPressureButton} from './modbus';
import {getSectionsWithStatus} from './db';

interface DpsPressureState {
  pressureButtonStatus: Record<number, boolean | null>;
  setPressureButton: (sectionId: number, status: boolean | null) => void;
  resetPressureButton: () => void;
  startFetching: (
    sectionId: number,
    ip: string,
    interval: number,
  ) => () => void;
}

const usePressureButtonStore = create<DpsPressureState>(set => {
  const fetchPressureButton = async (sectionId: number, ip: string) => {
    try {
      const setStatus = (msg: string) => {
        console.log(`[DPS Status] Section ${sectionId}: ${msg}`);
      };
      const setPressureButtonStatus = (isOk: boolean | null) => {
        set(state => ({
          pressureButtonStatus: {
            ...state.pressureButtonStatus,
            [sectionId]: isOk,
          },
        }));
      };
      readPressureButton(ip, 502, setStatus, setPressureButtonStatus);
    } catch (error) {
      console.error(
        `Error fetching DPS pressure for Section ${sectionId}:`,
        error,
      );
      set(state => ({
        pressureButtonStatus: {
          ...state.pressureButtonStatus,
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
          fetchPressureButton(section.id, section.ip);
        }
      }
    } catch (error) {
      console.error('Error fetching all DPS pressure data:', error);
    }
  };

  const startFetching = (sectionId: number, ip: string, interval: number) => {
    fetchPressureButton(sectionId, ip);
    const intervalId = setInterval(
      () => fetchPressureButton(sectionId, ip),
      interval,
    );
    return () => clearInterval(intervalId);
  };

  fetchAllSectionsData();
  setInterval(fetchAllSectionsData, 5 * 1000);

  return {
    pressureButtonStatus: {},
    setPressureButton: (sectionId, status) =>
      set(state => ({
        pressureButtonStatus: {
          ...state.pressureButtonStatus,
          [sectionId]: status,
        },
      })),
    resetPressureButton: () => set({pressureButtonStatus: {}}),
    startFetching,
  };
});

export default usePressureButtonStore;
