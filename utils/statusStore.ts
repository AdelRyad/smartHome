import {create} from 'zustand';
import {getSectionsWithStatus} from './db';
import {
  readDPS,
  readCleaningHoursSetpoint,
  readSingleLampCleaningRunHours,
  readLampHours,
  readLifeHoursSetpoint,
  readPressureButton,
  readLampsOnline,
} from './modbus';

export type StatusLevel = 'good' | 'warning' | 'error';

export interface SectionDetailedStatus {
  status: StatusLevel;
  message: string;
  details?: string[];
}

export interface SectionStatus {
  dps: SectionDetailedStatus;
  lamps: Record<number, SectionDetailedStatus>; // Map lamp ID to status
  cleaning: SectionDetailedStatus;
  pressureButton: SectionDetailedStatus;
  door?: SectionDetailedStatus;
}

export interface StatusStoreState {
  sectionNames: Record<number, string>;
  statusBySection: Record<number, SectionStatus>;
  aggregatedStatus: {
    dps: {errorCount: number; warningCount: number};
    lamp: {errorCount: number; warningCount: number};
    cleaning: {errorCount: number; warningCount: number};
    pressureButton: {errorCount: number; warningCount: number};
    door: {errorCount: number; warningCount: number};
  };
  fetchAllStatuses: () => Promise<void>;
  getSectionStatusSummary: (statusType: string) => {
    sectionId: number;
    sectionName: string;
    status: StatusLevel;
    message: string;
  }[];
}

const getLampStatus = (
  current: number | null,
  max: number | null,
): StatusLevel => {
  if (max === null || max === 0 || current === null) return 'good';
  const percentLeft = 1 - current / max;
  if (percentLeft < 0.1) return 'error';
  if (percentLeft < 0.5) return 'warning';
  return 'good';
};

const getCleaningStatus = (
  remaining: number | null,
  setpoint: number | null,
): StatusLevel => {
  if (setpoint === null || setpoint === 0 || remaining === null) return 'good';
  const percentLeft = remaining / setpoint;
  if (percentLeft < 0.1) return 'error';
  if (percentLeft < 0.5) return 'warning';
  return 'good';
};

