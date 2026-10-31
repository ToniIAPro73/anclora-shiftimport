// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { loadRemoteTimeOffRequests, type TimeOffRequest } from '../../lib/remote';
import { TIME_OFF_CHANGED_EVENT, usePendingTimeOff } from './use-pending-time-off';

vi.mock('../../lib/remote', () => ({ loadRemoteTimeOffRequests: vi.fn() }));
const load = vi.mocked(loadRemoteTimeOffRequests);
const req = (id: string, status: TimeOffRequest['status'], startDate: string, endDate: string): TimeOffRequest => ({
  id, requestType: 'VACATION', startDate, endDate, requestedDays: 2, comment: '', status, createdAt: '', resolvedAt: null, resolvedByName: null, rejectionReason: null, history: [],
});

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
beforeEach(() => load.mockReset());

describe('usePendingTimeOff (calendar overlay of own pending requests)', () => {
  it('flag OFF (default): returns nothing and never calls the endpoint', async () => {
    const { result } = renderHook(() => usePendingTimeOff(true, 2026));
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it('not enabled for this viewer (not an employee looking at their own calendar): no call even with the flag ON', async () => {
    vi.stubEnv('VITE_TIME_OFF_ENABLED', 'true');
    renderHook(() => usePendingTimeOff(false, 2026));
    await act(async () => { await Promise.resolve(); });
    expect(load).not.toHaveBeenCalled();
  });

  it('flag ON: keeps only PENDING requests, reads this and the previous year, and refreshes on the change event', async () => {
    vi.stubEnv('VITE_TIME_OFF_ENABLED', 'true');
    load.mockResolvedValue({ requests: [req('a', 'PENDING', '2026-08-12', '2026-08-14'), req('b', 'APPROVED', '2026-09-01', '2026-09-02')], summary: { approvedDaysInYear: 0, pendingDays: 0, activeCount: 0 } });
    const { result } = renderHook(() => usePendingTimeOff(true, 2026));
    await waitFor(() => expect(result.current.map((r) => r.id)).toContain('a'));
    expect(result.current.every((r) => r.id === 'a')).toBe(true);
    expect(load).toHaveBeenCalledWith({ year: 2026, status: 'PENDING' });
    expect(load).toHaveBeenCalledWith({ year: 2025, status: 'PENDING' });
    const calls = load.mock.calls.length;
    load.mockResolvedValue({ requests: [], summary: { approvedDaysInYear: 0, pendingDays: 0, activeCount: 0 } });
    act(() => { window.dispatchEvent(new Event(TIME_OFF_CHANGED_EVENT)); });
    await waitFor(() => expect(result.current).toEqual([]));
    expect(load.mock.calls.length).toBeGreaterThan(calls);
  });

  it('a failing endpoint (e.g. 404 with the server flag off) leaves the calendar untouched', async () => {
    vi.stubEnv('VITE_TIME_OFF_ENABLED', 'true');
    // a request that fails (network, or 404 with the server flag off): the hook must swallow it through its own `.catch`
    load.mockImplementation(() => ({ catch: (handler: (error: Error) => unknown) => Promise.resolve(handler(new Error('404'))) }) as never);
    const { result } = renderHook(() => usePendingTimeOff(true, 2026));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(load).toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });
});
