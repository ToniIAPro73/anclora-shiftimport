import type { ScheduleVersion } from './remote';

/** Server limit of `POST /api/schedules/publish-pending` (F4-M03 / OD-F4-02). */
export const PUBLISH_PENDING_MAX = 12;

/** Pending = a DRAFT whose week has not ended. This only LISTS; what can really be published is decided by the server, week by week. */
export function pendingVersions(versions: ScheduleVersion[], today: string): ScheduleVersion[] {
  return versions.filter((version) => version.status === 'DRAFT' && version.periodEnd >= today).sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}
