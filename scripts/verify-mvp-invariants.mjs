/* Read-only MVP invariant check for Neon development.
 *
 * Usage:
 *   node --env-file=.env.development.local scripts/verify-mvp-invariants.mjs
 *
 * The host guard is intentional: this script must never become a convenient
 * way to run the release check against production by mistake.
 */
import { neon } from '@neondatabase/serverless';

const DEVELOPMENT_HOST_PREFIX = 'ep-winter-bird-';

function databaseUrl() {
  const value = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!value) throw new Error('DATABASE_URL/POSTGRES_URL is not configured');
  const url = new URL(value);
  if (!url.hostname.startsWith(DEVELOPMENT_HOST_PREFIX)) {
    throw new Error('Refusing to run: database host is not the documented Neon development host');
  }
  return value;
}

console.log('Database target: Neon development (host prefix verified)');

function count(rows) {
  return Number(rows[0]?.count ?? 0);
}

const sql = neon(databaseUrl());
const results = [];

async function check(name, query, expected = 0) {
  const rows = await query();
  const actual = count(rows);
  const passed = actual === expected;
  results.push({ name, passed, actual, expected });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${actual}`);
}

async function checkPresent(name, query) {
  const rows = await query();
  const actual = count(rows);
  const passed = actual > 0;
  results.push({ name, passed, actual, expected: '>0' });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${actual}`);
}

await check('tenant columns are NOT NULL', () => sql`
  SELECT COUNT(*)::int AS count
  FROM (VALUES
    ('employees'), ('imports'), ('shifts'), ('schedules'),
    ('format_profiles'), ('organization_audit_events'), ('notifications'),
    ('change_requests'), ('approval_requests')
  ) AS expected(table_name)
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = expected.table_name
   AND c.column_name = 'organization_id'
  WHERE c.is_nullable IS DISTINCT FROM 'NO'
`);

await check('shifts have an employee in the same organization', () => sql`
  SELECT COUNT(*)::int AS count
  FROM shifts s
  LEFT JOIN employees e
    ON e.id = s.employee_id
   AND e.organization_id = s.organization_id
  WHERE e.id IS NULL
`);

await check('imports reference an employee in the same organization when present', () => sql`
  SELECT COUNT(*)::int AS count
  FROM imports i
  LEFT JOIN employees e
    ON e.id = i.employee_id
   AND e.organization_id = i.organization_id
  WHERE i.employee_id IS NOT NULL
    AND e.id IS NULL
`);

await check('schedule assignments stay inside their schedule organization', () => sql`
  SELECT COUNT(*)::int AS count
  FROM shift_assignments sa
  JOIN schedule_versions sv ON sv.id = sa.schedule_version_id
  JOIN schedules s ON s.id = sv.schedule_id
  LEFT JOIN employees e
    ON e.id = sa.employee_id
   AND e.organization_id = s.organization_id
  WHERE e.id IS NULL
`);

await check('change requests keep employee, shift and organization aligned', () => sql`
  SELECT COUNT(*)::int AS count
  FROM change_requests cr
  LEFT JOIN employees e
    ON e.id = cr.employee_id
   AND e.organization_id = cr.organization_id
  LEFT JOIN shifts s
    ON s.id = cr.shift_id
   AND s.employee_id = cr.employee_id
   AND s.organization_id = cr.organization_id
  WHERE e.id IS NULL OR s.id IS NULL
`);

await check('approval requests keep change request organization aligned', () => sql`
  SELECT COUNT(*)::int AS count
  FROM approval_requests ar
  LEFT JOIN change_requests cr
    ON cr.id = ar.change_request_id
   AND cr.organization_id = ar.organization_id
  WHERE cr.id IS NULL
`);

await check('organizations have at most one OWNER', () => sql`
  SELECT COUNT(*)::int AS count
  FROM memberships
  WHERE role = 'OWNER'
  GROUP BY organization_id
  HAVING COUNT(*) > 1
`);

await check('active format profiles have unique structureHash per tenant', () => sql`
  SELECT COUNT(*)::int AS count
  FROM format_profiles
  WHERE status != 'deprecated'
    AND signature->>'structureHash' IS NOT NULL
  GROUP BY organization_id, signature->>'structureHash'
  HAVING COUNT(*) > 1
`);

await check('approval requests are unique per change request', () => sql`
  SELECT COUNT(*)::int AS count
  FROM approval_requests
  GROUP BY change_request_id
  HAVING COUNT(*) > 1
`);

await checkPresent('format profile structureHash unique index exists', () => sql`
  SELECT COUNT(*)::int AS count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'format_profiles_org_structurehash_active_idx'
`);

await checkPresent('approval request uniqueness constraint exists', () => sql`
  SELECT COUNT(*)::int AS count
  FROM pg_constraint
  WHERE conname = 'approval_requests_change_request_unique'
`);

const failures = results.filter((result) => !result.passed);
console.log(`MVP invariant check: ${failures.length === 0 ? 'PASS' : 'FAIL'} (${results.length} checks)`);
if (failures.length > 0) process.exitCode = 1;
