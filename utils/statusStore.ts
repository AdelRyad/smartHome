import {create} from 'zustand';
import {getSectionsWithStatus} from './db';
import modbusConnectionManager from './modbusConnectionManager';
import {useSectionDataStore} from './useSectionDataStore';

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
  removeSection: (sectionId: number) => void;
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
  // No longer need failure tracking helpers
  function reconnectSection(sectionId: number, ip: string) {
    modbusConnectionManager.resumeConnection(ip, 502);
    startPolling(sectionId, ip);
  }

  const updateSectionStatus = async (sectionId: number) => {
    const sectionStore = useSectionDataStore.getState();
    const now = Date.now();
    const sectionErrors: Array<{
      type: SectionErrorType;
      message: string;
      timestamp: number;
    }> = [];

    const sectionData = sectionStore.sections[sectionId];
    // Defensive: If no data, mark as connection error
    if (!sectionData) {
      sectionErrors.push({
        type: 'connection',
        message: `Section ${sectionId}: No data available – check network or power.`,
        timestamp: now,
      });
      set(state => ({
        sections: {
          ...state.sections,
          [sectionId]: {
            lamps: {},
            lastUpdated: now,
            sectionErrors,
          },
        },
        globalErrors: [
          ...state.globalErrors,
          ...sectionErrors.map(e => ({...e, sectionId})),
        ],
      }));
      return;
    }

    // Connection error
    if (sectionData.error) {
      sectionErrors.push({
        type: 'connection',
        message: `Section ${sectionId}: ${sectionData.error}`,
        timestamp: now,
      });
    }

    // Lamp status
    const lamps: Record<number, any> = {};
    for (let lampId = 1; lampId <= 4; lampId++) {
      const lamp = sectionData.workingHours?.[lampId];
      let status: StatusLevel = 'good';
      let message = `Section ${sectionId} Lamp ${lampId} is operational.`;
      if (lamp?.error) {
        status = 'error';
        message = `Section ${sectionId} Lamp ${lampId} error: ${lamp.error}`;
        sectionErrors.push({
          type: 'lamp',
          message,
          timestamp: now,
        });
      } else if (
        lamp?.currentHours != null &&
        sectionData.maxLifeHours != null &&
        sectionData.maxLifeHours > 0
      ) {
        const percentLeft = 1 - lamp.currentHours / sectionData.maxLifeHours;
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
      lamps[lampId] = {status, message};
    }

    // Cleaning status
    if (
      sectionData.cleaningHours != null &&
      sectionData.cleaningSetpoint != null
    ) {
      const remaining = sectionData.cleaningHours;
      const maxHours = sectionData.cleaningSetpoint;
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
    if (sectionData.pressureButton) {
      sectionErrors.push({
        type: 'pressure',
        message: `Section ${sectionId}: Pressure button is pressed – check for abnormal pressure.`,
        timestamp: now,
      });
    }

    // DPS status
    if (sectionData.dpsStatus === false) {
      sectionErrors.push({
        type: 'pressure',
        message: `Section ${sectionId}: DPS status error.`,
        timestamp: now,
      });
    }

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
    const sectionDataStore = useSectionDataStore.getState().sections;
    const result: Array<{
      sectionId: number;
      status: StatusLevel;
      message: string;
    }> = [];

    Object.entries(sections).forEach(([sectionId, section]) => {
      const data = sectionDataStore[Number(sectionId)];
      if (!data) {
        result.push({
          sectionId: Number(sectionId),
          status: 'error',
          message: 'Data unavailable',
        });
        return;
      }
      switch (type) {
        case 'dps':
          const dpsStatus = data?.dpsStatus;
          result.push({
            sectionId: Number(sectionId),
            status:
              dpsStatus === null
                ? 'error'
                : dpsStatus === true
                ? 'good'
                : 'warning',
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
          const pressureStatus = data?.pressureButton;
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
          const remaining = data?.cleaningHours;
          const max = data?.cleaningSetpoint;
          let percentage: number | null = null;
          if (
            typeof remaining === 'number' &&
            typeof max === 'number' &&
            max > 0
          ) {
            percentage = Math.floor((remaining / max) * 100);
          }
          result.push({
            sectionId: Number(sectionId),
            status:
              percentage === null
                ? 'error'
                : percentage <= 0
                ? 'error'
                : percentage < 10
                ? 'warning'
                : 'good',
            message:
              remaining === null || max === null
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
        // Start polling in status store only
        startPolling(section.id, section.ip);
      }
    });
  };

  // No longer need to register for Modbus connection errors by IP

  // Call initialize immediately
  initialize();

  const removeSection = (sectionId: number) => {
    stopPolling(sectionId);
    set(state => ({
      sections: Object.fromEntries(
        Object.entries(state.sections).filter(
          ([id]) => Number(id) !== sectionId,
        ),
      ),
      globalErrors: state.globalErrors.filter(e => e.sectionId !== sectionId),
    }));
    // Optionally, also remove from activeRequests if present
    delete activeRequests[sectionId];
  };

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
    reconnectSection,
    removeSection,
  };
});
