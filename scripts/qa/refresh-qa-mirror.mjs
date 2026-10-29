#!/usr/bin/env node
/**
 * Rebuilds the persistent QA mirror of the source organization.
 *   node scripts/qa/refresh-qa-mirror.mjs --dry-run      (default)
 *   node scripts/qa/refresh-qa-mirror.mjs --apply
 *
 * SOURCE (production, READ ONLY template) --clone + remap--> TARGET (QA mirror, mutable)
 *
 * - The source is only ever SELECTed; its fingerprint must be identical before/after.
 * - Every DELETE/INSERT is bound to the target organization id, which must pass
 *   assertQaOrganization() (unique QA name, QA identity member, only synthetic members).
 * - No users, sessions, password hashes or employee->user links are copied;
 *   human identities are pseudonymised. Ids are deterministic, so a second run
 *   yields exactly the same state.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROTECTED_SOURCE_ORG_ID, QA_DOMAIN, QA_EMPLOYEE_IDENTITY, QA_IDENTITY, assertNotProtectedSource, assertQaOrganization, connect, deterministicUuid, findQaUser,
  resolveSourceOrganization, sha256, targetNameFor,
} from './qa-lib.mjs';
import { legacyAnnualTargetVersion } from './worktime-target-backfill.mjs';

const COPIED = ['areas', 'employees', 'imports', 'schedules', 'schedule_versions', 'shift_assignments', 'calendar_changes', 'shifts', 'employee_annual_targets', 'employee_worktime_targets', 'format_profiles'];

export async function sourceFingerprint(client, sourceId) {
  const queries = {
    employees: 'SELECT id, name, external_employee_id, user_id, status, area_id FROM employees WHERE organization_id = $1 ORDER BY id',
    shifts: 'SELECT id, employee_id, date, start_time, end_time, shift_type, effective_state, layer, plan_revision, change_id, import_id, updated_at FROM shifts WHERE organization_id = $1 ORDER BY id',
    calendar_changes: 'SELECT id, employee_id, date, change_type, reason, before_state, after_state, created_at FROM calendar_changes WHERE organization_id = $1 ORDER BY id',
    imports: 'SELECT id, file_name, status, shift_count, updated_at FROM imports WHERE organization_id = $1 ORDER BY id',
    schedules: 'SELECT id, area_id, period_start, period_end FROM schedules WHERE organization_id = $1 ORDER BY id',
    annual_targets: 'SELECT id, employee_id, year, minimum_annual_minutes, maximum_annual_minutes, updated_at FROM employee_annual_targets WHERE organization_id = $1 ORDER BY id',
    worktime_targets: 'SELECT id, employee_id, target_kind, period_type, period_start, period_end, minimum_minutes, target_minutes, maximum_minutes, effective_from, revision, included_work_buckets, legacy_annual_target_id FROM employee_worktime_targets WHERE organization_id = $1 ORDER BY id',
    memberships: 'SELECT user_id, role FROM memberships WHERE organization_id = $1 ORDER BY user_id',
    areas: 'SELECT id, name, code, active FROM areas WHERE organization_id = $1 ORDER BY id',
  };
  const parts = {};
  for (const [name, sql] of Object.entries(queries)) {
    const rows = (await client.query(sql, [sourceId])).rows;
    parts[name] = { rows: rows.length, sha256: sha256(JSON.stringify(rows)) };
  }
  return { parts, overall: sha256(JSON.stringify(parts)) };
}

async function readSource(client, sourceId) {
  const q = async (sql) => (await client.query(sql, [sourceId])).rows;
  return {
    areas: await q('SELECT * FROM areas WHERE organization_id = $1 ORDER BY id'),
    employees: await q('SELECT * FROM employees WHERE organization_id = $1 ORDER BY created_at, id'),
    imports: await q('SELECT * FROM imports WHERE organization_id = $1 ORDER BY created_at, id'),
    schedules: await q('SELECT * FROM schedules WHERE organization_id = $1 ORDER BY created_at, id'),
    schedule_versions: await q('SELECT sv.* FROM schedule_versions sv JOIN schedules s ON s.id = sv.schedule_id WHERE s.organization_id = $1 ORDER BY sv.created_at, sv.id'),
    shift_assignments: await q('SELECT a.* FROM shift_assignments a JOIN schedule_versions sv ON sv.id = a.schedule_version_id JOIN schedules s ON s.id = sv.schedule_id WHERE s.organization_id = $1 ORDER BY a.id'),
    calendar_changes: await q('SELECT * FROM calendar_changes WHERE organization_id = $1 ORDER BY created_at, id'),
    shifts: await q('SELECT * FROM shifts WHERE organization_id = $1 ORDER BY date, id'),
    employee_annual_targets: await q('SELECT * FROM employee_annual_targets WHERE organization_id = $1 ORDER BY id'),
    employee_worktime_targets: await q('SELECT * FROM employee_worktime_targets WHERE organization_id = $1 ORDER BY id'),
    format_profiles: await q('SELECT * FROM format_profiles WHERE organization_id = $1 ORDER BY id'),
  };
}

const pad = (n, width) => String(n).padStart(width, '0');

export const MIRROR_YEAR = 2026;
export const PILOT_EXTERNAL_ID = '84881';
export const PILOT_TARGET_MINUTES = Object.freeze({ minimum: 91740, maximum: 92400 }); // 1529 h – 1540 h

const isoDate = (value) => {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return String(value ?? '').slice(0, 10);
};
const inYear = (value, year) => isoDate(value).startsWith(`${year}-`);

/**
 * Keeps ONLY the operational data of one calendar year, dropping everything else while the
 * mirror is built (nothing is copied and deleted afterwards). Referential integrity is preserved:
 * references to excluded parents are nulled or the child is dropped.
 */
