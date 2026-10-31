import { useEffect, useState } from 'react';
import { isTimeOffUiEnabled } from '../../lib/flags';
import { loadRemoteTimeOffRequests } from '../../lib/remote';

/** Fired by the employee's "Vacaciones y ausencias" section after a request is created or cancelled, so the calendar refreshes. */
export const TIME_OFF_CHANGED_EVENT = 'anclora:time-off-changed';

export interface PendingTimeOffRange { id: string; startDate: string; endDate: string }

/**
 * The employee's own PENDING vacation requests for the displayed year, as a visual layer for the calendar (spec §5.4). It never feeds
 * the statistics. Off by default (`VITE_TIME_OFF_ENABLED`) and silent on any failure (a 404 just means the server flag is off).
 */
export function usePendingTimeOff(enabled: boolean, year: number): PendingTimeOffRange[] {
  const [pending, setPending] = useState<PendingTimeOffRange[]>([]);
  const [version, setVersion] = useState(0);
  const active = enabled && isTimeOffUiEnabled();

  useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined;
    const refresh = () => setVersion((value) => value + 1);
    window.addEventListener(TIME_OFF_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(TIME_OFF_CHANGED_EVENT, refresh);
  }, [active]);

  useEffect(() => {
    if (!active) {
      setPending([]);
      return undefined;
    }
    let cancelled = false;
    // A request counts in the year of its start date but may run into the next one: read both.
    void Promise.all([year, year - 1].map((value) => loadRemoteTimeOffRequests({ year: value, status: 'PENDING' }).catch(() => null)))
      .then((results) => {
        if (cancelled) return;
        const requests = results.flatMap((result) => result?.requests ?? []);
        setPending(requests.filter((request) => request.status === 'PENDING').map((request) => ({ id: request.id, startDate: request.startDate, endDate: request.endDate })));
      });
    return () => { cancelled = true; };
  }, [active, year, version]);

  return pending;
}
