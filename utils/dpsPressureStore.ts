import {create} from 'zustand';
import {readDPS} from './modbus';
import {getSectionsWithStatus} from './db';

interface DpsPressureState {
  dpsPressureStatus: Record<number, boolean | null>; // Section ID -> DPS Status
  setDpsPressureStatus: (sectionId: number, status: boolean | null) => void;
  resetDpsPressureStatus: () => void;
  startFetching: (
    sectionId: number,
    ip: string,
    interval: number,
  ) => () => void;
}

const useDpsPressureStore = create<DpsPressureState>(set => {
  const fetchDpsPressure = async (sectionId: number, ip: string) => {
    try {
      const setStatus = (msg: string) => {
        console.log(`[DPS Status] Section ${sectionId}: ${msg}`);
      };
      const setDpsStatus = (isOk: boolean | null) => {
        set(state => ({
          dpsPressureStatus: {
            ...state.dpsPressureStatus,
            [sectionId]: isOk,
          },
        }));
      };
      readDPS(ip, 502, setStatus, setDpsStatus);
    } catch (error) {
      console.error(
        `Error fetching DPS pressure for Section ${sectionId}:`,
        error,
      );
      set(state => ({
        dpsPressureStatus: {
          ...state.dpsPressureStatus,
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
          fetchDpsPressure(section.id, section.ip);
        }
      }
    } catch (error) {
      console.error('Error fetching all DPS pressure data:', error);
    }
  };

  const startFetching = (sectionId: number, ip: string, interval: number) => {
    fetchDpsPressure(sectionId, ip);
    const intervalId = setInterval(
      () => fetchDpsPressure(sectionId, ip),
      interval,
    );
    return () => clearInterval(intervalId);
  };

  fetchAllSectionsData();
  // setInterval(fetchAllSectionsData, 5 * 1000);

  return {
    dpsPressureStatus: {},
    setDpsPressureStatus: (sectionId, status) =>
      set(state => ({
        dpsPressureStatus: {
          ...state.dpsPressureStatus,
          [sectionId]: status,
        },
      })),
    resetDpsPressureStatus: () => set({dpsPressureStatus: {}}),
    startFetching,
  };
});

export default useDpsPressureStore;
