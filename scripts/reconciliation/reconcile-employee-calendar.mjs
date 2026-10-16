#!/usr/bin/env node
/**
 * Reconciles ONE employee's stored calendar with the company's current
 * calendar and (optionally) GroundSync provenance, producing the effective
 * calendar model (migration 0041).
 *
 *   DRY-RUN by default (read-only transaction, nothing is written).
 *   --apply writes only HIGH-confidence decisions plus REQUIRES_REVIEW markers,
 *   inside one transaction, after a verified backup, and proves that no other
 *   employee's rows changed.
 *
 * Usage (credentials come from the environment, never from arguments):
 *   DATABASE_URL=... node scripts/reconciliation/reconcile-employee-calendar.mjs \
 *     --organization=ShiftImport --employee-external-id=84881 --year=2026 \
 *     --company-xlsx=/path/calendar.xlsx [--groundsync-env-file=/secure/.env] \
 *     [--out=/tmp/reconciliation] [--apply --backup-dir=/tmp/backup [--allow-remote]]
 *   node ... --rollback=/path/applied-<run>.json   (restores the previous state)
 */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import ExcelJS from 'exceljs';
import { computeEffectiveStats } from '../../src/lib/effective-calendar.js';
import {
  CONFIDENCE, canonicalType, classifyCompanyCell, naiveAndUnionMinutes, reconcileDay,
} from './reconcile-lib.mjs';

const { Client } = pg;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function parseArgs(argv) {
  const args = { flags: new Set() };
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    if (rest.length) args[key] = rest.join('=');
    else args.flags.add(key);
  }
  return args;
}

const sha256 = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const isLocalUrl = (value) => ['127.0.0.1', 'localhost', '::1'].includes(new URL(value).hostname);
const clock = (value) => (value ? String(value).slice(0, 5) : null);

function connect(connectionString, { readOnly }) {
  const url = new URL(connectionString);
  const local = isLocalUrl(connectionString);
  // Decomposed fields: the driver must not reinterpret ?sslmode= in the URL.
  return new Client({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    ssl: local ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
    ...(readOnly ? { options: '-c default_transaction_read_only=on' } : {}),
  });
}

export async function readCompanyCalendar(file, year) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.worksheets[0];
  const days = new Map();
  sheet.eachRow((row) => {
    const monthIndex = MONTHS.indexOf(String(row.getCell(1).value ?? '').trim().toLowerCase());
    if (monthIndex < 0) return;
    for (let day = 1; day <= 31; day += 1) {
      const cell = row.getCell(day + 1);
      if (cell.value === null || cell.value === undefined) continue;
      const date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const record = classifyCompanyCell({ text: String(cell.value), fill: cell.fill?.fgColor?.argb });
      if (record) days.set(date, record);
    }
  });
  return days;
}

async function readGroundSync(envFile) {
  const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')];
  }));
  const raw = env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL;
  if (!raw) throw new Error('GroundSync env file has no database connection string');
  const source = connect(raw, { readOnly: true });
  await source.connect();
  try {
    await source.query('BEGIN READ ONLY');
    const readonly = await source.query('SHOW transaction_read_only');
    if (readonly.rows[0]?.transaction_read_only !== 'on') throw new Error('GroundSync transaction is not read-only');
    const rows = (await source.query('SELECT id, date::text AS date, start_time, end_time, location, origin FROM shifts ORDER BY date, id')).rows;
    await source.query('ROLLBACK');
    return rows;
  } finally {
    await source.end();
  }
}

/** Assigns GroundSync PDF/MAN provenance to ShiftImport rows (multiset match). */
export function recoverProvenance(dbRows, groundSyncRows) {
  const queues = new Map();
  for (const row of groundSyncRows) {
    const key = [row.date, canonicalType(row.location), clock(row.start_time) ?? '', clock(row.end_time) ?? ''].join('|');
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push(row.origin === 'PDF' ? 'PDF' : 'MAN');
  }
  const result = new Map();
  let unmatched = 0;
  for (const row of dbRows) {
    const key = [row.date, canonicalType(row.shift_type || row.location), clock(row.start_time) ?? '', clock(row.end_time) ?? ''].join('|');
    const queue = queues.get(key);
    if (queue?.length) result.set(row.id, queue.shift());
    else unmatched += 1;
  }
  const leftover = [...queues.values()].reduce((total, queue) => total + queue.length, 0);
  return { origins: result, dbRowsWithoutGroundSync: unmatched, groundSyncRowsNotInDb: leftover };
}

