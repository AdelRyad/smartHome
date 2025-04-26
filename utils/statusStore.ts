import {create} from 'zustand';
import useSectionsPowerStatusStore from './sectionsPowerStatusStore';
import useWorkingHoursStore from './workingHoursStore';
import useCleaningHoursStore from './cleaningHoursStore';
import useDpsPressureStore from './dpsPressureStore';
import usePressureButtonStore from './pressureButtonStore';
import {getSectionsWithStatus} from './db';
import modbusConnectionManager from './modbusConnectionManager';

interface StatusState {
  sections: Record<
    number,
    {
      lamps: Record<
        number,
        {
          status: StatusLevel;
          message: string;
          cleanStatus?: boolean;
          lifeStatus?: number;
        }
      >;
      lastUpdated: number;
      sectionErrors: Array<{
        type: SectionErrorType;
        message: string;
        timestamp: number;
      }>;
    }
  >;
  isLoading: boolean;
  globalErrors: Array<{
    sectionId: number;
    type: SectionErrorType;
    message: string;
    timestamp: number;
  }>;
  currentSectionId: number | null;
  startPolling: (
    sectionId: number,
    ip: string,
    interval?: number,
  ) => () => void;
  stopPolling: (sectionId: number) => void;
  cleanup: () => void;
  setCurrentSection: (sectionId: number | null) => void;
  getErrorsForSection: (
    sectionId: number,
  ) => Array<{type: string; message: string}>;
  getAllErrors: () => Array<{sectionId: number; type: string; message: string}>;
  getSectionStatusSummary: (
    type: 'dps' | 'lamp' | 'pressure' | 'cleaning',
  ) => Array<{
    sectionId: number;
    status: StatusLevel;
    message: string;
  }>;
  reconnectSection: (sectionId: number, ip: string) => void;
}

export type StatusLevel = 'error' | 'warning' | 'good';
type SectionErrorType =
  | 'power'
  | 'command'
  | 'lamp'
  | 'connection'
  | 'pressure'
  | 'cleaning';

const ACTIVE_POLLING_INTERVAL = 60000;
const ERROR_RETENTION_TIME = 10 * 60 * 1000; // 30 minutes