export function scopeToYear(source, year = MIRROR_YEAR) {
  const shifts = source.shifts.filter((r) => inYear(r.date, year));
  const calendar_changes = source.calendar_changes.filter((r) => inYear(r.date, year));
  const schedules = source.schedules.filter((r) => isoDate(r.period_end) >= `${year}-01-01` && isoDate(r.period_start) < `${year + 1}-01-01`);
  const scheduleIds = new Set(schedules.map((r) => r.id));
  const schedule_versions = source.schedule_versions.filter((r) => scheduleIds.has(r.schedule_id));
  const versionIds = new Set(schedule_versions.map((r) => r.id));
  const shift_assignments = source.shift_assignments.filter((r) => versionIds.has(r.schedule_version_id) && inYear(r.date, year));
  const usedImports = new Set([...shifts.map((r) => r.import_id), ...shift_assignments.map((r) => r.import_id)].filter(Boolean));
  const imports = source.imports.filter((r) => r.period_year === year || usedImports.has(r.id));
  const importIds = new Set(imports.map((r) => r.id));
  const changeIds = new Set(calendar_changes.map((r) => r.id));
  const shiftIds = new Set(shifts.map((r) => r.id));
  return {
    ...source,
    imports,
    schedules,
    schedule_versions,
    shift_assignments: shift_assignments.map((r) => ({ ...r, import_id: importIds.has(r.import_id) ? r.import_id : null })),
    calendar_changes: calendar_changes.map((r) => ({ ...r, original_shift_id: shiftIds.has(r.original_shift_id) ? r.original_shift_id : null })),
    shifts: shifts.map((r) => ({
      ...r,
      import_id: importIds.has(r.import_id) ? r.import_id : null,
      schedule_version_id: versionIds.has(r.schedule_version_id) ? r.schedule_version_id : null,
      change_id: changeIds.has(r.change_id) ? r.change_id : null,
    })),
    employee_annual_targets: source.employee_annual_targets.filter((r) => r.year === year),
    employee_worktime_targets: (source.employee_worktime_targets ?? []).filter((r) => isoDate(r.period_end) >= `${year}-01-01`
      && isoDate(r.period_start) < `${year + 1}-01-01`),
  };
}

