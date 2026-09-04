import { afterEach, describe, expect, it, vi } from 'vitest';
import { listAuditEvents, recordAuditEvent } from './data.js';

const ctx = {
  user: { id: 'user-admin' }, organizationId: 'org-audit', role: 'ADMIN', employeeId: null,
};

function makeAuditSql({ failInsert = false } = {}) {
  const events = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (text.startsWith('INSERT INTO organization_audit_events')) {
      if (failInsert) {
        return Promise.reject(new Error('audit unavailable'));
      }
      events.push({
        organization_id: values[0], actor_user_id: values[1], event_type: values[2],
        target_type: values[3], target_id: values[4], metadata: JSON.parse(values[5]),
      });
      return Promise.resolve([]);
    }
    if (text.includes('SELECT count(*)::int AS count')) {
      return Promise.resolve([{ count: events.length }]);
    }
    if (text.includes('FROM organization_audit_events')) {
      return Promise.resolve(events.map((event, index) => ({
        id: `event-${index}`,
        created_at: '2026-09-04T00:00:00.000Z',
        metadata: event.metadata,
        ...event,
      })));
    }
    return Promise.resolve([]);
  };
  sql.events = events;
  return sql;
}

afterEach(() => vi.restoreAllMocks());

describe('organization audit events', () => {
  it('records a curated event without exposing secrets in metadata', async () => {
    const sql = makeAuditSql();
    await recordAuditEvent(sql, ctx, {
      eventType: 'MEMBER_ROLE_CHANGED',
      targetType: 'USER',
      targetId: 'user-target',
      metadata: { fromRole: 'EMPLOYEE', toRole: 'PLANNER' },
    });

    expect(sql.events).toHaveLength(1);
    expect(sql.events[0]).toMatchObject({
      organization_id: 'org-audit', event_type: 'MEMBER_ROLE_CHANGED', target_id: 'user-target',
    });
    expect(sql.events[0].metadata).not.toHaveProperty('password');
  });

  it('does not block the business mutation when audit storage is unavailable', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recordAuditEvent(makeAuditSql({ failInsert: true }), ctx, {
      eventType: 'AREA_UPDATED', targetType: 'AREA', targetId: 'area-1',
    })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('lists only for organization-scoped ADMIN/OWNER contexts with pagination', async () => {
    const sql = makeAuditSql();
    await recordAuditEvent(sql, ctx, { eventType: 'AREA_CREATED', targetType: 'AREA', targetId: 'area-1' });
    const result = await listAuditEvents(sql, ctx, { page: 1, pageSize: 10 });
    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    expect(result.events[0].eventType).toBe('AREA_CREATED');
    await expect(listAuditEvents(sql, { ...ctx, role: 'PLANNER' }))
      .rejects.toMatchObject({ status: 403 });
    await expect(listAuditEvents(sql, { ...ctx, role: 'EMPLOYEE', employeeId: 'employee-1' }))
      .rejects.toMatchObject({ status: 403 });
  });
});
