import {create} from 'zustand';
import modbusConnectionManager from './modbusConnectionManager';
import {
  readLampHours,
  readLifeHoursSetpoint,
  readCleaningHoursSetpoint,
  readPressureButton,
  readDPS,
  setSectionPowerStatus as modbusSetSectionPowerStatus,
} from './modbus';

export type SectionUnifiedData = {
  workingHours: Record<
    number,
    {currentHours: number | null; error?: string | null}
  >;
  maxLifeHours: number | null;
  cleaningHours: number | null;
  cleaningSetpoint: number | null;
  pressureButton: boolean | null;
  dpsStatus: boolean | null;
  lastUpdated: number;
  error?: string | null;
  powerStatus: boolean | null;
};

type State = {
  sections: Record<number, SectionUnifiedData>;
  startPolling: (sectionId: number, ip: string) => void;
  stopPolling: (sectionId: number) => void;
  cleanup: () => void;
};

const POLL_INTERVAL = 10000;
const MAX_CONSECUTIVE_FAILURES = 3;

// Helper to validate IPv4 addresses
function isValidIp(ip: string) {
  return typeof ip === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}

export const useSectionDataStore = create<
  State & {
    resumePolling: (sectionId: number, ip: string) => void;
    setSectionPowerStatus: (
      sectionId: number,
      ip: string,
      newStatus: boolean,
    ) => Promise<void>;
  }