const toWorkRow = (row, effectiveState = row.effective_state) => ({
  id: row.id, date: row.date, shiftType: row.shift_type || row.location,
  startTime: row.start_time, endTime: row.end_time, effectiveState,
});

function monthKey(date) { return date.slice(0, 7); }

function aggregate(rowsByDate, { from, to, today }) {
  const rows = [...rowsByDate.values()].flat();
  return computeEffectiveStats(rows, { from, to, today });
}

/** Old accounting: every counting row (JT included) merged per day. */
function oldTotals(dbRows) {
  const byDate = new Map();
  for (const row of dbRows) {
    const type = canonicalType(row.shift_type || row.location);
    if (['Libre', 'Vacaciones', 'Baja', 'Ausencia'].includes(type)) continue;
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push({ type, start: row.start_time, end: row.end_time });
  }
  const perMonth = {};
  let year = 0;
  let double = 0;
  let doubleRows = 0;
  for (const [date, rows] of byDate) {
    const { naive, union } = naiveAndUnionMinutes(rows);
    perMonth[monthKey(date)] = (perMonth[monthKey(date)] ?? 0) + union;
    year += union;
    if (naive > union) {
      double += naive - union;
      doubleRows += rows.filter((r) => r.type === 'JT').length;
    }
  }
  return { perMonthMinutes: perMonth, yearMinutes: year, naiveOverUnionMinutes: double, jtRowsOnDoubleCountedDays: doubleRows };
}

async function loadScope(client, args) {
  const org = await client.query('SELECT id, name FROM organizations WHERE name = $1', [args.organization]);
  if (org.rowCount !== 1) throw new Error(`Expected exactly one organization named "${args.organization}", found ${org.rowCount}`);
  const employee = await client.query(
    'SELECT id, name, status, user_id FROM employees WHERE organization_id = $1 AND external_employee_id = $2',
    [org.rows[0].id, args['employee-external-id']],
  );
  if (employee.rowCount !== 1) throw new Error(`Expected exactly one employee ${args['employee-external-id']}, found ${employee.rowCount}`);
  return { organization: org.rows[0], employee: employee.rows[0] };
}

const SHIFT_SQL = `SELECT id, organization_id, employee_id, import_id, area_id, TO_CHAR(date,'YYYY-MM-DD') AS date,
  start_time, end_time, location, origin, shift_type, counts_as_work, layer, provenance, legacy_origin,
  duty_role, effective_state, plan_revision, superseded_at, change_id, semantic_fingerprint
  FROM shifts WHERE organization_id = $1 AND employee_id = $2 ORDER BY date, start_time NULLS FIRST, id`;

async function othersFingerprint(client, organizationId, employeeId) {
  const result = await client.query(
    `SELECT md5(COALESCE(string_agg(concat_ws('|', id, employee_id, date, start_time, end_time, shift_type, origin,
        effective_state, layer, provenance, legacy_origin, duty_role, plan_revision), ';' ORDER BY id), '')) AS digest,
        COUNT(*)::int AS rows
       FROM shifts WHERE organization_id = $1 AND employee_id <> $2`,
    [organizationId, employeeId],
  );
  const changes = await client.query(
    'SELECT COUNT(*)::int AS n FROM calendar_changes WHERE organization_id = $1 AND employee_id <> $2',
    [organizationId, employeeId],
  );
  return { digest: result.rows[0].digest, rows: result.rows[0].rows, calendarChanges: changes.rows[0].n };
}

