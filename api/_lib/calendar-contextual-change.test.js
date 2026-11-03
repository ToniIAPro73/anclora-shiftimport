import { beforeEach, describe, expect, it } from 'vitest';
import { applyCalendarChange, getDayHistory } from './calendar.js';
import { getOperationalDate, shiftOperationalDate } from './operational-date.js';

/**
 * Contextual shift operations (SDD "Sustituir / Añadir") over the EXISTING `applyCalendarChange` flow.
 * The fake SQL models one employee-day. A transaction is atomic: if its in-transaction guard fails (the day moved under us) nothing is
 * committed, exactly like the real `sql.transaction`.
 */
const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const EMP = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';
const DATE = '2026-11-10';

const row = (id, shiftType, startTime, endTime, extra = {}) => ({
  id, organization_id: ORG, employee_id: EMP, import_id: null, area_id: null, date: DATE,
  start_time: startTime, end_time: endTime, location: shiftType, origin: 'MAN', shift_type: shiftType,
  counts_as_work: !['Libre', 'Vacaciones', 'Baja'].includes(shiftType), layer: 'CHANGE', provenance: 'MANUAL_ADMIN_CHANGE',
  legacy_origin: null, duty_role: null, effective_state: 'EFFECTIVE', plan_revision: 1, change_id: null, time_off_request_id: null,
  ...extra,
});