>((set, get) => {
  const pollingIntervals: Record<number, NodeJS.Timeout> = {};
  const consecutiveFailures: Record<number, number> = {};
  const suspendedSections: Record<number, boolean> = {};

  const fetchAllData = async (sectionId: number, ip: string) => {
    if (!isValidIp(ip)) {
      console.warn(`[useSectionDataStore] Skipping invalid IP: ${ip}`);
      return;
    }
    if (suspendedSections[sectionId]) {
      console.warn(
        `[useSectionDataStore] Polling suspended for section ${sectionId}`,
      );
      return;
    }
    console.log(
      `[useSectionDataStore] fetchAllData called for sectionId=${sectionId}, ip=${ip}`,
    );
    let hadError = false;
    try {
      if (!modbusConnectionManager.isSuspended(ip, 502)) {
        const prevSection = get().sections[sectionId] || {};
        // Fetch working hours for all lamps (1-4)
        const workingHours: Record<
          number,
          {currentHours: number | null; error?: string | null}
        > = {...(prevSection.workingHours || {})};
        let maxLifeHours: number | null = prevSection.maxLifeHours ?? null;
        try {
          maxLifeHours = await readLifeHoursSetpoint(ip, 502);
          console.log(
            `[useSectionDataStore] maxLifeHours for section ${sectionId}:`,
            maxLifeHours,
          );
        } catch (e: any) {
          hadError = true;
          console.warn(
            `[useSectionDataStore] Failed to read maxLifeHours for section ${sectionId}:`,
            e.message,
          );
        }
        for (let lampIndex = 1; lampIndex <= 4; lampIndex++) {
          try {
            const lampHoursResult = await readLampHours(ip, 502, lampIndex);
            console.log(
              `[useSectionDataStore] Lamp ${lampIndex} currentHours for section ${sectionId}:`,
              lampHoursResult.currentHours,
            );
            workingHours[lampIndex] = {
              currentHours: lampHoursResult.currentHours,
            };
          } catch (e: any) {
            hadError = true;
            console.warn(
              `[useSectionDataStore] Failed to readLampHours for lamp ${lampIndex} in section ${sectionId}:`,
              e.message,
            );
            if (!workingHours[lampIndex]) {
              workingHours[lampIndex] = {
                currentHours: null,
                error: e.message || 'Unknown error',
              };
            } else {
              workingHours[lampIndex].error = e.message || 'Unknown error';
            }
          }
        }
        let cleaningHours: number | null = prevSection.cleaningHours ?? null;
        try {
          cleaningHours = await readCleaningHoursSetpoint(ip, 502);
          console.log(
            `[useSectionDataStore] cleaningHours for section ${sectionId}:`,
            cleaningHours,
          );
        } catch (e: any) {
          hadError = true;
          console.warn(
            `[useSectionDataStore] Failed to readCleaningHoursSetpoint for section ${sectionId}:`,
            e.message,
          );
        }
        let pressureButton: boolean | null = prevSection.pressureButton ?? null;
        try {
          pressureButton = await new Promise<boolean | null>(resolve => {
            let called = false;
            const timeout = setTimeout(() => {
              if (!called) {
                hadError = true;
                console.error(
                  `[useSectionDataStore] readPressureButton callback not called for section ${sectionId} (timeout)`,
                );
                resolve(null);
              }
            }, 3000); // 3s timeout
            readPressureButton(
              ip,
              502,
              (msg: string) => {
                console.log(
                  `[useSectionDataStore] readPressureButton status for section ${sectionId}:`,
                  msg,
                );
              },
              value => {
                called = true;
                clearTimeout(timeout);
                console.log(
                  `[useSectionDataStore] readPressureButton callback value for section ${sectionId}:`,
                  value,
                );
                resolve(typeof value === 'boolean' ? value : null);
              },
            );
          });
          console.log(
            `[useSectionDataStore] pressureButton for section ${sectionId}:`,
            pressureButton,
          );
        } catch (e: any) {
          hadError = true;
          console.warn(
            `[useSectionDataStore] Failed to readPressureButton for section ${sectionId}:`,
            e.message,
          );
        }
        let dpsStatus: boolean | null = prevSection.dpsStatus ?? null;
        try {
          dpsStatus = await new Promise<boolean | null>(resolve => {
            let called = false;
            const timeout = setTimeout(() => {
              if (!called) {
                hadError = true;
                console.error(
                  `[useSectionDataStore] readDPS callback not called for section ${sectionId} (timeout)`,
                );
                resolve(null);
              }
            }, 3000); // 3s timeout
            readDPS(
              ip,
              502,
              (msg: string) => {
                console.log(
                  `[useSectionDataStore] readDPS status for section ${sectionId}:`,
                  msg,
                );
              },
              value => {
                called = true;
                clearTimeout(timeout);
                console.log(
                  `[useSectionDataStore] readDPS callback value for section ${sectionId}:`,
                  value,
                );
                resolve(typeof value === 'boolean' ? value : null);
              },
            );
          });
          console.log(
            `[useSectionDataStore] dpsStatus for section ${sectionId}:`,
            dpsStatus,
          );
        } catch (e: any) {
          hadError = true;
          console.warn(
            `[useSectionDataStore] Failed to readDPS for section ${sectionId}:`,
            e.message,
          );
        }
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
              error: hadError
                ? 'One or more errors occurred during fetch.'
                : null,
            },
          },
        }));
        // Track consecutive failures
        if (hadError) {
          consecutiveFailures[sectionId] =
            (consecutiveFailures[sectionId] || 0) + 1;
          if (consecutiveFailures[sectionId] >= MAX_CONSECUTIVE_FAILURES) {
            suspendedSections[sectionId] = true;
            modbusConnectionManager.closeConnection(ip, 502);
            console.error(
              `[useSectionDataStore] Section ${sectionId} polling suspended after ${MAX_CONSECUTIVE_FAILURES} consecutive failures.`,
            );
            get().stopPolling(sectionId);
            set(state => ({
              sections: {
                ...state.sections,
                [sectionId]: {
                  ...(state.sections[sectionId] || {}),
                  error: `Polling suspended after ${MAX_CONSECUTIVE_FAILURES} consecutive failures.`,
                  lastUpdated: Date.now(),
                },
              },
            }));
          }
        } else {
          consecutiveFailures[sectionId] = 0;
        }
      }
    } catch (error: any) {
      console.error(
        `[useSectionDataStore] fetchAllData error for section ${sectionId}:`,
        error.message,
      );
      consecutiveFailures[sectionId] =
        (consecutiveFailures[sectionId] || 0) + 1;
      if (consecutiveFailures[sectionId] >= MAX_CONSECUTIVE_FAILURES) {
        suspendedSections[sectionId] = true;
        modbusConnectionManager.closeConnection(ip, 502);
        console.error(
          `[useSectionDataStore] Section ${sectionId} polling suspended after ${MAX_CONSECUTIVE_FAILURES} consecutive failures.`,
        );
        get().stopPolling(sectionId);
        set(state => ({
          sections: {
            ...state.sections,
            [sectionId]: {
              ...(state.sections[sectionId] || {}),
              error: `Polling suspended after ${MAX_CONSECUTIVE_FAILURES} consecutive failures.`,
              lastUpdated: Date.now(),
            },
          },
        }));
      } else {
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
    // Reset failure and suspension tracking
    Object.keys(consecutiveFailures).forEach(
      id => delete consecutiveFailures[+id],
    );
    Object.keys(suspendedSections).forEach(id => delete suspendedSections[+id]);
  };

  const resumePolling = (sectionId: number, ip: string) => {
    suspendedSections[sectionId] = false;
    consecutiveFailures[sectionId] = 0;
    startPolling(sectionId, ip);
    set(state => ({
      sections: {
        ...state.sections,
        [sectionId]: {
          ...(state.sections[sectionId] || {}),
          error: null,
        },
      },
    }));
    console.log(
      `[useSectionDataStore] Resumed polling for section ${sectionId}`,
    );
  };

  const setSectionPowerStatus = async (
    sectionId: number,
    ip: string,
    newStatus: boolean,
  ) => {
    try {
      await modbusSetSectionPowerStatus(ip, 502, newStatus);
      set(state => ({
        sections: {
          ...state.sections,
          [sectionId]: {
            ...(state.sections[sectionId] || {}),
            powerStatus: newStatus,
            lastUpdated: Date.now(),
            error: null,
          },
        },
      }));
    } catch (error: any) {
      set(state => ({
        sections: {
          ...state.sections,
          [sectionId]: {
            ...(state.sections[sectionId] || {}),
            error: error.message || 'Failed to set power status',
            lastUpdated: Date.now(),
          },
        },
      }));
      throw error;
    }
  };

  return {
    sections: {},
    startPolling,
    stopPolling,
    cleanup,
    resumePolling,
    setSectionPowerStatus,
  };
});
