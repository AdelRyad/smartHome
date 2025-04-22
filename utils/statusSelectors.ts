import useWorkingHoursStore from './workingHoursStore';

/**
 * Returns a list of all lamps with warning or error status, including sectionId, lampId, percentLeft, and status.
 * @param sectionId If provided, checks only that section. Otherwise, checks all sections.
 * @returns Array of { sectionId, lampId, percentLeft, status: 'warning' | 'error' }
 */
export function getAllLampWarnings(sectionId?: number): Array<{
  sectionId: number;
  lampId: number;
  percentLeft: number;
  status: 'warning' | 'error';
}> {
  const workingHours = useWorkingHoursStore.getState().workingHours;
  let result: Array<{
    sectionId: number;
    lampId: number;
    percentLeft: number;
    status: 'warning' | 'error';
  }> = [];

  const sectionIds =
    sectionId !== undefined
      ? [sectionId]
      : Object.keys(workingHours).map(Number);

  for (const secId of sectionIds) {
    const lamps = workingHours[secId] || {};
    for (const lampIdStr in lamps) {
      const lampId = Number(lampIdStr);
      const lamp = lamps[lampId];
      if (
        lamp &&
        lamp.currentHours !== null &&
        lamp.maxHours !== null &&
        lamp.maxHours > 0
      ) {
        const percentLeft = 1 - lamp.currentHours / lamp.maxHours;
        if (percentLeft < 0.1) {
          result.push({sectionId: secId, lampId, percentLeft, status: 'error'});
        } else if (percentLeft < 0.5) {
          result.push({
            sectionId: secId,
            lampId,
            percentLeft,
            status: 'warning',
          });
        }
      }
    }
  }
  return result;
}
