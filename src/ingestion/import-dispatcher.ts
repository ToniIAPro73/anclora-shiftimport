import type { DetectedTeamEmployee } from './team-roster';

export type ImportFlow = 'blocked' | 'individual' | 'team';

/** One routing rule shared by every structured roster adapter and the UI. */
export function detectImportFlow(employees: Pick<DetectedTeamEmployee, 'name'>[]): ImportFlow {
  if (employees.length === 0) return 'blocked';
  if (employees.length === 1) return 'individual';
  return 'team';
}