let state;
function makeSql() {
  const text = (strings) => strings.join(' ').replace(/\s+/g, ' ').trim();
  const sql = (strings, ...values) => {
    const t = text(strings);
    if (t.startsWith('SELECT id, status FROM employees')) {
      return Promise.resolve(values[1] === state.orgOfEmployee ? [{ id: EMP, status: 'active' }] : []);
    }
    if (t.startsWith('SELECT area_id FROM employees')) return Promise.resolve([{ area_id: null }]);
    if (t.includes('FROM shifts') && t.includes('ORDER BY start_time')) return Promise.resolve(state.rows.map((r) => ({ ...r })));
    if (t.includes('INTO organization_audit_events')) {
      state.audit.push({ eventType: values[2], targetType: values[3], targetId: values[4], metadata: JSON.parse(values[5]) });
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };
  sql.transaction = async (build) => {
    const statements = [];
    const txn = (strings, ...values) => { statements.push({ text: text(strings), values }); return { text: text(strings), values }; };
    const list = build(txn);
    // The day changed between the application read and the write: the gate statement stores `false`, every write is conditioned on it
    // and the last statement reports it (modelled here as: nothing is committed and `applied` is false).
    const gate = list.find((entry) => entry.text.includes("set_config('f4.day_ok'"));
    let applied = true;
    if (gate) {
      const expected = gate.values[gate.values.length - 1];
      const current = state.liveRows.filter((r) => r.effective_state === 'EFFECTIVE' && r.shift_type.toLowerCase() !== 'jt').map((r) => r.id).sort();
      applied = JSON.stringify(expected) === JSON.stringify(current);
    }
    if (applied) state.committed.push(...list.filter((entry) => !entry.text.includes('AS applied')));
    return [...list.slice(0, -1).map(() => []), [{ applied }]];
  };
  return sql;
}

const ctx = (role = 'ADMIN', extra = {}) => ({
  user: { id: USER }, organizationId: ORG, role, employeeId: null, plannerScopeType: 'ORGANIZATION', ...extra,
});
const writes = (kind) => state.committed.filter((entry) => entry.text.startsWith(kind));
const updates = () => writes('UPDATE shifts');
const inserts = () => writes('INSERT INTO shifts');

async function change(input, context = ctx()) {
  return applyCalendarChange(makeSql(), context, { employeeId: EMP, date: DATE, reason: 'Trabajo extraordinario', ...input });
}
const reject = async (promise) => promise.then(() => { throw new Error('expected a rejection'); }, (error) => error);

beforeEach(() => {
  state = { rows: [], liveRows: [], committed: [], audit: [], orgOfEmployee: ORG };
});
const setDay = (...rows) => { state.rows = rows; state.liveRows = rows.map((r) => ({ ...r })); };

describe('REPLACE', () => {
  it('day off + Extras: the day off is superseded (kept in history), Extras is effective (D-01)', async () => {
    setDay(row('off', 'Libre', null, null));
    const result = await change({ changeType: 'TYPE_CHANGE', supersedeShiftIds: ['off'], after: [{ shiftType: 'Extras', startTime: '16:00', endTime: '19:00' }], expectedEffectiveShiftIds: ['off'] });
    expect(updates()).toHaveLength(1);
    expect(updates()[0].text).toContain("effective_state = 'SUPERSEDED'");
    expect(updates()[0].values).toContain('off');
    expect(inserts()).toHaveLength(1);
    expect(result.supersededShiftIds).toEqual(['off']);
    expect(result.after.map((r) => r.shiftType)).toEqual(['Extras']);
    // before/after trail in calendar_changes keeps the day off
    const trail = writes('INSERT INTO calendar_changes')[0];
    expect(JSON.parse(trail.values[10]).map((r) => r.shiftType)).toEqual(['Libre']);
    expect(trail.values).toContain('Trabajo extraordinario');
    expect(state.audit[0].eventType).toBe('CALENDAR_CHANGE_APPLIED');
    expect(state.audit[0].metadata.supersededShiftIds).toEqual(['off']);
  });

  it('Regular + corrected Regular: only the new one stays effective', async () => {
    setDay(row('reg', 'Regular', '08:00', '16:00'));
    await change({ changeType: 'TIME_CHANGE', supersedeShiftIds: ['reg'], after: [{ shiftType: 'Regular', startTime: '09:00', endTime: '17:00' }] });
    expect(updates().map((u) => u.values.find((v) => v === 'reg'))).toEqual(['reg']);
    expect(inserts()).toHaveLength(1);
  });

  it('several rows: supersedes exactly the selected one and leaves the others untouched', async () => {
    setDay(row('morning', 'Regular', '08:00', '12:00'), row('afternoon', 'Regular', '14:00', '18:00'));
    await change({ changeType: 'TIME_CHANGE', supersedeShiftIds: ['afternoon'], after: [{ shiftType: 'Regular', startTime: '14:00', endTime: '19:00' }] });
    expect(updates()).toHaveLength(1);
    expect(updates()[0].values).toContain('afternoon');
    expect(JSON.stringify(updates())).not.toContain('morning');
  });

  it('a replacement that leaves an inconsistent day is rejected without any write', async () => {
    setDay(row('morning', 'Regular', '08:00', '12:00'), row('afternoon', 'Regular', '14:00', '18:00'));
    const error = await reject(change({ changeType: 'TIME_CHANGE', supersedeShiftIds: ['morning'], after: [{ shiftType: 'Regular', startTime: '14:00', endTime: '19:00' }] }));
    expect(error.statusCode ?? error.status).toBe(422);
    expect(error.code).toBe('OVERLAP');
    expect(state.committed).toHaveLength(0);
  });

  it('rejects a target that is not an effective row of that day', async () => {
    setDay(row('reg', 'Regular', '08:00', '16:00'));
    const error = await reject(change({ changeType: 'TIME_CHANGE', supersedeShiftIds: ['ghost'], after: [{ shiftType: 'Regular', startTime: '09:00', endTime: '17:00' }] }));
    expect(error.code).toBe('SHIFT_NOT_EFFECTIVE');
    expect(state.committed).toHaveLength(0);
  });
});

describe('ADD', () => {
  it('day off + Extras via ADD is rejected: nothing changes', async () => {
    setDay(row('off', 'Libre', null, null));
    const error = await reject(change({ changeType: 'ADD_EXTRA', after: [{ shiftType: 'Extras', startTime: '16:00', endTime: '19:00' }] }));
    expect(error.code).toBe('FULL_DAY_WITH_WORK');
    expect(state.committed).toHaveLength(0);
  });

  it('Regular + non-overlapping Extras: both effective, nothing superseded (D-03)', async () => {
    setDay(row('reg', 'Regular', '08:00', '16:00'));
    const result = await change({ changeType: 'ADD_EXTRA', after: [{ shiftType: 'Extras', startTime: '18:00', endTime: '21:00' }], expectedEffectiveShiftIds: ['reg'] });
    expect(updates()).toHaveLength(0);
    expect(inserts()).toHaveLength(1);
    expect(result.after.map((r) => r.shiftType).sort()).toEqual(['Extras', 'Regular']);
  });

  it('overlap blocks the add with no partial write', async () => {
    setDay(row('reg', 'Regular', '08:00', '16:00'));
    const error = await reject(change({ changeType: 'ADD_EXTRA', after: [{ shiftType: 'Extras', startTime: '15:00', endTime: '18:00' }] }));
    expect(error.code).toBe('OVERLAP');
    expect(state.committed).toHaveLength(0);
  });

  it('an add can never name rows to supersede', async () => {
    setDay(row('reg', 'Regular', '08:00', '16:00'));
    const error = await reject(change({ changeType: 'ADD_EXTRA', supersedeShiftIds: ['reg'], after: [{ shiftType: 'Extras', startTime: '18:00', endTime: '21:00' }] }));
    expect(error.code).toBe('ADD_CANNOT_SUPERSEDE');
    expect(state.committed).toHaveLength(0);
  });
});

describe('concurrency', () => {
  it('the in-transaction guard is an explicit flag: no error is provoked, every write is conditioned on it, and the last statement reports it', async () => {
    setDay(row('reg', 'Regular', '08:00', '16:00'));
    await change({ changeType: 'ADD_EXTRA', after: [{ shiftType: 'Extras', startTime: '18:00', endTime: '21:00' }] });
    const gate = state.committed.find((entry) => entry.text.includes("set_config('f4.day_ok'"));
    expect(gate.text).toContain(', true)'); // transaction-local
    expect(gate.text).not.toMatch(/\/\s*\(|1 \/ 0|day_unchanged/); // no division by zero
    const writes = state.committed.filter((entry) => /^(INSERT|UPDATE)/.test(entry.text));
    expect(writes.length).toBeGreaterThan(1);
    expect(writes.every((entry) => entry.text.includes("current_setting('f4.day_ok', true) = 'true'"))).toBe(true);
    expect(state.committed.some((entry) => entry.text.includes('FOR UPDATE'))).toBe(true);
  });

  it('a dialog opened on stale information is a controlled conflict', async () => {
    setDay(row('reg', 'Regular', '08:00', '16:00'), row('late', 'Extras', '18:00', '20:00'));
    const error = await reject(change({ changeType: 'TIME_CHANGE', supersedeShiftIds: ['reg'], after: [{ shiftType: 'Regular', startTime: '09:00', endTime: '17:00' }], expectedEffectiveShiftIds: ['reg'] }));
    expect(error.statusCode ?? error.status).toBe(409);
    expect(error.code).toBe('DAY_CHANGED');
    expect(state.committed).toHaveLength(0);
  });

  it('a change landing between the read and the write writes NOTHING (the gate is false): no partial write', async () => {
    setDay(row('reg', 'Regular', '08:00', '16:00'));
    state.liveRows = [row('reg', 'Regular', '08:00', '16:00'), row('sneaky', 'Extras', '18:00', '20:00')];
    const error = await reject(change({ changeType: 'TIME_CHANGE', supersedeShiftIds: ['reg'], after: [{ shiftType: 'Regular', startTime: '09:00', endTime: '17:00' }] }));
    expect(error.code).toBe('DAY_CHANGED');
    expect(error.statusCode ?? error.status).toBe(409);
    expect(state.committed).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
  });
});

describe('F3 vacation protection', () => {
  const vacation = () => row('vac', 'Vacaciones', null, null, { time_off_request_id: '55555555-5555-4555-8555-555555555555', provenance: 'EMPLOYEE_REQUEST' });

  it('nothing is added beside an approved vacation', async () => {
    setDay(vacation());
    const error = await reject(change({ changeType: 'ADD_EXTRA', after: [{ shiftType: 'Extras', startTime: '16:00', endTime: '19:00' }] }, ctx('ADMIN')));
    expect(error.code).toBe('PROTECTED_ABSENCE_DAY');
    expect(state.committed).toHaveLength(0);
  });

  it('a PLANNER cannot replace an approved vacation: today/future is closed by the direct-write rule, history by the override rule', async () => {
    const today = getOperationalDate();
    const replace = { changeType: 'TYPE_CHANGE', supersedeShiftIds: ['vac'], after: [{ shiftType: 'Extras', startTime: '16:00', endTime: '19:00' }] };
    setDay(vacation());
    const future = await reject(change({ ...replace, date: shiftOperationalDate(today, 30) }, ctx('PLANNER')));
    expect(future.statusCode ?? future.status).toBe(403);
    expect(future.code).toBe('PLANNER_DIRECT_WRITE_FORBIDDEN');
    const history = await reject(change({ ...replace, date: shiftOperationalDate(today, -3) }, ctx('PLANNER')));
    expect(history.statusCode ?? history.status).toBe(403);
    expect(history.code).toBe('PROTECTED_ABSENCE_OVERRIDE_FORBIDDEN');
    expect(state.committed).toHaveLength(0);
  });


  it('an ADMIN/OWNER can replace it explicitly and the override is audited against the request', async () => {
    for (const role of ['ADMIN', 'OWNER']) {
      state = { rows: [], liveRows: [], committed: [], audit: [], orgOfEmployee: ORG };
      setDay(vacation());
      await change({ changeType: 'TYPE_CHANGE', supersedeShiftIds: ['vac'], after: [{ shiftType: 'Extras', startTime: '16:00', endTime: '19:00' }] }, ctx(role));
      expect(updates()).toHaveLength(1);
      const override = state.audit.find((event) => event.eventType === 'time_off_request.manual_override');
      expect(override).toMatchObject({ targetType: 'TIME_OFF_REQUEST', targetId: '55555555-5555-4555-8555-555555555555' });
      expect(override.metadata).toMatchObject({ actorRole: role, replacedShiftIds: ['vac'] });
    }
  });
});

describe('access', () => {
  it('an EMPLOYEE cannot edit the calendar: no write', async () => {
    setDay(row('reg', 'Regular', '08:00', '16:00'));
    const error = await reject(change({ changeType: 'ADD_EXTRA', after: [{ shiftType: 'Extras', startTime: '18:00', endTime: '21:00' }] }, ctx('EMPLOYEE')));
    expect(error.statusCode ?? error.status).toBe(403);
    expect(state.committed).toHaveLength(0);
  });

  it('an employee of another tenant is neither visible nor writable', async () => {
    setDay(row('reg', 'Regular', '08:00', '16:00'));
    state.orgOfEmployee = OTHER_ORG;
    const error = await reject(change({ changeType: 'ADD_EXTRA', after: [{ shiftType: 'Extras', startTime: '18:00', endTime: '21:00' }] }));
    expect(error.statusCode ?? error.status).toBe(403);
    expect(state.committed).toHaveLength(0);
  });

  it('a PLANNER outside the employee scope cannot change the day', async () => {
    setDay(row('reg', 'Regular', '08:00', '16:00'));
    const scoped = ctx('PLANNER', { plannerScopeType: 'EMPLOYEES', scopedEmployeeIds: ['99999999-9999-4999-8999-999999999999'] });
    const error = await reject(change({ changeType: 'ADD_EXTRA', after: [{ shiftType: 'Extras', startTime: '18:00', endTime: '21:00' }] }, scoped));
    expect(error.statusCode ?? error.status).toBe(403);
    expect(state.committed).toHaveLength(0);
  });
});

describe('day history exposure', () => {
  it('an employee of another tenant exposes neither rows nor the change trail', async () => {
    setDay(row('off', 'Libre', null, null, { effective_state: 'SUPERSEDED' }));
    state.orgOfEmployee = OTHER_ORG;
    const error = await reject(getDayHistory(makeSql(), ctx('ADMIN'), EMP, DATE));
    expect(error.statusCode ?? error.status).toBe(403);
  });

  it('returns the superseded day off together with the current shift for an authorised actor', async () => {
    setDay(row('off', 'Libre', null, null, { effective_state: 'SUPERSEDED' }), row('ex', 'Extras', '08:00', '15:00'));
    const history = await getDayHistory(makeSql(), ctx('ADMIN'), EMP, DATE);
    expect(history.rows.map((r) => `${r.shiftType}:${r.effectiveState}`).sort()).toEqual(['Extras:EFFECTIVE', 'Libre:SUPERSEDED']);
  });
});

describe('F4-M03 OD-F4-03: PLANNER and the operational calendar (POST /api/calendar/changes)', () => {
  const today = getOperationalDate();
  const future = shiftOperationalDate(today, 14);
  const past = shiftOperationalDate(today, -5);
  const planner = ctx('PLANNER');
  const add = { changeType: 'ADD_EXTRA', after: [{ shiftType: 'Extras', startTime: '16:00', endTime: '19:00' }] };
  const replaceOff = { changeType: 'TYPE_CHANGE', supersedeShiftIds: ['off'], after: [{ shiftType: 'Extras', startTime: '16:00', endTime: '19:00' }], expectedEffectiveShiftIds: ['off'] };

  it.each([['today', today], ['a future day', future]])('direct ADD on %s is DENIED (403) and writes nothing', async (_label, date) => {
    setDay(row('reg', 'Regular', '08:00', '12:00'));
    const error = await reject(change({ ...add, date, expectedEffectiveShiftIds: ['reg'] }, planner));
    expect(error.statusCode ?? error.status).toBe(403);
    expect(error.code).toBe('PLANNER_DIRECT_WRITE_FORBIDDEN');
    expect(state.committed).toHaveLength(0);
  });

  it.each([['today', today], ['a future day', future]])('direct REPLACE on %s is DENIED (403) and writes nothing', async (_label, date) => {
    setDay(row('off', 'Libre', null, null));
    const error = await reject(change({ ...replaceOff, date }, planner));
    expect(error.statusCode ?? error.status).toBe(403);
    expect(error.code).toBe('PLANNER_DIRECT_WRITE_FORBIDDEN');
    expect(state.committed).toHaveLength(0);
  });

  it('a PLANNER with a narrower scope is denied the same way (the date rule does not depend on the scope)', async () => {
    setDay(row('off', 'Libre', null, null));
    const scoped = ctx('PLANNER', { plannerScopeType: 'EMPLOYEES', plannerEmployeeIds: ['99999999-9999-4999-8999-999999999999'] });
    const error = await reject(change({ ...replaceOff, date: future }, scoped));
    expect(error.statusCode ?? error.status).toBe(403);
    expect(state.committed).toHaveLength(0);
  });

  it('HISTORY stays allowed: a PLANNER in scope registers a change on a past day', async () => {
    setDay();
    await change({ ...add, date: past }, planner);
    expect(inserts()).toHaveLength(1);
  });

  it('OWNER/ADMIN direct changes on today and the future are unaffected', async () => {
    for (const role of ['OWNER', 'ADMIN']) {
      for (const date of [today, future]) {
        state = { rows: [], liveRows: [], committed: [], audit: [], orgOfEmployee: ORG };
        setDay(row('off', 'Libre', null, null));
        await change({ ...replaceOff, date }, ctx(role));
        expect(inserts()).toHaveLength(1);
      }
    }
  });
});

describe('F4-AUD-03: concurrency of REPLACE / ADD', () => {
  it('the employee-day is serialised by an advisory lock that is the FIRST statement of the transaction (also when the day has no row to lock)', async () => {
    setDay(); // an empty day: nothing for FOR UPDATE to lock
    await change({ changeType: 'ADD_SHIFT', after: [{ shiftType: 'Regular', startTime: '08:00', endTime: '12:00' }], expectedEffectiveShiftIds: [] });
    expect(state.committed[0].text).toContain('pg_advisory_xact_lock');
    expect(state.committed[0].values[0]).toBe(`day:${ORG}:${EMP}:${DATE}`);
    expect(state.committed[1].text).toContain('FOR UPDATE'); // the row lock stays as well
  });

  it('a REPLACE takes the same day lock', async () => {
    setDay(row('off', 'Libre', null, null));
    await change({ changeType: 'TYPE_CHANGE', supersedeShiftIds: ['off'], after: [{ shiftType: 'Extras', startTime: '16:00', endTime: '19:00' }], expectedEffectiveShiftIds: ['off'] });
    expect(state.committed[0].text).toContain('pg_advisory_xact_lock');
  });
});