export const useStatusStore = create<StatusState>((set, get) => {
  let pollingIntervals: Record<number, NodeJS.Timeout> = {};
  let activeRequests: Record<number, boolean> = {};
  // --- Failure tracking additions ---
  let sectionFailureCounts: Record<number, {count: number; stopped: boolean}> =
    {};
  let lastSectionStatus: Record<number, boolean> = {};

  // Helper: Reset section failure count
  function resetSectionFailure(sectionId: number) {
    sectionFailureCounts[sectionId] = {count: 0, stopped: false};
  }

  // Helper: Record section failure and check for threshold
  function recordSectionFailure(sectionId: number) {
    if (!sectionFailureCounts[sectionId]) {
      sectionFailureCounts[sectionId] = {count: 0, stopped: false};
    }
    sectionFailureCounts[sectionId].count += 1;
    if (
      sectionFailureCounts[sectionId].count >= 5 &&
      !sectionFailureCounts[sectionId].stopped
    ) {
      sectionFailureCounts[sectionId].stopped = true;
      stopPolling(sectionId);
      const section = get().sections[sectionId];
      const ip = section?.ip;
      const port = 502; // default modbus port
      if (ip) {
        modbusConnectionManager.suspendConnection(ip, port);
      }
      const now = Date.now();
      set(state => ({
        sections: {
          ...state.sections,
          [sectionId]: {
            ...state.sections[sectionId],
            sectionErrors: [
              ...(state.sections[sectionId]?.sectionErrors || []),
              {
                type: 'connection',
                message: 'Connection failed 5 times. Polling stopped.',
                timestamp: now,
              },
            ],
          },
        },
      }));
    }
  }

  // Helper: Reconnect section
  function reconnectSection(sectionId: number, ip: string) {
    resetSectionFailure(sectionId);
    modbusConnectionManager.resumeConnection(ip, 502);
    startPolling(sectionId, ip);
  }

  const updateSectionStatus = async (sectionId: number) => {
    const powerStore = useSectionsPowerStatusStore.getState();
    const workingStore = useWorkingHoursStore.getState();
    const cleaningStore = useCleaningHoursStore.getState();
    const dpsStore = useDpsPressureStore.getState();
    const pressureStore = usePressureButtonStore.getState();

    const now = Date.now();
    const sectionErrors: Array<{
      type: SectionErrorType;
      message: string;
      timestamp: number;
    }> = [];

    const section = get().sections[sectionId];
    const ip = section?.ip;
    const port = 502;
    // Check if Modbus is connected for this section
    let isConnected = true;
    if (ip) {
      const modbusState = modbusConnectionManager.connections?.get?.(
        `${ip}:${port}`,
      );
      isConnected = !!(modbusState && modbusState.isConnected);
    }
    // If not connected, count as a failure
    if (!isConnected) {
      recordSectionFailure(sectionId);
      sectionErrors.push({
        type: 'connection',
        message: `Section ${sectionId}: Connection lost – check network or power.`,
        timestamp: now,
      });
    }

    // Collect errors from all stores
    if (powerStore.sections[sectionId]?.error) {
      sectionErrors.push({
        type: 'power',
        message: `Section ${sectionId}: Power error – ${
          powerStore.sections[sectionId]?.error || 'Unknown power status error.'
        }`,
        timestamp: now,
      });
    }

    if (dpsStore.sections[sectionId]?.error) {
      sectionErrors.push({
        type: 'pressure',
        message: `Section ${sectionId}: Pressure sensor error – ${
          dpsStore.sections[sectionId]?.error || 'DPS status error.'
        }`,
        timestamp: now,
      });
    }

    // Process lamp status
    const lamps: Record<number, any> = {};
    for (let lampId = 1; lampId <= 4; lampId++) {
      try {
        const lampHours = workingStore.workingHours[sectionId]?.[lampId];
        let status: StatusLevel = 'good';
        let message = `Section ${sectionId} Lamp ${lampId} is operational.`;
        if (lampHours?.error) {
          status = 'error';
          message = `Section ${sectionId} Lamp ${lampId} error: ${lampHours.error}`;
          sectionErrors.push({
            type: 'lamp',
            message,
            timestamp: now,
          });
        } else if (
          lampHours?.currentHours != null &&
          lampHours?.maxHours != null &&
          lampHours.maxHours > 0
        ) {
          const percentLeft = 1 - lampHours.currentHours / lampHours.maxHours;
          if (percentLeft < 0.1) {
            status = 'error';
            message = `Section ${sectionId} Lamp ${lampId} life is under 10% – replacement recommended.`;
            sectionErrors.push({
              type: 'lamp',
              message,
              timestamp: now,
            });
          } else if (percentLeft < 0.5) {
            status = 'warning';
            message = `Section ${sectionId} Lamp ${lampId} life is below 50%.`;
          }
        }
        lamps[lampId] = {
          status,
          message,
        };
      } catch (error) {
        lamps[lampId] = {
          status: 'error' as StatusLevel,
          message: `Section ${sectionId} Lamp ${lampId} error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
        sectionErrors.push({
          type: 'lamp',
          message: `Section ${sectionId} Lamp ${lampId} error: ${
            error instanceof Error ? error.message : String(error)
          }`,
          timestamp: now,
        });
      }
    }

    // Cleaning status
    const cleaning = cleaningStore.remainingCleaningHours[sectionId];
    if (cleaning) {
      const {remaining, maxHours} = cleaning;
      if (remaining == null || maxHours == null) {
        sectionErrors.push({
          type: 'cleaning',
          message: `Section ${sectionId}: Cleaning hours data unavailable.`,
          timestamp: now,
        });
      } else {
        const percentLeft = remaining / maxHours;
        if (percentLeft <= 0) {
          sectionErrors.push({
            type: 'cleaning',
            message: `Section ${sectionId}: Cleaning hours exhausted – cleaning required immediately!`,
            timestamp: now,
          });
        } else if (percentLeft < 0.1) {
          sectionErrors.push({
            type: 'cleaning',
            message: `Section ${sectionId}: Cleaning hours below 10% – cleaning required soon.`,
            timestamp: now,
          });
        }
      }
    }

    // Pressure button status
    const pressureBtn = pressureStore.sections[sectionId];
    if (pressureBtn && pressureBtn.isPressed) {
      sectionErrors.push({
        type: 'pressure',
        message: `Section ${sectionId}: Pressure button is pressed – check for abnormal pressure.`,
        timestamp: now,
      });
    }

    // Update store state
    set(state => {
      // Clean up old errors
      const cleanedErrors = state.globalErrors.filter(
        error => now - error.timestamp < ERROR_RETENTION_TIME,
      );

      return {
        sections: {
          ...state.sections,
          [sectionId]: {
            lamps,
            lastUpdated: now,
            sectionErrors: [
              ...sectionErrors,
              ...cleanedErrors.filter(e => e.sectionId === sectionId),
            ],
          },
        },
        globalErrors: [
          ...sectionErrors.map(e => ({...e, sectionId})),
          ...cleanedErrors.filter(e => e.sectionId !== sectionId),
        ],
        isLoading: false,
      };
    });

    // Determine if section is up (no errors) or down (has connection error)
    const hasConnectionError = sectionErrors.some(
      e => e.type === 'connection' || e.type === 'power',
    );
    lastSectionStatus[sectionId] = !hasConnectionError;
    if (hasConnectionError) {
      recordSectionFailure(sectionId);
    } else if (isConnected) {
      resetSectionFailure(sectionId);
    }
  };

  const startPolling = (
    sectionId: number,
    ip: string,
    interval = ACTIVE_POLLING_INTERVAL,
  ) => {
    stopPolling(sectionId);
    updateSectionStatus(sectionId);
    pollingIntervals[sectionId] = setInterval(
      () => updateSectionStatus(sectionId),
      interval,
    );
    return () => stopPolling(sectionId);
  };

  const stopPolling = (sectionId: number) => {
    if (pollingIntervals[sectionId]) {
      clearInterval(pollingIntervals[sectionId]);
      delete pollingIntervals[sectionId];
    }
    delete activeRequests[sectionId];
  };

  const cleanup = () => {
    Object.keys(pollingIntervals).forEach(sectionId => {
      stopPolling(Number(sectionId));
    });
    activeRequests = {};
  };

  const setCurrentSection = (sectionId: number | null) => {
    set({currentSectionId: sectionId});
  };

  const getErrorsForSection = (sectionId: number) => {
    const section = get().sections[sectionId];
    return section?.sectionErrors || [];
  };

  const getAllErrors = () => {
    return get().globalErrors;
  };

  const getSectionStatusSummary = (
    type: 'dps' | 'lamp' | 'pressure' | 'cleaning',
  ) => {
    const {sections} = get();
    const result: Array<{
      sectionId: number;
      status: StatusLevel;
      message: string;
    }> = [];

    Object.entries(sections).forEach(([sectionId, section]) => {
      switch (type) {
        case 'dps':
          const dpsStatus =
            useDpsPressureStore.getState().sections[Number(sectionId)]?.isOk;
          result.push({
            sectionId: Number(sectionId),
            status:
              dpsStatus === null ? 'error' : dpsStatus ? 'good' : 'warning',
            message:
              dpsStatus === null
                ? 'DPS status unavailable'
                : dpsStatus
                ? 'DPS OK'
                : 'Pressure Issue',
          });
          break;

        case 'lamp':
          const lampErrors = Object.values(section.lamps).filter(
            l => l.status === 'error',
          ).length;
          const lampWarnings = Object.values(section.lamps).filter(
            l => l.status === 'warning',
          ).length;
          result.push({
            sectionId: Number(sectionId),
            status:
              lampErrors > 0 ? 'error' : lampWarnings > 0 ? 'warning' : 'good',
            message: `${lampErrors} errors, ${lampWarnings} warnings`,
          });
          break;

        case 'pressure':
          const pressureStatus =
            usePressureButtonStore.getState().sections[Number(sectionId)]
              ?.isPressed;
          result.push({
            sectionId: Number(sectionId),
            status:
              pressureStatus === null
                ? 'error'
                : pressureStatus
                ? 'warning'
                : 'good',
            message:
              pressureStatus === null
                ? 'Pressure status unavailable'
                : pressureStatus
                ? 'Button pressed'
                : 'Normal pressure',
          });
          break;

        case 'cleaning':
          const remaining =
            useCleaningHoursStore.getState().remainingCleaningHours[
              Number(sectionId)
            ]?.remaining;
          const max =
            useCleaningHoursStore.getState().remainingCleaningHours[
              Number(sectionId)
            ]?.maxHours;
          const percentage =
            max !== null && remaining !== null
              ? Math.floor((remaining / max) * 100)
              : null;

          result.push({
            sectionId: Number(sectionId),
            status:
              percentage <= 0 ? 'error' : percentage < 0.1 ? 'warning' : 'good',
            message:
              remaining === null
                ? 'Cleaning hours unavailable'
                : ` ${remaining}h remaining`,
          });
          break;
      }
    });

    return result;
  };

  const initialize = async () => {
    let sections: any[] = [];
    cleanup();

    await new Promise<void>(resolve => {
      getSectionsWithStatus((sectionsData: any[]) => {
        sections = sectionsData;
        resolve();
      });
    });

    sections.forEach(section => {
      if (section?.id && section?.ip) {
        // Start polling in status store
        startPolling(section.id, section.ip);

        // Also ensure other stores are polling
        useDpsPressureStore.getState().startPolling(section.id, section.ip);
        usePressureButtonStore.getState().startPolling(section.id, section.ip);
        useSectionsPowerStatusStore
          .getState()
          .startPolling(section.id, section.ip);
        useWorkingHoursStore.getState().startPolling(section.id, section.ip);
      }
    });
  };

  // Register for Modbus connection errors and count as failures
  modbusConnectionManager.onError((ip, port, err) => {
    // Find the sectionId for this ip/port
    const state = useStatusStore.getState();
    const sectionEntry = Object.entries(state.sections).find(
      ([, section]) => section?.ip === ip,
    );
    if (sectionEntry) {
      const sectionId = Number(sectionEntry[0]);
      // Count as a failure
      if (typeof state.recordSectionFailure === 'function') {
        state.recordSectionFailure(sectionId);
      }
    }
  });

  // Call initialize immediately
  initialize();

  return {
    sections: {},
    isLoading: false,
    globalErrors: [],
    currentSectionId: null,
    startPolling,
    stopPolling,
    cleanup,
    setCurrentSection,
    getErrorsForSection,
    getAllErrors,
    getSectionStatusSummary,
    reconnectSection, // Expose for UI
  };
});
