/**
 * Build-time feature switches (spec §17.3). They default to OFF: with `VITE_TIME_OFF_ENABLED` unset the UI is identical to
 * the pre-F2 app and never calls `/api/me/time-off-requests*`. The server flag `TIME_OFF_ENABLED` is checked independently
 * on every request, so turning this one on against a server that has it off just yields 404s that the UI treats as "unavailable".
 */
interface FlagEnv {
  readonly VITE_TIME_OFF_ENABLED?: string;
}

export function isTimeOffUiEnabled(env: FlagEnv = import.meta.env): boolean {
  return String(env.VITE_TIME_OFF_ENABLED ?? '').trim().toLowerCase() === 'true';
}
