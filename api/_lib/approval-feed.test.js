import { describe, expect, it } from 'vitest';
import { mergeApprovalFeeds } from './approval-feed.js';

const item = (kind, id, sortAt) => ({ kind, id, sortAt });

describe('mergeApprovalFeeds (ALL: two ordered streams, one deterministic order)', () => {
  it('newest first by sortAt across kinds, ties broken by id (kind never decides)', () => {
    const merged = mergeApprovalFeeds([
      { requests: [item('SHIFT_CHANGE', 'a', '2026-11-03T10:00:00.000Z'), item('SHIFT_CHANGE', 'c', '2026-11-01T10:00:00.000Z')], hasMore: false },
      { requests: [item('TIME_OFF', 'b', '2026-11-03T10:00:00.000Z'), item('TIME_OFF', 'd', '2026-11-02T10:00:00.000Z')], hasMore: false },
    ], 10);
    expect(merged.requests.map((r) => r.id)).toEqual(['b', 'a', 'd', 'c']);
    expect(merged.hasMore).toBe(false);
  });

  it('is independent of the order the feeds are given in', () => {
    const one = { requests: [item('SHIFT_CHANGE', 'a', '2026-11-03T10:00:00.000Z')], hasMore: false };
    const two = { requests: [item('TIME_OFF', 'b', '2026-11-03T10:00:00.000Z')], hasMore: false };
    expect(mergeApprovalFeeds([one, two], 5).requests.map((r) => r.id)).toEqual(mergeApprovalFeeds([two, one], 5).requests.map((r) => r.id));
  });

  it('cuts to the limit and reports there is more; a feed that has more also makes it true', () => {
    const a = { requests: [item('SHIFT_CHANGE', 'a', '2026-11-03T10:00:00.000Z'), item('SHIFT_CHANGE', 'b', '2026-11-02T10:00:00.000Z')], hasMore: false };
    const b = { requests: [item('TIME_OFF', 'c', '2026-11-01T10:00:00.000Z')], hasMore: false };
    expect(mergeApprovalFeeds([a, b], 2)).toEqual({ requests: [a.requests[0], a.requests[1]], hasMore: true });
    expect(mergeApprovalFeeds([a, { ...b, hasMore: true }], 5).hasMore).toBe(true);
  });

  it('a single feed passes through untouched', () => {
    const only = { requests: [item('TIME_OFF', 'x', '2026-11-03T10:00:00.000Z')], hasMore: false };
    expect(mergeApprovalFeeds([only], 3)).toEqual(only);
  });
});
