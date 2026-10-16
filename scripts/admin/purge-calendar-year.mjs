#!/usr/bin/env node
/**
 * Scoped purge of the operational calendar data of ONE organization and ONE
 * calendar year.
 *
 *   node --env-file=.env.local scripts/admin/purge-calendar-year.mjs \
 *     --organization ShiftImport --year 2025            # dry-run (default)
 *   ... --apply [--backup-dir <dir>]                    # backup + transactional delete
 *
 * Guarantees: dry-run unless --apply; current/future years refused unless
 * --allow-current-or-future-year; one transaction (ROLLBACK on any failed
 * check); data outside the year (same org and other orgs) is fingerprinted
 * before/after and must be byte-identical; employees, users, memberships,
 * annual targets, audit events and every other organization are never touched.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Purge scope, in dependency order (children first). `$1` = organization id,
 * `$2` = first day (inclusive), `$3` = first day of the next year (exclusive).
 * Tables are DISCOVERED against the real schema; nothing here is invented:
 * each entry names the rows that belong to the org + year.
 */
export const PURGE_SCOPE = Object.freeze([
  {
    table: 'notifications',
    note: 'notifications about shifts / change requests of the year',
    where: `organization_id = $1 AND resource_id IN (
      SELECT id FROM shifts WHERE organization_id = $1 AND date >= $2 AND date < $3
      UNION SELECT cr.id FROM change_requests cr JOIN shifts s ON s.id = cr.shift_id AND s.employee_id = cr.employee_id
        WHERE cr.organization_id = $1 AND s.date >= $2 AND s.date < $3)`,
  },
  {
    table: 'approval_requests',
    note: 'approvals of change requests on shifts of the year',
    where: `organization_id = $1 AND change_request_id IN (
      SELECT cr.id FROM change_requests cr JOIN shifts s ON s.id = cr.shift_id AND s.employee_id = cr.employee_id
      WHERE cr.organization_id = $1 AND s.date >= $2 AND s.date < $3)`,
  },
  {
    table: 'change_requests',
    note: 'change requests on shifts of the year',
    where: `organization_id = $1 AND (shift_id, employee_id) IN (
      SELECT id, employee_id FROM shifts WHERE organization_id = $1 AND date >= $2 AND date < $3)`,
  },
  {
    table: 'shift_acknowledgements',
    note: 'acknowledgements of shifts of the year',
    where: `(shift_id, employee_id) IN (SELECT id, employee_id FROM shifts WHERE organization_id = $1 AND date >= $2 AND date < $3)`,
  },
  {
    table: 'shift_comments',
    note: 'comments on shifts of the year',
    where: `(shift_id, employee_id) IN (SELECT id, employee_id FROM shifts WHERE organization_id = $1 AND date >= $2 AND date < $3)`,
  },
  {
    table: 'calendar_changes',
    note: 'effective-calendar change trail dated in the year',
    where: `organization_id = $1 AND date >= $2 AND date < $3`,
  },
  {
    table: 'shifts',
    note: 'calendar rows (all layers/states) dated in the year',
    where: `organization_id = $1 AND date >= $2 AND date < $3`,
  },
  {
    table: 'shift_assignments',
    note: 'published schedule assignments dated in the year',
    where: `date >= $2 AND date < $3 AND schedule_version_id IN (
      SELECT sv.id FROM schedule_versions sv JOIN schedules sc ON sc.id = sv.schedule_id WHERE sc.organization_id = $1)`,
  },
  {
    table: 'imports',
    note: 'import records of the year (period_year)',
    where: `organization_id = $1 AND period_year = $4`,
    extraParam: 'year',
  },
]);

/** Fingerprint inputs: everything OUTSIDE the purge year, per org + all other orgs. */
const FINGERPRINTS = Object.freeze([
  { name: 'org_shifts_outside_year', sql: `SELECT id, employee_id, import_id, date, start_time, end_time, shift_type, effective_state, layer, plan_revision, change_id, duty_role, updated_at FROM shifts WHERE organization_id = $1 AND NOT (date >= $2 AND date < $3) ORDER BY id` },
  { name: 'org_calendar_changes_outside_year', sql: `SELECT id, employee_id, date, change_type, reason, before_state, after_state, created_at FROM calendar_changes WHERE organization_id = $1 AND NOT (date >= $2 AND date < $3) ORDER BY id` },
  { name: 'org_annual_targets', sql: `SELECT id, employee_id, year, minimum_annual_minutes, maximum_annual_minutes, updated_at FROM employee_annual_targets WHERE organization_id = $1 ORDER BY id` },
  { name: 'org_employees', sql: `SELECT id, name, external_employee_id FROM employees WHERE organization_id = $1 ORDER BY id` },
  { name: 'other_orgs_shifts', sql: `SELECT id, organization_id, date, updated_at FROM shifts WHERE organization_id <> $1 ORDER BY id` },
  { name: 'other_orgs_imports', sql: `SELECT id, organization_id, updated_at FROM imports WHERE organization_id <> $1 ORDER BY id` },
]);

