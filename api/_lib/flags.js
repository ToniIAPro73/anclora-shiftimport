/**
 * Server-side feature switches (spec §17.3). Every switch defaults to OFF and the server re-checks it on every request:
 * the Neon branch is shared by every Git branch (INV-11), so the schema (migration 0050) can exist while the feature is dark.
 */
const isOn = (value) => String(value ?? '').trim().toLowerCase() === 'true';

/** Master switch for time-off requests (vacations). OFF ⇒ every `/api/me/time-off-requests*` route answers 404. */
export function isTimeOffEnabled(env = process.env) {
  return isOn(env.TIME_OFF_ENABLED);
}
