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
import {useCurrentSectionStore} from './useCurrentSectionStore';

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
  if (percentLeft <= 0) return 'error';
  if (percentLeft < 0.3) return 'warning';
  return 'good';
};

const getCleaningStatus = (
  runHours: number | null,
  setpoint: number | null,
): StatusLevel => {
  if (setpoint === null || setpoint === 0 || runHours === null) return 'good';

  const percentUsed = (runHours / setpoint) * 100; // Convert to percentage
  console.log(
    `runHours: ${runHours}, setpoint: ${setpoint}, percentUsed: ${percentUsed}%`,
  );

  if (percentUsed >= 100) return 'error'; // Over limit (100%)
  if (percentUsed >= 90) return 'warning'; // Nearing limit (90%)
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

      // PRESSURE BUTTON STATUS
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

      // DPS STATUS
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

        // Important fix: Explicitly handle null and false cases
        if (dpsOk === false) {
          dps = 'error';
          if (!dpsDetail.length) dpsDetail = ['DPS pressure issue detected.'];
        } else if (dpsOk === null) {
          dps = 'error';
          if (!dpsDetail.length) dpsDetail = ['Failed to read DPS status.'];
        } else {
          dps = 'good';
          if (!dpsDetail.length) dpsDetail = ['DPS pressure is normal.'];
        }
      } catch (e: any) {
        dps = 'error';
        dpsDetail = [e?.message || 'DPS error.'];
      }

      // LAMP STATUS
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
            message = `Lamp has reached end of life (${percentLeft}% remaining).`;
          } else if (status === 'warning') {
            message = `Lamp is below 30% of its life (${percentLeft}% remaining).`;
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

      // CLEANING STATUS
      let cleaning: StatusLevel = 'good';
      let cleaningDetail: string = 'Cleaning status unknown.';
      try {
        const setpoint = await readCleaningHoursSetpoint(section.ip, 502);
        const runHours = await readSingleLampCleaningRunHours(section.ip, 502);
        const remaining =
          setpoint !== null && runHours !== null ? setpoint - runHours : null;

        cleaning = getCleaningStatus(runHours, setpoint);

        const percentUsed =
          setpoint && remaining !== null
            ? Math.round((remaining / setpoint) * 100)
            : null;

        if (cleaning === 'error') {
          cleaningDetail = `Cleaning overdue (${percentUsed}% of limit used)`;
        } else if (cleaning === 'warning') {
          cleaningDetail = `Cleaning needed soon (${percentUsed}% of limit used)`;
        } else if (remaining !== null && setpoint !== null) {
          cleaningDetail = `${remaining} hours remaining until cleaning needed`;
        } else {
        }
      } catch (e: any) {
        cleaning = 'error';
        cleaningDetail = e?.message || 'Failed to read cleaning status.';
      }

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
              : 'DPS pressure issue detected.',
          details: dpsDetail,
        },
        lamps,
        cleaning: {
          status: cleaning,
          message:
            cleaning === 'good'
              ? 'Cleaning hours are healthy.'
              : cleaning === 'warning'
              ? 'Cleaning hours below 10%.'
              : 'Cleaning hours exceeded: maintenance required.',
          details: [cleaningDetail],
        },
        pressureButton: {
          status: pressureButton,
          message:
            pressureButton === 'good'
              ? 'Pressure button is normal.'
              : 'Pressure button issue detected.',
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
        // Count sections with at least one error lamp as 1 error
        errorCount: Object.values(statusBySection).filter(section =>
          Object.values(section.lamps).some(lamp => lamp.status === 'error'),
        ).length,
        // Count sections with warnings (but no errors) as 1 warning
        warningCount: Object.values(statusBySection).filter(
          section =>
            !Object.values(section.lamps).some(
              lamp => lamp.status === 'error',
            ) &&
            Object.values(section.lamps).some(
              lamp => lamp.status === 'warning',
            ),
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
    const {currentSectionId} = useCurrentSectionStore.getState(); // Get current section ID from the other store
    const result = [];

    // If there's a current section ID, only return status for that section
    if (currentSectionId !== null) {
      const status = statusBySection[currentSectionId];
      if (!status) return []; // Section not found

      const sectionName =
        sectionNames[currentSectionId] || `Section ${currentSectionId}`;

      switch (statusType) {
        case 'dps_pressure':
        case 'dps':
          // Always include the status regardless of whether it's good/warning/error
          result.push({
            sectionId: currentSectionId,
            sectionName,
            status: status.dps.status as StatusLevel,
            message: status.dps.details?.[0] || status.dps.message,
          });
          break;

        case 'lamp':
          // Check for the special "missing lamps" message first
          const missingLampsEntry = status.lamps[0];
          if (missingLampsEntry && missingLampsEntry.status === 'error') {
            result.push({
              sectionId: currentSectionId,
              sectionName,
              status: 'error',
              message: missingLampsEntry.message,
            });
          }

          // Check individual lamp statuses
          const allLamps = Object.entries(status.lamps).filter(
            ([id]) => id !== '0',
          ); // Exclude special entry

          // Group lamps by status
          const errorLamps = allLamps.filter(([_, s]) => s.status === 'error');
          const warningLamps = allLamps.filter(
            ([_, s]) => s.status === 'warning',
          );
          const goodLamps = allLamps.filter(([_, s]) => s.status === 'good');

          // Always show at least one status entry, prioritizing most severe status
          if (errorLamps.length > 0) {
            result.push({
              sectionId: currentSectionId,
              sectionName,
              status: 'error' as StatusLevel,
              message:
                errorLamps.length > 1
                  ? `${errorLamps.length} lamps with critical issues`
                  : `Lamp ${errorLamps[0][0]}: ${errorLamps[0][1].message}`,
            });
          } else if (warningLamps.length > 0) {
            result.push({
              sectionId: currentSectionId,
              sectionName,
              status: 'warning' as StatusLevel,
              message:
                warningLamps.length > 1
                  ? `${warningLamps.length} lamps below 30% life`
                  : `Lamp ${warningLamps[0][0]}: ${warningLamps[0][1].message}`,
            });
          } else if (goodLamps.length > 0) {
            result.push({
              sectionId: currentSectionId,
              sectionName,
              status: 'good' as StatusLevel,
              message: 'All lamps are healthy',
            });
          }
          break;

        case 'cleaning':
          // Always include status regardless of good/warning/error
          result.push({
            sectionId: currentSectionId,
            sectionName,
            status: status.cleaning.status,
            message: status.cleaning.details || status.cleaning.message,
          });
          break;

        case 'pressure':
          // Always include status regardless of good/warning/error
          result.push({
            sectionId: currentSectionId,
            sectionName,
            status: status.pressureButton.status,
            message:
              status.pressureButton.details?.[0] ||
              status.pressureButton.message,
          });
          break;

        case 'door':
          // Always include status regardless of good/warning/error
          if (status.door) {
            result.push({
              sectionId: currentSectionId,
              sectionName,
              status: status.door.status,
              message: status.door.details?.[0] || status.door.message,
            });
          }
          break;

        default:
          console.warn(`Unknown status type: ${statusType}`);
          break;
      }

      return result;
    }

    // For cases when we don't have a current section ID - handle all sections
    for (const [sectionId, status] of Object.entries(statusBySection)) {
      const numericId = Number(sectionId);
      const sectionName = sectionNames[numericId] || `Section ${sectionId}`;

      switch (statusType) {
        case 'dps_pressure':
        case 'dps':
          // Only include errors and warnings in the global view
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
              message: `${sectionName}: ${missingLampsEntry.message}`,
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
                message: `${sectionName}: ${errorLamps.length} lamp${
                  errorLamps.length > 1 ? 's' : ''
                } with critical issues`,
              });
            }

            if (warningLamps.length > 0) {
              result.push({
                sectionId: numericId,
                sectionName,
                status: 'warning' as StatusLevel,
                message: `${sectionName}: ${warningLamps.length} lamp${
                  warningLamps.length > 1 ? 's' : ''
                } below 30% life`,
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
              message: `${sectionName}: ${
                status.cleaning.details?.[0] || status.cleaning.message
              }`,
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
              message: `${sectionName}: ${
                status.pressureButton.details?.[0] ||
                status.pressureButton.message
              }`,
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
              message: `${sectionName}: ${
                status.door.details?.[0] || status.door.message
              }`,
            });
          }
          break;
      }
    }

    return result;
  },
}));