export const useStatusStore = create<StatusStoreState>((set, get) => ({
  sectionNames: {},
  statusBySection: {},
  aggregatedStatus: {
    dps: {errorCount: 0, warningCount: 0},
    lamp: {errorCount: 0, warningCount: 0},
    cleaning: {errorCount: 0, warningCount: 0},
    pressureButton: {errorCount: 0, warningCount: 0},
    door: {errorCount: 0, warningCount: 0},
  },

  fetchAllStatuses: async () => {
    const sections = await new Promise<any[]>(resolve =>
      getSectionsWithStatus(resolve),
    );

    // Store section names for easy reference
    const sectionNames: Record<number, string> = {};
    sections.forEach(section => {
      if (section.id)
        sectionNames[section.id] = section.name || `Section ${section.id}`;
    });

    const statusBySection: Record<number, SectionStatus> = {};

    // Process each section's statuses
    for (const section of sections) {
      if (!section.ip || !section.id) continue;

      // pressure button status
      let pressureButton: StatusLevel = 'good';
      let pressureButtonDetail: string[] = [];
      try {
        const pushButtonOk = await new Promise<boolean | null>(
          (resolve, reject) => {
            let timeout = setTimeout(() => {
              reject(new Error('Timeout reading pressure button'));
            }, 5000); // 5 second timeout

            readPressureButton(
              section.ip,
              502,
              (msg: string) => {
                pressureButtonDetail.push(msg);
              },
              isOk => {
                clearTimeout(timeout);
                resolve(isOk);
              },
            );
          },
        );

        console.log(`Section ${section.id} pushButtonOk:`, pushButtonOk);

        // Corrected logic: if button is OK (true), status is good
        // If button is pressed/issue (false), status is error
        // If null (read failed), status is error
        pressureButton = pushButtonOk === true ? 'good' : 'error';

        if (pressureButton === 'good') {
          pressureButtonDetail = ['Pressure button is normal.'];
        } else {
          pressureButtonDetail = ['Pressure button issue detected.'];
        }
      } catch (e: any) {
        console.error(
          `Error reading pressure button for section ${section.id}:`,
          e,
        );
        pressureButton = 'error';
        pressureButtonDetail = [
          e?.message || 'Failed to read pressure button status.',
        ];
      }
      // DPS Status
      let dps: StatusLevel = 'good';
      let dpsDetail: string[] = [];
      try {
        const dpsOk = await new Promise<boolean | null>(resolve => {
          readDPS(
            section.ip,
            502,
            (msg: string) => {
              dpsDetail.push(msg);
            },
            ok => resolve(ok),
          );
        });
        dps = dpsOk === false ? 'error' : 'good';
        if (dps === 'good' && !dpsDetail.length)
          dpsDetail = ['DPS pressure is normal.'];
      } catch (e: any) {
        dps = 'error';
        dpsDetail = [e?.message || 'DPS error.'];
      }

      // Lamp Status
      const lamps: Record<number, SectionDetailedStatus> = {};
      let lampOverallStatus: StatusLevel = 'good';
      let lampsOnlineCount: number | null = null;

      try {
        // First try to read how many lamps are online
        lampsOnlineCount = await new Promise<number | null>(resolve => {
          readLampsOnline(
            section.ip,
            502,
            () => {}, // status callback if needed
            count => resolve(count),
          );
        });

        const max = await readLifeHoursSetpoint(section.ip, 502);

        for (let lampId = 1; lampId <= 4; lampId++) {
          // If we know this lamp is offline (based on lampsOnlineCount)
          if (lampsOnlineCount !== null && lampId > lampsOnlineCount) {
            lamps[lampId] = {
              status: 'error',
              message: 'Lamp is offline (not detected)',
            };
            lampOverallStatus = 'error';
            continue;
          }

          // Existing lamp status check
          const {currentHours} = await readLampHours(section.ip, 502, lampId);
          const status = getLampStatus(currentHours, max);
          const percentLeft =
            max && currentHours
              ? Math.round((1 - currentHours / max) * 100)
              : null;

          let message = 'Lamp is healthy.';
          if (status === 'error') {
            message = `Lamp is below 10% of its life (${percentLeft}% remaining).`;
          } else if (status === 'warning') {
            message = `Lamp is below 50% of its life (${percentLeft}% remaining).`;
          }

          lamps[lampId] = {
            status,
            message,
          };

          if (status === 'error') lampOverallStatus = 'error';
          else if (status === 'warning' && lampOverallStatus !== 'error')
            lampOverallStatus = 'warning';
        }

        // If reading lamps online failed but we have some lamps working
        if (
          lampsOnlineCount === null &&
          Object.values(lamps).some(l => l.status === 'good')
        ) {
          // We know at least some lamps are working, but not sure about others
          for (let lampId = 1; lampId <= 4; lampId++) {
            if (!lamps[lampId]) {
              lamps[lampId] = {
                status: 'error',
                message: 'Lamp status unknown (read failed)',
              };
              lampOverallStatus = 'error';
            }
          }
        }
      } catch (e: any) {
        // Existing error handling
        for (let lampId = 1; lampId <= 4; lampId++) {
          lamps[lampId] = {
            status: 'error' as StatusLevel,
            message: e?.message || 'Lamp error.',
          };
        }
        lampOverallStatus = 'error';
      }

      // If we successfully read lamps online count and it's less than 4
      if (lampsOnlineCount !== null && lampsOnlineCount < 4) {
        lampOverallStatus = 'error';
        // Add a special entry to indicate missing lamps
        lamps[0] = {
          status: 'error',
          message: `Only ${lampsOnlineCount} of 4 lamps detected`,
        };
      }

      // Cleaning Status
      let cleaning: StatusLevel = 'good';
      let cleaningDetail: string[] = [];
      try {
        const setpoint = await readCleaningHoursSetpoint(section.ip, 502);
        const current = await readSingleLampCleaningRunHours(section.ip, 502);
        const remaining =
          setpoint !== null && current !== null ? setpoint - current : null;
        cleaning = getCleaningStatus(remaining, setpoint);

        const percentLeft =
          setpoint && remaining
            ? Math.round((remaining / setpoint) * 100)
            : null;

        if (cleaning === 'error') {
          cleaningDetail = [
            `Cleaning hours below 10% (${percentLeft}% remaining).`,
          ];
        } else if (cleaning === 'warning') {
          cleaningDetail = [
            `Cleaning hours below 50% (${percentLeft}% remaining).`,
          ];
        } else {
          cleaningDetail = ['Cleaning hours are healthy.'];
        }
      } catch (e: any) {
        cleaning = 'error';
        cleaningDetail = [e?.message || 'Cleaning error.'];
      }

      // Push Button Status - placeholder for future implementation
      const pushButton: SectionDetailedStatus = {
        status: 'good',
        message: 'Push button pressure is normal.',
      };

      // Door Status - placeholder for future implementation
      const door: SectionDetailedStatus = {
        status: 'good',
        message: 'Door is secure.',
      };

      // Assign all statuses to this section
      statusBySection[section.id] = {
        dps: {
          status: dps,
          message:
            dps === 'good'
              ? 'DPS pressure is normal.'
              : 'DPS pressure issue detected',
          details: dpsDetail,
        },
        lamps,
        cleaning: {
          status: cleaning,
          message:
            cleaning === 'good'
              ? 'Cleaning hours are healthy.'
              : cleaning === 'warning'
              ? 'Cleaning hours below 50%.'
              : 'Cleaning hours below 10%.',
          details: cleaningDetail,
        },
        pressureButton: {
          status: pressureButton,
          message:
            pressureButton === 'good'
              ? 'Pressure button is normal.'
              : 'Pressure button issue detected',
          details: pressureButtonDetail,
        },
        door,
      };
    }

    // Calculate aggregated counts
    const aggregatedStatus = {
      dps: {
        errorCount: Object.values(statusBySection).filter(
          s => s.dps.status === 'error',
        ).length,
        warningCount: Object.values(statusBySection).filter(
          s => s.dps.status === 'warning',
        ).length,
      },
      lamp: {
        errorCount: Object.values(statusBySection).filter(s =>
          Object.values(s.lamps).some(lamp => lamp.status === 'error'),
        ).length,
        warningCount: Object.values(statusBySection).filter(s =>
          Object.values(s.lamps).some(lamp => lamp.status === 'warning'),
        ).length,
      },
      cleaning: {
        errorCount: Object.values(statusBySection).filter(
          s => s.cleaning.status === 'error',
        ).length,
        warningCount: Object.values(statusBySection).filter(
          s => s.cleaning.status === 'warning',
        ).length,
      },
      pressureButton: {
        errorCount: Object.values(statusBySection).filter(
          s => s.pressureButton?.status === 'error',
        ).length,
        warningCount: Object.values(statusBySection).filter(
          s => s.pressureButton?.status === 'warning',
        ).length,
      },
      door: {
        errorCount: Object.values(statusBySection).filter(
          s => s.door?.status === 'error',
        ).length,
        warningCount: Object.values(statusBySection).filter(
          s => s.door?.status === 'warning',
        ).length,
      },
    };

    set({sectionNames, statusBySection, aggregatedStatus});
  },

  // Helper function to get formatted status summaries for tooltips
  getSectionStatusSummary: (
    statusType,
  ): {
    sectionId: number;
    sectionName: string;
    status: StatusLevel;
    message: string;
  }[] => {
    const {statusBySection, sectionNames} = get();
    const result = [];

    for (const [sectionId, status] of Object.entries(statusBySection)) {
      const numericId = Number(sectionId);
      const sectionName = sectionNames[numericId] || `Section ${sectionId}`;

      switch (statusType) {
        case 'dps':
          if (
            status.dps.status === 'warning' ||
            status.dps.status === 'error'
          ) {
            result.push({
              sectionId: numericId,
              sectionName,
              status: status.dps.status as StatusLevel,
              message: status.dps.details?.[0] || status.dps.message,
            });
          }
          break;
        case 'lamp':
          // Check for the special "missing lamps" message first
          const missingLampsEntry = status.lamps[0];
          if (missingLampsEntry && missingLampsEntry.status === 'error') {
            result.push({
              sectionId: numericId,
              sectionName,
              status: 'error',
              message: missingLampsEntry.message,
            });
          }

          // Then check individual lamp statuses
          const problemLamps = Object.entries(status.lamps)
            .filter(([id]) => id !== '0') // Exclude our special entry
            .filter(
              ([_, lampStatus]) =>
                lampStatus.status === 'warning' ||
                lampStatus.status === 'error',
            );

          if (problemLamps.length > 0) {
            // Group by status if multiple lamps have issues
            if (problemLamps.length > 1) {
              const errorLamps = problemLamps.filter(
                ([_, s]) => s.status === 'error',
              );
              const warningLamps = problemLamps.filter(
                ([_, s]) => s.status === 'warning',
              );

              if (errorLamps.length > 0) {
                result.push({
                  sectionId: numericId,
                  sectionName,
                  status: 'error' as StatusLevel,
                  message: `${errorLamps.length} lamp${
                    errorLamps.length > 1 ? 's' : ''
                  } below 10% life`,
                });
              }

              if (warningLamps.length > 0) {
                result.push({
                  sectionId: numericId,
                  sectionName,
                  status: 'warning' as StatusLevel,
                  message: `${warningLamps.length} lamp${
                    warningLamps.length > 1 ? 's' : ''
                  } below 50% life`,
                });
              }
            } else {
              // Single lamp with issue
              const [lampId, lampStatus] = problemLamps[0];
              result.push({
                sectionId: numericId,
                sectionName,
                status: lampStatus.status as StatusLevel,
                message: `Lamp ${lampId}: ${lampStatus.message}`,
              });
            }
          }
          break;
        case 'cleaning':
          if (
            status.cleaning.status === 'warning' ||
            status.cleaning.status === 'error'
          ) {
            result.push({
              sectionId: numericId,
              sectionName,
              status: status.cleaning.status,
              message: status.cleaning.details?.[0] || status.cleaning.message,
            });
          }
          break;
        case 'pressure':
          if (
            status.pressureButton?.status === 'warning' ||
            status.pressureButton?.status === 'error'
          ) {
            result.push({
              sectionId: numericId,
              sectionName,
              status: status.pressureButton.status,
              message: status.pressureButton.message,
            });
          }
          break;
        case 'door':
          if (
            status.door?.status === 'warning' ||
            status.door?.status === 'error'
          ) {
            result.push({
              sectionId: numericId,
              sectionName,
              status: status.door.status,
              message: status.door.message,
            });
          }
          break;
      }
    }

    return result;
  },
}));
