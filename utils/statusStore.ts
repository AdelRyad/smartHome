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

      // Default values for status objects to prevent undefined errors later
      let dpsStatus: SectionDetailedStatus = {
        status: 'good',
        message: 'Checking DPS...',
        details: [],
      };
      let pressureButtonStatus: SectionDetailedStatus = {
        status: 'good',
        message: 'Checking button...',
        details: [],
      };
      let lamps: Record<number, SectionDetailedStatus> = {};
      let cleaningStatus: SectionDetailedStatus = {
        status: 'good',
        message: 'Checking cleaning...',
        details: [],
      };
      let doorStatus: SectionDetailedStatus = {
        status: 'good',
        message: 'Door is secure.',
        details: [],
      }; // Assuming door is always present

      // PRESSURE BUTTON STATUS
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
                pressureButtonStatus.details?.push(msg);
              },
              isOk => {
                clearTimeout(timeout);
                resolve(isOk);
              },
            );
          },
        );

        console.log(`Section ${section.id} pushButtonOk:`, pushButtonOk);
        const status = pushButtonOk === true ? 'good' : 'error';
        pressureButtonStatus = {
          status: status,
          message:
            status === 'good'
              ? 'Pressure button is normal.'
              : 'Pressure button issue detected.',
          details:
            status === 'good'
              ? ['Pressure button is normal.']
              : ['Pressure button issue detected.'],
        };
      } catch (e: any) {
        console.error(
          `Error reading pressure button for section ${section.id}:`,
          e,
        );
        pressureButtonStatus = {
          status: 'error',
          message: 'Failed to read pressure button status.',
          details: [e?.message || 'Failed to read pressure button status.'],
        };
      }

      // DPS STATUS
      try {
        let dpsDetail: string[] = [];
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

        let status: StatusLevel;
        let message: string;
        if (dpsOk === false) {
          status = 'error';
          message = 'DPS pressure issue detected.';
          if (!dpsDetail.length) dpsDetail = [message];
        } else if (dpsOk === null) {
          status = 'error';
          message = 'Failed to read DPS status.';
          if (!dpsDetail.length) dpsDetail = [message];
        } else {
          status = 'good';
          message = 'DPS pressure is normal.';
          if (!dpsDetail.length) dpsDetail = [message];
        }
        dpsStatus = {status, message, details: dpsDetail};
      } catch (e: any) {
        dpsStatus = {
          status: 'error',
          message: 'DPS error.',
          details: [e?.message || 'DPS error.'],
        };
      }

      // LAMP STATUS
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
          Object.values(lamps).some(l => l?.status === 'good')
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
          // Initialize even on error to prevent undefined access
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
          // Use index 0 for this special case
          status: 'error',
          message: `Only ${lampsOnlineCount} of 4 lamps detected`,
        };
      }

      // CLEANING STATUS
      let cleaningDetail: string = 'Cleaning status unknown.';
      try {
        const setpoint = await readCleaningHoursSetpoint(section.ip, 502);
        const runHours = await readSingleLampCleaningRunHours(section.ip, 502);
        const remaining =
          setpoint !== null && runHours !== null ? setpoint - runHours : null;

        const status = getCleaningStatus(runHours, setpoint);

        const percentUsed =
          setpoint && remaining !== null
            ? Math.round(((setpoint - remaining) / setpoint) * 100) // Calculate used percentage
            : null;

        if (status === 'error') {
          cleaningDetail = `Cleaning overdue (${
            percentUsed ?? 'N/A'
          }% of limit used)`;
        } else if (status === 'warning') {
          cleaningDetail = `Cleaning needed soon (${
            percentUsed ?? 'N/A'
          }% of limit used)`;
        } else if (remaining !== null && setpoint !== null) {
          cleaningDetail = `${remaining} hours remaining until cleaning needed`;
        }

        cleaningStatus = {
          status: status,
          message:
            status === 'good'
              ? 'Cleaning hours are healthy.'
              : status === 'warning'
              ? 'Cleaning hours below 10%.'
              : 'Cleaning hours exceeded: maintenance required.',
          details: [cleaningDetail],
        };
      } catch (e: any) {
        cleaningStatus = {
          status: 'error',
          message: 'Failed to read cleaning status.',
          details: [e?.message || 'Failed to read cleaning status.'],
        };
      }

      // Assign all statuses to this section
      statusBySection[section.id] = {
        dps: dpsStatus,
        lamps,
        cleaning: cleaningStatus,
        pressureButton: pressureButtonStatus,
        door: doorStatus, // Ensure door always has a default value
      };
    }

    // Calculate aggregated counts
    const aggregatedStatus = {
      dps: {
        errorCount: Object.values(statusBySection).filter(
          s => s.dps?.status === 'error', // Use optional chaining
        ).length,
        warningCount: Object.values(statusBySection).filter(
          s => s.dps?.status === 'warning', // Use optional chaining
        ).length,
      },
      lamp: {
        // Count sections with at least one error lamp as 1 error
        errorCount: Object.values(statusBySection).filter(
          section =>
            Object.values(section.lamps).some(lamp => lamp?.status === 'error'), // Use optional chaining
        ).length,
        // Count sections with warnings (but no errors) as 1 warning
        warningCount: Object.values(statusBySection).filter(
          section =>
            !Object.values(section.lamps).some(
              lamp => lamp?.status === 'error', // Use optional chaining
            ) &&
            Object.values(section.lamps).some(
              lamp => lamp?.status === 'warning', // Use optional chaining
            ),
        ).length,
      },
      cleaning: {
        errorCount: Object.values(statusBySection).filter(
          s => s.cleaning?.status === 'error', // Use optional chaining
        ).length,
        warningCount: Object.values(statusBySection).filter(
          s => s.cleaning?.status === 'warning', // Use optional chaining
        ).length,
      },
      pressureButton: {
        errorCount: Object.values(statusBySection).filter(
          s => s.pressureButton?.status === 'error', // Use optional chaining
        ).length,
        warningCount: Object.values(statusBySection).filter(
          s => s.pressureButton?.status === 'warning', // Use optional chaining
        ).length,
      },
      door: {
        errorCount: Object.values(statusBySection).filter(
          s => s.door?.status === 'error', // Use optional chaining
        ).length,
        warningCount: Object.values(statusBySection).filter(
          s => s.door?.status === 'warning', // Use optional chaining
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
    const defaultStatus: SectionDetailedStatus = {
      status: 'good',
      message: 'Status unavailable',
    };

    // --- Handling Current Section ---
    if (currentSectionId !== null) {
      const section = statusBySection[currentSectionId];
      // If section data or specific status is missing, return empty or default message
      if (!section) return [];

      const sectionName =
        sectionNames[currentSectionId] || `Section ${currentSectionId}`;

      switch (statusType) {
        case 'dps_pressure':
        case 'dps':
          // Safely access status, provide default if undefined
          const dps = section.dps || defaultStatus;
          result.push({
            sectionId: currentSectionId,
            sectionName,
            status: dps.status as StatusLevel,
            message: dps.details?.[0] || dps.message,
          });
          break;

        case 'lamp':
          // Check for the special "missing lamps" message first
          const missingLampsEntry = section.lamps?.[0]; // Use optional chaining
          if (missingLampsEntry?.status === 'error') {
            // Use optional chaining
            result.push({
              sectionId: currentSectionId,
              sectionName,
              status: 'error',
              message: missingLampsEntry.message,
            });
          }

          // Check individual lamp statuses safely
          const allLamps = Object.entries(section.lamps || {}).filter(
            // Default to empty object if lamps undefined
            ([id]) => id !== '0',
          );

          const errorLamps = allLamps.filter(([_, s]) => s?.status === 'error'); // Use optional chaining
          const warningLamps = allLamps.filter(
            ([_, s]) => s?.status === 'warning', // Use optional chaining
          );
          const goodLamps = allLamps.filter(([_, s]) => s?.status === 'good'); // Use optional chaining

          if (errorLamps.length > 0) {
            result.push({
              sectionId: currentSectionId,
              sectionName,
              status: 'error' as StatusLevel,
              message:
                errorLamps.length > 1
                  ? `${errorLamps.length} lamps with critical issues`
                  : `Lamp ${errorLamps[0][0]}: ${
                      errorLamps[0][1]?.message || 'Error details missing'
                    }`, // Optional chaining on message
            });
          } else if (warningLamps.length > 0) {
            result.push({
              sectionId: currentSectionId,
              sectionName,
              status: 'warning' as StatusLevel,
              message:
                warningLamps.length > 1
                  ? `${warningLamps.length} lamps below 30% life`
                  : `Lamp ${warningLamps[0][0]}: ${
                      warningLamps[0][1]?.message || 'Warning details missing'
                    }`, // Optional chaining on message
            });
          } else if (goodLamps.length > 0 || allLamps.length === 0) {
            // Show 'healthy' if all good or if lamps object is empty
            result.push({
              sectionId: currentSectionId,
              sectionName,
              status: 'good' as StatusLevel,
              message:
                allLamps.length === 0
                  ? 'Lamp status not available'
                  : 'All lamps are healthy',
            });
          }
          break;

        case 'cleaning':
          const cleaning = section.cleaning || defaultStatus;
          result.push({
            sectionId: currentSectionId,
            sectionName,
            status: cleaning.status,
            message: cleaning.details?.[0] || cleaning.message, // Access details safely
          });
          break;

        case 'pressure':
          const pressureButton = section.pressureButton || defaultStatus;
          result.push({
            sectionId: currentSectionId,
            sectionName,
            status: pressureButton.status,
            message: pressureButton.details?.[0] || pressureButton.message, // Access details safely
          });
          break;

        case 'door':
          const door = section.door || defaultStatus; // Handle potentially undefined door
          result.push({
            sectionId: currentSectionId,
            sectionName,
            status: door.status,
            message: door.details?.[0] || door.message, // Access details safely
          });
          break;

        default:
          console.warn(
            `Unknown status type for current section: ${statusType}`,
          );
          break;
      }

      return result.map(item => ({
        ...item,
        status: item.status as StatusLevel,
      }));
    }

    // --- Handling All Sections (Global View) ---
    for (const [sectionId, section] of Object.entries(statusBySection)) {
      const numericId = Number(sectionId);
      const sectionName = sectionNames[numericId] || `Section ${sectionId}`;

      // Skip if section data is missing
      if (!section) continue;

      switch (statusType) {
        case 'dps_pressure':
        case 'dps':
          // Check status safely
          if (
            section.dps?.status === 'warning' || // Use optional chaining
            section.dps?.status === 'error' // Use optional chaining
          ) {
            result.push({
              sectionId: numericId,
              sectionName,
              status: section.dps.status as StatusLevel,
              message: section.dps.details?.[0] || section.dps.message, // Access details safely
            });
          }
          break;

        case 'lamp':
          // Check for the special "missing lamps" message first safely
          const missingLampsEntry = section.lamps?.[0]; // Optional chaining
          if (missingLampsEntry?.status === 'error') {
            // Optional chaining
            result.push({
              sectionId: numericId,
              sectionName,
              status: 'error',
              message: `${sectionName}: ${missingLampsEntry.message}`,
            });
          }

          // Check individual lamp statuses safely
          const problemLamps = Object.entries(section.lamps || {}) // Default to empty object
            .filter(([id]) => id !== '0')
            .filter(
              ([_, lampStatus]) =>
                lampStatus?.status === 'warning' ||
                lampStatus?.status === 'error', // Optional chaining
            );

          if (problemLamps.length > 0) {
            const errorLamps = problemLamps.filter(
              ([_, s]) => s?.status === 'error', // Optional chaining
            );
            const warningLamps = problemLamps.filter(
              ([_, s]) => s?.status === 'warning', // Optional chaining
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
            section.cleaning?.status === 'warning' || // Optional chaining
            section.cleaning?.status === 'error' // Optional chaining
          ) {
            result.push({
              sectionId: numericId,
              sectionName,
              status: section.cleaning.status,
              message: `${sectionName}: ${
                section.cleaning.details?.[0] || section.cleaning.message // Access details safely
              }`,
            });
          }
          break;

        case 'pressure':
          if (
            section.pressureButton?.status === 'warning' || // Optional chaining
            section.pressureButton?.status === 'error' // Optional chaining
          ) {
            result.push({
              sectionId: numericId,
              sectionName,
              status: section.pressureButton.status,
              message: `${sectionName}: ${
                section.pressureButton.details?.[0] || // Access details safely
                section.pressureButton.message
              }`,
            });
          }
          break;

        case 'door':
          if (
            section.door?.status === 'warning' || // Optional chaining
            section.door?.status === 'error' // Optional chaining
          ) {
            result.push({
              sectionId: numericId,
              sectionName,
              status: section.door.status,
              message: `${sectionName}: ${
                section.door.details?.[0] || section.door.message // Access details safely
              }`,
            });
          }
          break;
        default:
          console.warn(`Unknown status type for global view: ${statusType}`);
          break;
      }
    }

    return result.map(item => ({
      ...item,
      status: item.status as StatusLevel,
    }));
  },
}));