export function parseArgs(argv) {
  const args = { apply: false, allowCurrentOrFuture: false, backupDir: null, organization: null, year: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--allow-current-or-future-year') args.allowCurrentOrFuture = true;
    else if (arg === '--organization') args.organization = argv[++index];
    else if (arg === '--year') args.year = Number(argv[++index]);
    else if (arg === '--backup-dir') args.backupDir = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

export function validateRequest({ organization, year, allowCurrentOrFuture }, now = new Date()) {
  if (!organization) throw new Error('--organization <name|uuid> is required');
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error('--year must be an integer between 2000 and 2200');
  if (year >= now.getUTCFullYear() && !allowCurrentOrFuture) {
    throw new Error(`Refusing to purge ${year}: current/future years need --allow-current-or-future-year`);
  }
  return { from: `${year}-01-01`, to: `${year + 1}-01-01` };
}

async function resolveOrganization(client, organization) {
  const result = UUID_RE.test(organization)
    ? await client.query('SELECT id, name FROM organizations WHERE id = $1', [organization])
    : await client.query('SELECT id, name FROM organizations WHERE lower(name) = lower($1)', [organization]);
  if (result.rows.length !== 1) {
    throw new Error(`Organization "${organization}" matched ${result.rows.length} rows; refusing to continue`);
  }
  return result.rows[0];
}

// Every statement binds the same four typed parameters (a pinned, typed tail keeps
// PostgreSQL from failing on parameters a given scope entry does not reference).
const paramsFor = (_entry, orgId, from, to, year) => [orgId, from, to, year];
const scoped = (entry) => `(${entry.where}) AND $1::uuid IS NOT NULL AND $2::date IS NOT NULL AND $3::date IS NOT NULL AND $4::int IS NOT NULL`;

async function countScope(client, orgId, from, to, year) {
  const counts = {};
  for (const entry of PURGE_SCOPE) {
    const sql = `SELECT COUNT(*)::int AS n FROM ${entry.table} WHERE ${scoped(entry)}`;
    counts[entry.table] = (await client.query(sql, paramsFor(entry, orgId, from, to, year))).rows[0].n;
  }
  return counts;
}

export async function fingerprint(client, orgId, from, to) {
  const out = {};
  for (const entry of FINGERPRINTS) {
    const rows = (await client.query(entry.sql, [orgId, from, to].slice(0, entry.sql.includes('$2') ? 3 : 1))).rows;
    out[entry.name] = { rows: rows.length, sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
  }
  return out;
}

async function effectiveSummary(client, orgId, from, to) {
  const { computeEffectiveStats } = await import('../../src/lib/effective-calendar.js');
  const rows = (await client.query(
    `SELECT id, TO_CHAR(date,'YYYY-MM-DD') AS date, employee_id, start_time, end_time, shift_type, location, counts_as_work,
            layer, provenance, legacy_origin, duty_role, effective_state, plan_revision
     FROM shifts WHERE organization_id = $1 AND NOT (date >= $2 AND date < $3)`, [orgId, from, to],
  )).rows;
  const perEmployee = new Map();
  for (const row of rows) {
    if (!perEmployee.has(row.employee_id)) perEmployee.set(row.employee_id, []);
    perEmployee.get(row.employee_id).push(row);
  }
  let effectiveMinutes = 0;
  for (const list of perEmployee.values()) effectiveMinutes += computeEffectiveStats(list).total.effectiveMinutes;
  return { effectiveMinutesOutsideYear: effectiveMinutes, employees: perEmployee.size };
}

export async function writeBackup(client, { orgId, orgName, year, from, to, dir }) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tables = [];
  for (const entry of PURGE_SCOPE) {
    const sql = `SELECT * FROM ${entry.table} WHERE ${scoped(entry)}`;
    const rows = (await client.query(sql, paramsFor(entry, orgId, from, to, year))).rows;
    const file = path.join(dir, `${entry.table}.json`);
    const body = JSON.stringify(rows);
    writeFileSync(file, body, { mode: 0o600 });
    tables.push({ table: entry.table, rows: rows.length, file: path.basename(file), sha256: createHash('sha256').update(body).digest('hex') });
  }
  const manifest = { organization: { id: orgId, name: orgName }, year, range: { from, toExclusive: to }, createdAt: new Date().toISOString(), tables };
  const manifestBody = JSON.stringify(manifest, null, 2);
  writeFileSync(path.join(dir, 'manifest.json'), manifestBody, { mode: 0o600 });
  return { manifest, manifestSha256: createHash('sha256').update(manifestBody).digest('hex') };
}

export async function runPurge(client, request, { log = console.log, now = new Date(), defaultBackupDir } = {}) {
  const { from, to } = validateRequest(request, now);
  const org = await resolveOrganization(client, request.organization);
  const { year } = request;
  const before = await countScope(client, org.id, from, to, year);
  const total = Object.values(before).reduce((sum, n) => sum + n, 0);
  const fingerprintBefore = await fingerprint(client, org.id, from, to);
  const effectiveBefore = await effectiveSummary(client, org.id, from, to);
  const report = {
    organization: org, year, mode: request.apply ? 'APPLY' : 'DRY_RUN',
    before, rowsToDeleteTotal: total, fingerprintBefore, effectiveBefore,
    rowsOutsideYearAffected: 0, otherOrganizationsAffected: 0,
  };
  log(`[purge] organization=${org.name} (${org.id}) year=${year} mode=${report.mode}`);
  for (const [table, n] of Object.entries(before)) log(`[purge]   ${table}: ${n}`);
  log(`[purge] ROWS_TO_DELETE_TOTAL=${total}`);
  if (!request.apply) { report.dryRun = 'PASS'; return report; }

  const dir = request.backupDir ?? path.join(defaultBackupDir ?? path.join(os.homedir(), 'anclora-backups-purge'), `purge-${org.name.toLowerCase()}-${year}-${now.toISOString().replace(/[:.]/g, '-')}`);
  report.backup = await writeBackup(client, { orgId: org.id, orgName: org.name, year, from, to, dir });
  report.backupDir = dir;
  log(`[purge] backup written to ${dir} (manifest sha256=${report.backup.manifestSha256})`);

  await client.query('BEGIN');
  try {
    const deleted = {};
    for (const entry of PURGE_SCOPE) {
      const result = await client.query(`DELETE FROM ${entry.table} WHERE ${scoped(entry)}`, paramsFor(entry, org.id, from, to, year));
      deleted[entry.table] = result.rowCount;
    }
    const after = await countScope(client, org.id, from, to, year);
    if (Object.values(after).some((n) => n !== 0)) throw new Error(`Rows remain in scope after delete: ${JSON.stringify(after)}`);
    const fingerprintAfter = await fingerprint(client, org.id, from, to);
    for (const key of Object.keys(fingerprintBefore)) {
      if (fingerprintBefore[key].sha256 !== fingerprintAfter[key].sha256) throw new Error(`Fingerprint changed for ${key}; rolling back`);
    }
    const effectiveAfter = await effectiveSummary(client, org.id, from, to);
    if (effectiveAfter.effectiveMinutesOutsideYear !== effectiveBefore.effectiveMinutesOutsideYear) {
      throw new Error('Effective minutes outside the purged year changed; rolling back');
    }
    await client.query('COMMIT');
    Object.assign(report, { deleted, after, fingerprintAfter, effectiveAfter, hashMatch: true, purgeApplied: true });
    log(`[purge] APPLIED. HASH_MATCH=true after=${JSON.stringify(after)}`);
    return report;
  } catch (error) {
    await client.query('ROLLBACK');
    log(`[purge] ROLLED BACK: ${error.message}`);
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { default: pg } = await import('pg');
  const args = parseArgs(process.argv.slice(2));
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const report = await runPurge(client, args, {
      defaultBackupDir: process.env.ANCLORA_BACKUPS_DIR
        ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../anclora-backups/projects/anclora-shiftimport'),
    });
    console.log(JSON.stringify({ ...report, fingerprintBefore: undefined, fingerprintAfter: undefined }, null, 2));
    if (report.fingerprintBefore) console.log('[purge] fingerprint(before)=', Object.fromEntries(Object.entries(report.fingerprintBefore).map(([k, v]) => [k, v.sha256.slice(0, 16)])));
  } finally {
    await client.end();
  }
}