/** Pure transformation: source rows -> mirror rows (remapped ids, pseudonymised people, no auth links). */
export function buildMirror(rawSource, { targetId, qaUserId, qaEmployeeUserId = null }) {
  const source = scopeToYear(rawSource);
  const ns = targetId;
  const map = (kind) => {
    const cache = new Map();
    return (id) => {
      if (id === null || id === undefined) return null;
      if (!cache.has(id)) cache.set(id, deterministicUuid(ns, `${kind}:${id}`));
      return cache.get(id);
    };
  };
  const area = map('area'); const employee = map('employee'); const imp = map('import'); const schedule = map('schedule');
  const version = map('schedule_version'); const shift = map('shift'); const change = map('change');
  const assignment = map('assignment'); const target = map('target'); const worktimeTarget = map('worktime_target'); const profile = map('format_profile');

  const employeeIndex = new Map(source.employees.map((row, index) => [row.id, index + 1]));
  const importIndex = new Map(source.imports.map((row, index) => [row.id, index + 1]));

  const out = {};
  out.areas = source.areas.map((r) => ({ ...r, id: area(r.id), organization_id: targetId }));
  out.employees = source.employees.map((r) => ({
    ...r,
    id: employee(r.id),
    organization_id: targetId,
    // The pilot employee stays recognisable (operational id kept, never linked to a real user).
    name: r.external_employee_id === PILOT_EXTERNAL_ID ? 'Sebastián Pozo Mendoza — QA' : `Empleado QA ${pad(employeeIndex.get(r.id), 3)}`,
    // The payroll number is the stable BUSINESS KEY the importers match on: it is preserved for every
    // employee so real team documents can be imported into the mirror. Names stay pseudonymised and
    // no employee is ever linked to a user.
    external_employee_id: r.external_employee_id ?? null,
    user_id: null,
    area_id: area(r.area_id),
  }));
  // One synthetic employee (never the pilot) is linked to the synthetic EMPLOYEE-role QA user, so the
  // "employees can never plan" rules can be proven end to end. Real users are never linked.
  if (qaEmployeeUserId) {
    const candidate = out.employees.find((e) => e.external_employee_id && e.external_employee_id !== PILOT_EXTERNAL_ID && e.status === 'active');
    if (candidate) candidate.user_id = qaEmployeeUserId;
  }
  out.imports = source.imports.map((r) => {
    const ext = /\.[A-Za-z0-9]{2,5}$/.exec(r.file_name ?? '')?.[0] ?? '';
    return {
      ...r,
      id: imp(r.id),
      organization_id: targetId,
      imported_by_user_id: qaUserId,
      deleted_by_user_id: r.deleted_by_user_id ? qaUserId : null,
      area_id: area(r.area_id),
      employee_id: employee(r.employee_id),
      blocking_employee_id: employee(r.blocking_employee_id),
      file_name: `qa-import-${pad(importIndex.get(r.id), 3)}${ext}`,
      context_fingerprint: null,
    };
  });
  out.schedules = source.schedules.map((r) => ({ ...r, id: schedule(r.id), organization_id: targetId, area_id: area(r.area_id), created_by_user_id: qaUserId }));
  out.schedule_versions = source.schedule_versions.map((r) => ({
    ...r, id: version(r.id), schedule_id: schedule(r.schedule_id), created_by_user_id: qaUserId,
    published_by_user_id: r.published_by_user_id ? qaUserId : null,
  }));
  out.shift_assignments = source.shift_assignments.map((r) => ({
    ...r, id: assignment(r.id), schedule_version_id: version(r.schedule_version_id), employee_id: employee(r.employee_id), import_id: imp(r.import_id),
  }));
  out.calendar_changes = source.calendar_changes.map((r) => ({
    ...r, id: change(r.id), organization_id: targetId, employee_id: employee(r.employee_id),
    actor_user_id: null, approved_by_user_id: null, approval_request_id: null, change_request_id: null,
    original_shift_id: null, // re-linked after shifts exist
  }));
  out.calendar_change_original_shift = source.calendar_changes
    .filter((r) => r.original_shift_id)
    .map((r) => ({ id: change(r.id), original_shift_id: shift(r.original_shift_id) }));
  out.shifts = source.shifts.map((r) => {
    const employeeId = employee(r.employee_id);
    const row = {
      ...r, id: shift(r.id), organization_id: targetId, employee_id: employeeId, import_id: imp(r.import_id),
      area_id: area(r.area_id), schedule_version_id: version(r.schedule_version_id), change_id: change(r.change_id),
    };
    // The fingerprint embeds the (real) employee id; re-key it per mirror employee so it stays
    // unique per row without carrying the source identity. (Not byte-equal to a fresh import's
    // fingerprint: re-importing a pre-existing future week in the mirror may therefore not dedupe.)
    row.semantic_fingerprint = r.semantic_fingerprint ? sha256(`${r.semantic_fingerprint}:${employeeId}`) : null;
    return row;
  });
  out.employee_annual_targets = source.employee_annual_targets.map((r) => ({
    ...r, id: target(r.id), organization_id: targetId, employee_id: employee(r.employee_id), created_by_user_id: null, updated_by_user_id: null,
  }));
  out.employee_worktime_targets = (source.employee_worktime_targets ?? []).map((r) => ({
    ...r, id: worktimeTarget(r.id), organization_id: targetId, employee_id: employee(r.employee_id),
    legacy_annual_target_id: target(r.legacy_annual_target_id), created_by_user_id: null,
  }));
  const copiedLegacyIds = new Set(out.employee_worktime_targets.map((row) => row.legacy_annual_target_id).filter(Boolean));
  for (const legacy of source.employee_annual_targets) {
    if (copiedLegacyIds.has(target(legacy.id))) continue;
    out.employee_worktime_targets.push(legacyAnnualTargetVersion(legacy, {
      organizationId: targetId, employeeId: employee(legacy.employee_id), id: worktimeTarget(legacy.id),
      legacyAnnualTargetId: target(legacy.id), createdByUserId: null,
    }));
  }
  // The pilot employee must have exactly one 2026 target (1529–1540 h); created in the mirror only if the source lacks it.
  const pilot = source.employees.find((r) => r.external_employee_id === PILOT_EXTERNAL_ID);
  if (pilot) {
    const pilotId = employee(pilot.id);
    out.employee_annual_targets = out.employee_annual_targets.filter((t) => t.employee_id !== pilotId);
    out.employee_annual_targets.push({
      id: target(`pilot-${MIRROR_YEAR}`), organization_id: targetId, employee_id: pilotId, year: MIRROR_YEAR,
      minimum_annual_minutes: PILOT_TARGET_MINUTES.minimum, maximum_annual_minutes: PILOT_TARGET_MINUTES.maximum,
      included_shift_types: ['Regular'],
      notes: 'QA mirror target', source: 'QA_MIRROR', created_by_user_id: null, updated_by_user_id: null,
      created_at: new Date('2026-01-01T00:00:00Z').toISOString(), updated_at: new Date('2026-01-01T00:00:00Z').toISOString(),
    });
    out.employee_worktime_targets = out.employee_worktime_targets.filter((t) => !(t.employee_id === pilotId
      && t.target_kind === 'CONTRACTUAL' && t.period_type === 'ANNUAL' && String(t.period_start).startsWith('2026-')));
    out.employee_worktime_targets.push({
      id: worktimeTarget(`pilot-${MIRROR_YEAR}`), organization_id: targetId, employee_id: pilotId,
      target_kind: 'CONTRACTUAL', period_type: 'ANNUAL', period_start: `${MIRROR_YEAR}-01-01`, period_end: `${MIRROR_YEAR}-12-31`,
      minimum_minutes: PILOT_TARGET_MINUTES.minimum, target_minutes: null, maximum_minutes: PILOT_TARGET_MINUTES.maximum,
      effective_from: `${MIRROR_YEAR}-01-01`, revision: 1, source: 'QA_MIRROR', notes: 'QA mirror target',
      included_work_buckets: ['Regular'], legacy_annual_target_id: target(`pilot-${MIRROR_YEAR}`),
      created_by_user_id: null, created_at: new Date(`${MIRROR_YEAR}-01-01T00:00:00Z`).toISOString(),
    });
  }
  out.format_profiles = source.format_profiles.map((r) => ({
    ...r, id: profile(r.id), organization_id: targetId, logical_profile_id: profile(r.logical_profile_id),
    supersedes_profile_id: profile(r.supersedes_profile_id), created_by_user_id: null,
  }));
  return out;
}

