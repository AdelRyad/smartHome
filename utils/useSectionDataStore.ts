import {create} from 'zustand';
import modbusConnectionManager from './modbusConnectionManager';
import {
  readLampHours,
  readLifeHoursSetpoint,
  readCleaningHoursSetpoint,
  readPressureButton,
  readDPS,
} from './modbus';

export type SectionUnifiedData = {
  workingHours: number | null;
  maxLifeHours: number | null;
  cleaningHours: number | null;
  cleaningSetpoint: number | null;
  pressureButton: boolean | null;
  dpsStatus: boolean | null;
  lastUpdated: number;
  error?: string | null;
};

type State = {
  sections: Record<number, SectionUnifiedData>;
  startPolling: (sectionId: number, ip: string) => void;
  stopPolling: (sectionId: number) => void;
  cleanup: () => void;
};

const POLL_INTERVAL = 5000;

export const useSectionDataStore = create<State>((set, get) => {
  const pollingIntervals: Record<number, NodeJS.Timeout> = {};

  const fetchAllData = async (sectionId: number, ip: string) => {
    try {
      // Open connection if not already
      if (!modbusConnectionManager.isSuspended(ip, 502)) {
        // Working hours (example: lamp 1)
        const lampHoursResult = await readLampHours(ip, 502, 1);
        const workingHours = lampHoursResult.currentHours;
        const maxLifeHours = await readLifeHoursSetpoint(ip, 502);
        const cleaningHours = await readCleaningHoursSetpoint(ip, 502);
        // Pressure button (wrap in Promise)
        const pressureButton = await new Promise<boolean | null>(resolve => {
          readPressureButton(ip, 502, () => {}, resolve);
        });
        // DPS (wrap in Promise)
        const dpsStatus = await new Promise<boolean | null>(resolve => {
          readDPS(ip, 502, () => {}, resolve);
        });
        set(state => ({
          sections: {
            ...state.sections,
            [sectionId]: {
              workingHours,
              maxLifeHours,
              cleaningHours,
              cleaningSetpoint: cleaningHours, // or another value if needed
              pressureButton,
              dpsStatus,
              lastUpdated: Date.now(),
              error: null,
            },
          },
        }));
      }
    } catch (error: any) {
      set(state => ({
        sections: {
          ...state.sections,
          [sectionId]: {
            ...(state.sections[sectionId] || {}),
            error: error.message || 'Unknown error',
            lastUpdated: Date.now(),
          },
        },
      }));
    }
  };

  const startPolling = (sectionId: number, ip: string) => {
    get().stopPolling(sectionId);
    fetchAllData(sectionId, ip);
    pollingIntervals[sectionId] = setInterval(() => {
      fetchAllData(sectionId, ip);
    }, POLL_INTERVAL);
  };

  const stopPolling = (sectionId: number) => {
    if (pollingIntervals[sectionId]) {
      clearInterval(pollingIntervals[sectionId]);
      delete pollingIntervals[sectionId];
    }
  };

  const cleanup = () => {
    Object.keys(pollingIntervals).forEach(id => {
      clearInterval(pollingIntervals[+id]);
      delete pollingIntervals[+id];
    });
    set({sections: {}});
    modbusConnectionManager.closeAll();
  };

  return {
    sections: {},
    startPolling,
    stopPolling,
    cleanup,
  };
});
