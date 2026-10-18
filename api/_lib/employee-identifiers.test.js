import { describe, expect, it } from 'vitest';
import { assertSourceIdentifierTarget } from './employee-identifiers.js';

const ctx = { organizationId: 'org-1' };
/** Minimal tagged-template stub: answers the two queries the guard issues. */
function fakeSql({ mapped = null, canonical = null }) {
  return (strings) => {
    const text = strings.join('?');
    if (text.includes('employee_source_identifiers')) return Promise.resolve(mapped ? [{ employee_id: mapped }] : []);
    if (text.includes('external_employee_id')) return Promise.resolve([{ external_employee_id: canonical }]);
    return Promise.resolve([]);
  };
}
const guard = (sql, employeeId = 'emp-qa') =>
  assertSourceIdentifierTarget(sql, ctx, { sourceSystem: 'TRYP_EMPLOYEE_CALENDAR', sourceIdentifier: '6888', employeeId });

describe('source identifier guard (6888 is never silently 84881)', () => {
  it('passes when the number is explicitly mapped to the target employee', async () => {
    await expect(guard(fakeSql({ mapped: 'emp-qa', canonical: '84881' }))).resolves.toBeUndefined();
  });
  it('rejects when the number is mapped to someone else', async () => {
    await expect(guard(fakeSql({ mapped: 'emp-other', canonical: '84881' }))).rejects.toMatchObject({ status: 409, code: 'SOURCE_IDENTIFIER_MISMATCH' });
  });
  it('rejects an unmapped number whose canonical id differs (6888 vs 84881): fail closed, no name-based linking', async () => {
    await expect(guard(fakeSql({ mapped: null, canonical: '84881' }))).rejects.toMatchObject({ status: 409, code: 'SOURCE_IDENTIFIER_UNMAPPED' });
  });
  it('passes an unmapped number equal to the canonical id', async () => {
    await expect(assertSourceIdentifierTarget(fakeSql({ canonical: '84881' }), ctx, { sourceSystem: 'TRYP_TEAM_SCHEDULE', sourceIdentifier: '84881', employeeId: 'emp-qa' })).resolves.toBeUndefined();
  });
  it('is a no-op for documents without a source number', async () => {
    await expect(assertSourceIdentifierTarget(fakeSql({}), ctx, { sourceSystem: null, sourceIdentifier: null, employeeId: 'x' })).resolves.toBeUndefined();
  });
});

import { createSourceIdentifierMapping, employeeNameKey, normalizeNameKey, resolveSourceIdentity } from './employee-identifiers.js';

/** Stub for the queries resolveSourceIdentity / createSourceIdentifierMapping issue. */
function identitySql({ org = 'ShiftImport', employees, mapped = null }) {
  const inserted = [];
  const sql = (strings, ...values) => {
    const text = strings.join('?');
    if (text.includes('FROM organizations')) return Promise.resolve([{ name: org }]);
    if (text.includes('INSERT INTO employee_source_identifiers')) { inserted.push(values); return Promise.resolve([]); }
    if (text.includes('employee_source_identifiers')) {
      const id = inserted.length ? inserted[0][1] : mapped;
      return Promise.resolve(id ? [{ employee_id: id, id, name: employees.find((e) => e.id === id)?.name, external_employee_id: employees.find((e) => e.id === id)?.external_employee_id, status: 'active' }] : []);
    }
    if (text.includes('FROM employees') && text.includes('external_employee_id = ')) return Promise.resolve([]);
    if (text.includes('FROM employees')) return Promise.resolve(employees.map((e) => ({ status: 'active', ...e })));
    return Promise.resolve([]);
  };
  sql.inserted = inserted;
  return sql;
}
const SEB = { id: 'seb', name: 'Sebastián Pozo Mendoza', external_employee_id: '84881' };
const OTHER = { id: 'other', name: 'Ana López', external_employee_id: '111' };
const admin = { organizationId: 'org-1', role: 'ADMIN', user: { id: 'u1' } };
const self = { organizationId: 'org-1', role: 'EMPLOYEE', employeeId: 'seb', user: { id: 'u2' } };
const doc = (extra = {}) => ({ sourceSystem: 'TRYP_EMPLOYEE_CALENDAR', externalIdentifier: '6888', documentName: 'Sebastian Pozo Mendoza', ...extra });

