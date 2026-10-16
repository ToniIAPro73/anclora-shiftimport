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