async function insertRows(client, table, rows) {
  if (!rows.length) return 0;
  const result = await client.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`, [JSON.stringify(rows)]);
  return result.rowCount;
}

// Source-system mappings and annotations are QA-local state: never copied, always cleared, so the baseline has no
// implicit 6888 -> 84881 association (the E2E associates it explicitly through the admin action).
const WIPE_ORDER = [
  ['import_reversion_items', 'organization_id = $1'],
  ['import_effects', 'organization_id = $1'],
  ['calendar_annotations', 'organization_id = $1'],
  ['employee_source_identifiers', 'organization_id = $1'],
  ['company_plan_revisions', 'organization_id = $1'],
  ['shift_acknowledgements', '(shift_id, employee_id) IN (SELECT id, employee_id FROM shifts WHERE organization_id = $1)'],
  ['shift_comments', '(shift_id, employee_id) IN (SELECT id, employee_id FROM shifts WHERE organization_id = $1)'],
  ['approval_requests', 'organization_id = $1'],
  ['change_requests', 'organization_id = $1'],
  ['notifications', 'organization_id = $1'],
  ['calendar_changes', 'organization_id = $1'],
  ['shifts', 'organization_id = $1'],
  ['shift_assignments', 'schedule_version_id IN (SELECT sv.id FROM schedule_versions sv JOIN schedules s ON s.id = sv.schedule_id WHERE s.organization_id = $1)'],
  ['schedule_versions', 'schedule_id IN (SELECT id FROM schedules WHERE organization_id = $1)'],
  ['schedules', 'organization_id = $1'],
  ['imports', 'organization_id = $1'],
  ['import_reversions', 'organization_id = $1'],
  ['employee_annual_targets', 'organization_id = $1'],
  ['employee_worktime_targets', 'organization_id = $1'],
  ['employees', 'organization_id = $1'],
  ['format_profiles', 'organization_id = $1'],
  ['areas', 'organization_id = $1'],
];

export async function refreshQaMirror(client, { apply = false, log = console.log } = {}) {
  const source = await resolveSourceOrganization(client);
  const qaUser = await findQaUser(client);
  if (!qaUser) throw new Error('QA identity missing: run scripts/qa/ensure-qa-identity.mjs first');
  const targetName = targetNameFor(source);
  const targets = (await client.query('SELECT id, name FROM organizations WHERE name = $1', [targetName])).rows;
  if (targets.length > 1) throw new Error('Multiple QA mirror organizations found; refusing to continue');
  const existing = targets[0] ?? null;
  if (existing && existing.id === source.id) throw new Error('target == source: abort');

  if (source.id !== PROTECTED_SOURCE_ORG_ID) throw new Error('Source organization is not the protected ShiftImport tenant; refusing to continue');
  const before = await sourceFingerprint(client, source.id);
  const data = await readSource(client, source.id);
  const sourceQaMembership = (await client.query(
    'SELECT COUNT(*)::int AS n FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = $1 AND lower(u.email) = lower($2)', [source.id, QA_IDENTITY],
  )).rows[0].n > 0;
  const qaEmployeeUser = (await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [QA_EMPLOYEE_IDENTITY])).rows[0] ?? null;
  const planned = buildMirror(data, { targetId: existing?.id ?? '00000000-0000-4000-8000-000000000000', qaUserId: qaUser.id, qaEmployeeUserId: qaEmployeeUser?.id ?? null });
  const plannedCounts = Object.fromEntries(COPIED.map((t) => [t, planned[t].length]));
  const report = {
    source, targetName, targetExisted: Boolean(existing), targetCreated: false, mode: apply ? 'APPLY' : 'DRY_RUN',
    sourceCounts: Object.fromEntries(COPIED.map((t) => [t, data[t].length])),
    sourceHashBefore: before.overall,
    plannedMirrorCounts: plannedCounts,
    sourceQaMembershipPresent: sourceQaMembership,
    sourceContainsRealPii: data.employees.length > 0 ? 'YES' : 'NO',
  };
  log(`[mirror] source=${source.name} target="${targetName}" mode=${report.mode} counts=${JSON.stringify(report.sourceCounts)}`);
  if (!apply) { report.dryRun = 'PASS'; if (existing) await assertQaOrganization(client, existing.id).catch((e) => { report.dryRunGuardNote = e.message; }); return report; }

  let targetId = existing?.id;
  await client.query('BEGIN');
  try {
    if (!targetId) {
      targetId = (await client.query(`INSERT INTO organizations (name, type, plan) VALUES ($1, 'company', 'team') RETURNING id`, [targetName])).rows[0].id;
      report.targetCreated = true;
    }
    await client.query(
      `INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'ADMIN')
       ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'ADMIN'`, [qaUser.id, targetId],
    );
    assertNotProtectedSource(targetId);
    if (qaEmployeeUser) {
      await client.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'EMPLOYEE') ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'EMPLOYEE'`, [qaEmployeeUser.id, targetId]);
    }
    await assertQaOrganization(client, targetId); // fail-closed BEFORE any DELETE
    for (const [table, where] of WIPE_ORDER) {
      if (!where.includes('$1')) throw new Error('unscoped delete refused');
      await client.query(`DELETE FROM ${table} WHERE ${where}`, [targetId]);
    }
    const mirror = buildMirror(data, { targetId, qaUserId: qaUser.id, qaEmployeeUserId: qaEmployeeUser?.id ?? null });
    const inserted = {};
    for (const table of ['areas', 'employees', 'imports', 'schedules', 'schedule_versions', 'calendar_changes', 'shifts', 'shift_assignments', 'employee_annual_targets', 'employee_worktime_targets', 'format_profiles']) {
      inserted[table] = await insertRows(client, table, mirror[table]);
    }
    for (const link of mirror.calendar_change_original_shift) {
      await client.query('UPDATE calendar_changes SET original_shift_id = $1 WHERE id = $2 AND organization_id = $3', [link.original_shift_id, link.id, targetId]);
    }
    for (const table of COPIED) {
      if (inserted[table] !== mirror[table].length) throw new Error(`Row count mismatch for ${table}: ${inserted[table]} != ${mirror[table].length}`);
    }
    // 2026-only mirror: no operational row of any other year may exist.
    const stray = (await client.query(
      `SELECT (SELECT COUNT(*) FROM shifts WHERE organization_id = $1 AND date NOT BETWEEN '2026-01-01' AND '2026-12-31')::int AS shifts,
              (SELECT COUNT(*) FROM calendar_changes WHERE organization_id = $1 AND date NOT BETWEEN '2026-01-01' AND '2026-12-31')::int AS changes,
              (SELECT COUNT(*) FROM employee_annual_targets WHERE organization_id = $1 AND year <> 2026)::int AS targets,
              (SELECT COUNT(*) FROM employee_worktime_targets WHERE organization_id = $1 AND period_start NOT BETWEEN '2026-01-01' AND '2026-12-31')::int AS worktime_targets,
              (SELECT COUNT(*) FROM shift_assignments a JOIN schedule_versions sv ON sv.id = a.schedule_version_id JOIN schedules s ON s.id = sv.schedule_id
                 WHERE s.organization_id = $1 AND a.date NOT BETWEEN '2026-01-01' AND '2026-12-31')::int AS assignments`, [targetId],
    )).rows[0];
    if (Object.values(stray).some((n) => n > 0)) throw new Error(`Out-of-scope rows present in the mirror: ${JSON.stringify(stray)}`);
    // No real identity may have leaked into the mirror.
    const leaks = (await client.query(
      `SELECT (SELECT COUNT(*) FROM employees e LEFT JOIN users u ON u.id = e.user_id WHERE e.organization_id = $1 AND e.user_id IS NOT NULL AND u.email NOT ILIKE $2)::int AS linked,
              (SELECT COUNT(*) FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = $1 AND u.email NOT ILIKE $2)::int AS real_members`,
      [targetId, `%${QA_DOMAIN}`],
    )).rows[0];
    if (leaks.linked || leaks.real_members) throw new Error('Identity isolation check failed');
    const after = await sourceFingerprint(client, source.id);
    if (after.overall !== before.overall) throw new Error('SOURCE FINGERPRINT CHANGED; rolling back');
    await client.query('COMMIT');
    Object.assign(report, { targetId, inserted, sourceHashAfter: after.overall, sourceUnchanged: true, applied: true, qaMembership: QA_IDENTITY });
    log(`[mirror] APPLIED target=${targetId} inserted=${JSON.stringify(inserted)} sourceUnchanged=true`);
    return report;
  } catch (error) {
    await client.query('ROLLBACK');
    log(`[mirror] ROLLED BACK: ${error.message}`);
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const apply = process.argv.includes('--apply');
  if (apply && process.argv.includes('--dry-run')) throw new Error('Choose --apply or --dry-run, not both');
  const client = await connect();
  try {
    const report = await refreshQaMirror(client, { apply });
    console.log(JSON.stringify(report, null, 2));
  } finally { await client.end(); }
}