describe('resolveSourceIdentity (canonical 84881 vs TRYP 6888)', () => {
  it('normalises case, accents, punctuation and spaces only', () => {
    expect(normalizeNameKey('  SEBASTIÁN   Pozo-Mendoza. ')).toBe('sebastian pozo mendoza');
    expect(employeeNameKey('Sebastián Pozo Mendoza — QA', 'ShiftImport — QA Mirror')).toBe('sebastian pozo mendoza');
    // production names are never decorated-stripped
    expect(employeeNameKey('Sebastián Pozo Mendoza — QA', 'ShiftImport')).toBe('sebastian pozo mendoza qa');
  });
  it('1: a known alias resolves automatically', async () => {
    const r = await resolveSourceIdentity(identitySql({ employees: [SEB, OTHER], mapped: 'seb' }), admin, doc());
    expect(r).toMatchObject({ status: 'MAPPED', employee: { id: 'seb', externalEmployeeId: '84881' } });
  });
  it('2: unknown alias + unique name match proposes that employee (also in the QA mirror with the "— QA" decoration)', async () => {
    const qa = { ...SEB, name: 'Sebastián Pozo Mendoza — QA' };
    const r = await resolveSourceIdentity(identitySql({ org: 'ShiftImport — QA Mirror', employees: [qa, OTHER] }), admin, doc());
    expect(r).toMatchObject({ status: 'CANDIDATE', employee: { id: 'seb', externalEmployeeId: '84881' } });
  });
  it('2a: production org — unmapped alias 6888 + unique name (accents/case/spacing aside) -> CANDIDATE carrying the canonical id 84881', async () => {
    for (const printed of ['Sebastian Pozo Mendoza', 'SEBASTIÁN  POZO   MENDOZA', ' sebastian pozo-mendoza. ']) {
      const r = await resolveSourceIdentity(identitySql({ org: 'CIF Import', employees: [{ ...SEB, name: 'Sebastián Pozo Mendoza' }, OTHER] }), { ...admin, role: 'OWNER' }, doc({ documentName: printed }));
      expect(r.status).toBe('CANDIDATE');
      expect(r.employee).toMatchObject({ id: 'seb', name: 'Sebastián Pozo Mendoza', externalEmployeeId: '84881' });
    }
  });
  it('2b: the decoration is NOT ignored in a production organization (no weakening)', async () => {
    const qa = { ...SEB, name: 'Sebastián Pozo Mendoza — QA' };
    expect((await resolveSourceIdentity(identitySql({ employees: [qa, OTHER] }), admin, doc())).status).toBe('NONE');
  });
  it('3: no alias and no name match -> no candidate (manual selector)', async () => {
    expect((await resolveSourceIdentity(identitySql({ employees: [OTHER] }), admin, doc())).status).toBe('NONE');
  });
  it('4: several exact name matches -> ambiguous, nothing is chosen', async () => {
    const twin = { id: 'twin', name: 'SEBASTIAN POZO MENDOZA', external_employee_id: '222' };
    const r = await resolveSourceIdentity(identitySql({ employees: [SEB, twin] }), admin, doc());
    expect(r.status).toBe('AMBIGUOUS');
    expect(r.employee).toBeNull();
    expect(r.candidates.map((c) => c.externalEmployeeId).sort()).toEqual(['222', '84881']);
  });
  it('5: alias mapped to A while the name points unambiguously to B -> mismatch (fail closed)', async () => {
    const r = await resolveSourceIdentity(identitySql({ employees: [SEB, OTHER], mapped: 'other' }), admin, doc());
    expect(r.status).toBe('MISMATCH');
  });
  it('the 6888 document number is never taken for the canonical 84881', async () => {
    const r = await resolveSourceIdentity(identitySql({ employees: [{ ...SEB, name: 'Otro Nombre' }, OTHER] }), admin, doc());
    expect(r.status).toBe('NONE');
  });
});

describe('association (explicit, idempotent) and EMPLOYEE self-binding', () => {
  it('6: an admin confirmation stores the alias', async () => {
    const sql = identitySql({ employees: [SEB, OTHER] });
    const r = await createSourceIdentifierMapping(sql, admin, { ...doc(), employeeId: 'seb' });
    expect(r.created).toBe(true);
    expect(sql.inserted).toHaveLength(1);
  });
  it('9: an EMPLOYEE may bind the alias to THEIR OWN record when the document name identifies them', async () => {
    const sql = identitySql({ employees: [SEB, OTHER] });
    expect((await createSourceIdentifierMapping(sql, self, { ...doc(), employeeId: 'seb' })).created).toBe(true);
  });
  it('10: an EMPLOYEE can never bind it to somebody else, nor to a system they cannot self-bind, nor without a matching name', async () => {
    const sql = () => identitySql({ employees: [SEB, OTHER] });
    await expect(createSourceIdentifierMapping(sql(), self, { ...doc(), employeeId: 'other' })).rejects.toMatchObject({ status: 403 });
    await expect(createSourceIdentifierMapping(sql(), self, { ...doc({ sourceSystem: 'TRYP_TEAM_SCHEDULE' }), employeeId: 'seb' })).rejects.toMatchObject({ status: 403 });
    await expect(createSourceIdentifierMapping(sql(), self, { ...doc({ documentName: 'Ana López' }), employeeId: 'seb' })).rejects.toMatchObject({ status: 403 });
  });
});