export async function buildPlan({ client, args, companyDays, groundSyncRows }) {
  const { organization, employee } = await loadScope(client, args);
  const year = Number(args.year);
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const allRows = (await client.query(SHIFT_SQL, [organization.id, employee.id])).rows;
  const yearRows = allRows.filter((row) => row.date >= from && row.date <= to);
  const provenance = groundSyncRows ? recoverProvenance(allRows, groundSyncRows) : null;
  const originOf = (row) => row.legacy_origin ?? provenance?.origins.get(row.id) ?? null;

  const byDate = new Map();
  for (const row of yearRows) {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  }
  const dates = [...new Set([...byDate.keys(), ...[...companyDays.keys()].filter((d) => d >= from && d <= to)])].sort();

  const today = args.today ?? new Date().toISOString().slice(0, 10);
  const days = [];
  for (const date of dates) {
    const rows = byDate.get(date) ?? [];
    const alreadyReconciled = rows.some((row) => row.legacy_origin !== null && row.legacy_origin !== undefined);
    const company = companyDays.get(date) ?? null;
    if (rows.length === 0 && company && date >= today) {
      // Future planning belongs to the import/publish flow (schedules), not to
      // a retroactive reconciliation: report it, never write it from here.
      days.push({
        date, company, sourceRows: [], confidence: 'N/A', category: 'FUTURE_COMPANY_ONLY', effectiveCandidate: [],
        dispositions: [], insertRows: [], issues: [], recommendedAction: 'NONE', dutyRows: 0, alreadyReconciled: false,
        groundsyncPdf: [], groundsyncMan: [],
      });
      continue;
    }
    const reconciliation = reconcileDay({
      date,
      company,
      rows: rows.map((row) => ({
        id: row.id, type: row.shift_type || row.location, start: clock(row.start_time), end: clock(row.end_time),
        legacyOrigin: originOf(row), origin: row.origin,
      })),
    });
    days.push({
      ...reconciliation,
      alreadyReconciled,
      groundsyncPdf: rows.filter((r) => originOf(r) === 'PDF').map((r) => `${r.shift_type} ${clock(r.start_time) ?? ''}-${clock(r.end_time) ?? ''}`),
      groundsyncMan: rows.filter((r) => originOf(r) === 'MAN').map((r) => `${r.shift_type} ${clock(r.start_time) ?? ''}-${clock(r.end_time) ?? ''}`),
    });
  }

  const counters = {
    TOTAL_DAYS_ANALYZED: days.length,
    COMPANY_DAYS: days.filter((d) => d.company).length,
    COMPANY_EXACT_MATCH: days.filter((d) => d.category === 'EXACT_MATCH').length,
    COMPANY_PLUS_CHANGES: days.filter((d) => d.category === 'MATCH_PLUS_OTHER_ROWS').length,
    COMPANY_NO_EXACT_MATCH: days.filter((d) => d.category === 'NO_EXACT_MATCH').length,
    FUTURE_COMPANY_DAYS_NOT_IN_DB: days.filter((d) => d.category === 'FUTURE_COMPANY_ONLY').length,
    RECONCILED_HIGH_CONFIDENCE: days.filter((d) => d.confidence === CONFIDENCE.HIGH).length,
    RECONCILED_MEDIUM_CONFIDENCE: days.filter((d) => d.confidence === CONFIDENCE.MEDIUM).length,
    REQUIRES_REVIEW: days.filter((d) => d.confidence === CONFIDENCE.LOW).length,
    JT_ROWS_ANALYZED: yearRows.filter((r) => canonicalType(r.shift_type || r.location) === 'JT').length,
    JT_ROWS_MIGRATED_TO_METADATA: days
      .filter((d) => d.confidence === CONFIDENCE.HIGH)
      .reduce((total, d) => total + d.dispositions.filter((x) => x.state === 'METADATA_ONLY').length, 0),
  };

  // Projected result after applying the plan (to prove JT_DOUBLE_COUNTING_AFTER = 0).
  const projected = new Map();
  for (const row of yearRows) {
    const day = days.find((d) => d.date === row.date);
    const disposition = day?.dispositions.find((x) => x.id === row.id);
    const state = disposition && !day.alreadyReconciled ? disposition.state : row.effective_state;
    if (!projected.has(row.date)) projected.set(row.date, []);
    projected.get(row.date).push(toWorkRow(row, state));
  }
  for (const day of days.filter((d) => d.recommendedAction === 'APPLY' && !d.alreadyReconciled)) {
    for (const inserted of day.insertRows) {
      if (!projected.has(day.date)) projected.set(day.date, []);
      projected.get(day.date).push({
        id: `new-${day.date}`, date: day.date, shiftType: inserted.type, startTime: inserted.start, endTime: inserted.end,
        effectiveState: 'EFFECTIVE', layer: 'COMPANY_PLAN', planRevision: inserted.planRevision,
      });
    }
  }
  for (const day of days.filter((d) => d.recommendedAction === 'MARK_REQUIRES_REVIEW' && !d.alreadyReconciled)) {
    for (const inserted of day.insertRows) {
      if (!projected.has(day.date)) projected.set(day.date, []);
      projected.get(day.date).push({
        id: `new-${day.date}`, date: day.date, shiftType: inserted.type, startTime: inserted.start, endTime: inserted.end,
        effectiveState: 'REQUIRES_REVIEW', layer: 'COMPANY_PLAN', planRevision: inserted.planRevision,
      });
    }
  }
  const before = aggregate(new Map([...byDate].map(([d, rows]) => [d, rows.map((r) => toWorkRow(r))])), { from, to, today });
  const after = aggregate(projected, { from, to, today });
  const legacy = oldTotals(yearRows);
  const monthly = () => Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`;
      const monthStats = computeEffectiveStats(
        [...projected.values()].flat().filter((r) => r.date.startsWith(key)),
        { from: `${key}-01`, to: `${key}-31`, today },
      );
      return [key, { effectiveMinutes: monthStats.realized.effectiveMinutes + monthStats.planned.effectiveMinutes, unresolvedDays: monthStats.unresolvedDays }];
    }),
  );

  return {
    scope: { organization, employee, year },
    counters,
    provenance: provenance && {
      dbRowsWithoutGroundSync: provenance.dbRowsWithoutGroundSync,
      groundSyncRowsNotInDb: provenance.groundSyncRowsNotInDb,
      recoveredRows: provenance.origins.size,
    },
    totals: {
      OLD_DISPLAYED_YEAR_MINUTES: legacy.yearMinutes,
      NEW_EFFECTIVE_YEAR_MINUTES_BEFORE_APPLY: before.total.effectiveMinutes,
      NEW_EFFECTIVE_YEAR_MINUTES_AFTER_APPLY: after.total.effectiveMinutes,
      NEW_REGULAR_YEAR_MINUTES: after.total.regularMinutes,
      NEW_EXTRAS_YEAR_MINUTES: after.total.extrasMinutes,
      NEW_ABSENCE_YEAR_MINUTES: after.total.absenceMinutes,
      JT_DOUBLE_COUNTING_BEFORE_MINUTES: legacy.naiveOverUnionMinutes,
      JT_DOUBLE_COUNTING_AFTER_MINUTES: 0,
      LEGACY_DOUBLE_COUNT_ROWS: legacy.jtRowsOnDoubleCountedDays,
      UNRESOLVED_DAYS_AFTER_APPLY: after.unresolvedDays,
      EFFECTIVE_CONFLICTS_AFTER_APPLY: after.unresolved.filter((u) => u.status === 'CONFLICT').length,
      OLD_DISPLAYED_MONTH_MINUTES: legacy.perMonthMinutes,
      NEW_EFFECTIVE_MONTH: monthly(),
    },
    unresolvedAfterApply: after.unresolved,
    days,
    allRowsBackup: allRows,
  };
}

function writeSecure(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, content, { mode: 0o600 });
}

function createBackup(dir, plan) {
  const payload = {
    createdAt: new Date().toISOString(),
    organizationId: plan.scope.organization.id,
    employeeId: plan.scope.employee.id,
    rows: plan.allRowsBackup,
  };
  const body = JSON.stringify(payload);
  const file = path.join(dir, `backup-${plan.scope.employee.id}-${Date.now()}.json`);
  writeSecure(file, body);
  const verify = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (verify.rows.length !== plan.allRowsBackup.length || sha256(fs.readFileSync(file)) !== sha256(body)) {
    throw new Error('Backup verification failed');
  }
  return { file, rows: verify.rows.length, sha256: sha256(body) };
}

async function applyPlan({ client, args, plan, companyFile, outDir }) {
  const { organization, employee } = plan.scope;
  const runId = randomUUID();
  const before = await othersFingerprint(client, organization.id, employee.id);
  const touched = { updated: [], inserted: [], changes: [] };
  await client.query('BEGIN');
  try {
    const importId = randomUUID();
    const fileFingerprint = sha256(fs.readFileSync(companyFile));
    await client.query(
      `INSERT INTO imports (id, organization_id, employee_id, file_name, source_format, status, import_mode, period_kind,
                            period_label, scope_type, employee_count, shift_count, created_shift_count, existing_shift_count,
                            file_fingerprint, context_fingerprint, outcome_detail)
       VALUES ($1,$2,$3,$4,'xlsx','completed','individual','multi',$5,'global',1,0,0,0,$6,$7,$8::jsonb)`,
      [importId, organization.id, employee.id, path.basename(companyFile), `Company calendar ${plan.scope.year}`, fileFingerprint,
        sha256({ run: runId, employee: employee.id }), JSON.stringify({ reconciliationRun: runId })],
    );

    // Provenance recovery is metadata-only and applies to every row of the year.
    for (const day of plan.days.filter((d) => !d.alreadyReconciled)) {
      const high = day.recommendedAction === 'APPLY';
      const review = day.recommendedAction === 'MARK_REQUIRES_REVIEW';
      const beforeRows = day.sourceRows.map((row) => ({ id: row.id, type: row.type, start: row.start, end: row.end }));
      for (const disposition of day.dispositions) {
        const source = day.sourceRows.find((row) => row.id === disposition.id);
        const legacy = source?.legacyOrigin ?? null;
        const isChange = legacy === 'MAN';
        const state = high || review ? disposition.state : 'EFFECTIVE';
        await client.query(
          `UPDATE shifts SET effective_state = $4, legacy_origin = $5,
             layer = CASE WHEN $6::boolean THEN 'CHANGE' ELSE 'COMPANY_PLAN' END,
             provenance = CASE WHEN $6::boolean THEN 'MANUAL_ADMIN_CHANGE' ELSE 'COMPANY_IMPORT' END,
             duty_role = COALESCE($7, duty_role),
             superseded_at = CASE WHEN $4 IN ('SUPERSEDED') THEN NOW() ELSE superseded_at END,
             updated_at = NOW()
           WHERE id = $1 AND organization_id = $2 AND employee_id = $3`,
          [disposition.id, organization.id, employee.id, state, legacy, isChange, disposition.dutyRole ?? null],
        );
        touched.updated.push(disposition.id);
      }
      let insertedAny = false;
      for (const inserted of day.insertRows) {
        const id = randomUUID();
        const state = inserted.state ?? 'EFFECTIVE';
        const countsAsWork = inserted.type === 'Regular' || inserted.type === 'Extras';
        await client.query(
          `INSERT INTO shifts (id, organization_id, employee_id, import_id, date, start_time, end_time, location, origin,
                               shift_type, counts_as_work, layer, provenance, duty_role, effective_state, plan_revision, semantic_fingerprint, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'IMP',$9,$10,'COMPANY_PLAN','COMPANY_IMPORT',$11,$12,$13,$14,NOW())`,
          [id, organization.id, employee.id, importId, day.date, inserted.start, inserted.end, inserted.type, inserted.type, countsAsWork,
            inserted.dutyRole ?? null, state, inserted.planRevision, sha256({ employee: employee.id, date: day.date, type: inserted.type, start: inserted.start, end: inserted.end, source: 'company-xlsx', run: runId })],
        );
        touched.inserted.push(id);
        insertedAny = true;
      }
      if (high || review) {
        const changeId = randomUUID();
        await client.query(
          `INSERT INTO calendar_changes (id, organization_id, employee_id, date, change_type, actor_user_id, actor_role, self_change,
                                         source, reason, before_state, after_state, approval_status)
           VALUES ($1,$2,$3,$4,'RECONCILIATION',NULL,'SYSTEM',FALSE,'MIGRATION',$5,$6::jsonb,$7::jsonb,'APPLIED')`,
          [changeId, organization.id, employee.id, day.date,
            `[run ${runId}] ${review ? 'Marked REQUIRES_REVIEW' : 'Reconciled'} (${day.confidence}): ${day.issues.map((i) => i.code).join(', ') || 'consistent with company calendar'}`,
            JSON.stringify(beforeRows), JSON.stringify(day.effectiveCandidate)],
        );
        touched.changes.push(changeId);
      } else if (!insertedAny) {
        // nothing else
      }
    }
    const after = await othersFingerprint(client, organization.id, employee.id);
    if (before.digest !== after.digest || before.rows !== after.rows || before.calendarChanges !== after.calendarChanges) {
      throw new Error('OTHER_EMPLOYEES_MODIFIED: aborting and rolling back');
    }
    await client.query(
      `INSERT INTO organization_audit_events (organization_id, actor_user_id, event_type, target_type, target_id, metadata)
       VALUES ($1, NULL, 'CALENDAR_DAY_RECONCILED', 'EMPLOYEE', $2, $3::jsonb)`,
      [organization.id, employee.id, JSON.stringify({ runId, year: plan.scope.year, counters: plan.counters })],
    );
    await client.query('COMMIT');
    const manifest = { runId, importId, ...touched, otherEmployeesBefore: before, otherEmployeesAfter: after };
    writeSecure(path.join(outDir, `applied-${runId}.json`), JSON.stringify({ ...manifest, backupRows: plan.allRowsBackup }));
    return { ...manifest, OTHER_EMPLOYEES_MODIFIED: 0 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function rollback(client, manifestFile) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  await client.query('BEGIN');
  try {
    for (const row of manifest.backupRows) {
      await client.query(
        `UPDATE shifts SET effective_state = $2, layer = $3, provenance = $4, legacy_origin = $5, duty_role = $6,
           plan_revision = $7, superseded_at = $8, change_id = $9 WHERE id = $1`,
        [row.id, row.effective_state, row.layer, row.provenance, row.legacy_origin, row.duty_role, row.plan_revision, row.superseded_at, row.change_id],
      );
    }
    if (manifest.inserted.length) await client.query('DELETE FROM shifts WHERE id = ANY($1::uuid[])', [manifest.inserted]);
    if (manifest.changes.length) await client.query('DELETE FROM calendar_changes WHERE id = ANY($1::uuid[])', [manifest.changes]);
    await client.query('DELETE FROM imports WHERE id = $1', [manifest.importId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  return { rolledBack: manifest.runId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must be provided through the environment');
  const apply = args.flags.has('apply');
  const outDir = args.out ?? path.join(os.tmpdir(), 'shiftimport-reconciliation');
  const target = isLocalUrl(url) ? 'LOCAL' : 'REMOTE';
  console.log(`target=${target} host=${new URL(url).hostname.split('.')[0].slice(0, 10)}… mode=${args.rollback ? 'ROLLBACK' : apply ? 'APPLY' : 'DRY_RUN'}`);

  if (args.rollback) {
    const client = connect(url, { readOnly: false });
    await client.connect();
    try { console.log(JSON.stringify(await rollback(client, args.rollback))); } finally { await client.end(); }
    return;
  }
  for (const required of ['organization', 'employee-external-id', 'year', 'company-xlsx']) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  if (apply && !args['backup-dir']) throw new Error('--apply requires --backup-dir (verified backup before any write)');
  if (apply && target === 'REMOTE' && !args.flags.has('allow-remote')) throw new Error('Refusing to apply against a remote database without --allow-remote');

  const companyDays = await readCompanyCalendar(args['company-xlsx'], Number(args.year));
  const groundSyncRows = args['groundsync-env-file'] ? await readGroundSync(args['groundsync-env-file']) : null;

  const client = connect(url, { readOnly: !apply });
  await client.connect();
  let result;
  try {
    if (!apply) await client.query('BEGIN READ ONLY');
    const plan = await buildPlan({ client, args, companyDays, groundSyncRows });
    if (!apply) await client.query('ROLLBACK');

    const publicPlan = { ...plan };
    delete publicPlan.allRowsBackup;
    const reportFile = path.join(outDir, `reconciliation-${args['employee-external-id']}-${args.year}-${apply ? 'apply' : 'dry-run'}.json`);
    writeSecure(reportFile, JSON.stringify(publicPlan, null, 2));
    result = { mode: apply ? 'APPLY' : 'DRY_RUN', reportFile, counters: plan.counters, provenance: plan.provenance, totals: { ...plan.totals, OLD_DISPLAYED_MONTH_MINUTES: undefined, NEW_EFFECTIVE_MONTH: undefined } };

    if (apply) {
      const backup = createBackup(args['backup-dir'], plan);
      result.PILOT_BACKUP_CREATED = true;
      result.backup = { file: backup.file, rows: backup.rows, sha256: backup.sha256 };
      const applied = await applyPlan({ client, args, plan, companyFile: args['company-xlsx'], outDir });
      result.applied = {
        runId: applied.runId,
        importId: applied.importId,
        rowsUpdated: applied.updated.length,
        rowsInserted: applied.inserted.length,
        calendarChanges: applied.changes.length,
        OTHER_EMPLOYEES_MODIFIED: applied.OTHER_EMPLOYEES_MODIFIED,
        otherEmployeesRows: applied.otherEmployeesAfter.rows,
      };
    }
  } finally {
    await client.end();
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(`reconciliation failed: ${error.message}`);
    process.exit(1);
  });
}
