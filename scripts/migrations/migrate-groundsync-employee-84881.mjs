#!/usr/bin/env node
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  EMPLOYEE_EXTERNAL_ID, SOURCE_APP, OPERATIONAL_DATE, addDays, classifyRows,
  fingerprint, identityKey, migrationFingerprint, weekStart,
} from './groundsync-84881-lib.mjs';

const { Client } = pg;
const args = new Set(process.argv.slice(2));
const sourceEnvFile = process.env.GROUNDSYNC_ENV_FILE || process.argv.find((arg) => arg.startsWith('--source-env-file='))?.split('=').slice(1).join('=');
const apply = args.has('--apply');
if (!sourceEnvFile) throw new Error('GROUNDSYNC_ENV_FILE or --source-env-file=/secure/path is required');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be loaded from the local development env file');
if (!fs.statSync(sourceEnvFile, { throwIfNoEntry: false })) throw new Error('source env file does not exist');

const target = new URL(process.env.DATABASE_URL);
if (target.hostname !== '127.0.0.1' || target.port !== '5433' || target.pathname !== '/anclora_shiftimport') {
  throw new Error('Refusing target outside local development PostgreSQL 127.0.0.1:5433/anclora_shiftimport');
}
const sourceEnv = Object.fromEntries(fs.readFileSync(sourceEnvFile, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')];
}));
const sourceConnectionString = sourceEnv.DATABASE_URL_UNPOOLED || sourceEnv.POSTGRES_URL_NON_POOLING || sourceEnv.DATABASE_URL;
if (!sourceConnectionString) throw new Error('source env has no database connection string');

const trace = (...values) => { if (process.env.MIGRATION_DEBUG === '1') console.error(...values); };
trace('source config', sourceConnectionString.length, new URL(sourceConnectionString).hostname);
const sourceUrl = new URL(sourceConnectionString);
const source = new Client({
  host: sourceUrl.hostname,
  port: Number(sourceUrl.port || 5432),
  user: decodeURIComponent(sourceUrl.username),
  password: decodeURIComponent(sourceUrl.password),
  database: sourceUrl.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false },
  options: '-c default_transaction_read_only=on',
  connectionTimeoutMillis: 10000,
});
const destination = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
trace('connect');
await source.connect();
trace('source connected');
await destination.connect();
trace('destination connected');

async function readSource() {
  await source.query('BEGIN READ ONLY');
  try {
    const readonly = await source.query('SHOW transaction_read_only');
    if (readonly.rows[0]?.transaction_read_only !== 'on') throw new Error('Source transaction is not read-only');
    const tables = await source.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='shifts'");
    if (tables.rowCount !== 1) throw new Error('Source shifts table not found');
    return (await source.query('SELECT id,date::text,start_time,end_time,location,origin FROM shifts ORDER BY date,id')).rows;
  } finally {
    await source.query('ROLLBACK');
  }
}

function report(sourceRows, employee, existingRows, classification) {
  const counts = Object.fromEntries(Object.entries(classification).map(([key, rows]) => [key, rows.length]));
  const valid = sourceRows.length - counts.invalid;
  const classified = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return {
    sourceApp: SOURCE_APP,
    sourceEmployeeExternalId: EMPLOYEE_EXTERNAL_ID,
    sourceEmployeeOwnership: 'dedicated-groundsync-instance-and-repository',
    sourceRows: sourceRows.length,
    employee: { id: employee.id, organizationId: employee.organization_id, name: employee.name, status: employee.status },
    existingTargetShifts: existingRows.length,
    classification: counts,
    equation: `${valid}=${classified}`,
    operationalDate: OPERATIONAL_DATE,
    sourceFingerprint: migrationFingerprint(sourceRows),
    invalidReasons: Object.fromEntries([...new Set(classification.invalid.flatMap((row) => row.reasons))].map((reason) => [reason, classification.invalid.filter((row) => row.reasons.includes(reason)).length])),
  };
}

try {
  const sourceRows = await readSource();
  trace('source rows', sourceRows.length);
  const employeeResult = await destination.query("SELECT id,organization_id,name,status,external_employee_id FROM employees WHERE external_employee_id=$1", [EMPLOYEE_EXTERNAL_ID]);
  if (employeeResult.rowCount !== 1) throw new Error(`Expected exactly one target employee for ${EMPLOYEE_EXTERNAL_ID}`);
  const employee = employeeResult.rows[0];
  trace('employee loaded');
  if (!employee.name.toLowerCase().includes('pozo') || !employee.name.toLowerCase().includes('sebastian')) throw new Error('Target employee ownership check failed');
  const existingRows = (await destination.query('SELECT date::text,start_time,end_time,location,shift_type,counts_as_work FROM shifts WHERE employee_id=$1 ORDER BY date,start_time NULLS FIRST,id', [employee.id])).rows.map((row) => ({ date: row.date, startTime: row.start_time?.slice(0, 5) ?? null, endTime: row.end_time?.slice(0, 5) ?? null, shiftType: row.shift_type || row.location, countsAsWork: row.counts_as_work }));
  const classification = classifyRows(sourceRows, existingRows);
  trace('classified');
  const summary = report(sourceRows, employee, existingRows, classification);
  if (classification.conflict.length) throw new Error(`Refusing migration with ${classification.conflict.length} conflicts`);
  if (classification.invalid.length && !args.has('--allow-invalid')) throw new Error(`Refusing migration with ${classification.invalid.length} invalid source rows; pass --allow-invalid to exclude them explicitly`);
  if (!apply) {
    console.log(JSON.stringify({ mode: 'DRY_RUN', ...summary }, null, 2));
  } else {
    await destination.query('BEGIN');
    try {
      const owner = await destination.query("SELECT user_id FROM memberships WHERE organization_id=$1 AND role='OWNER' ORDER BY created_at LIMIT 1", [employee.organization_id]);
      if (owner.rowCount !== 1) throw new Error('No organization owner available for migration provenance');
      const ownerId = owner.rows[0].user_id;
      const fileFingerprint = summary.sourceFingerprint;
      const contextFingerprint = fingerprint({ sourceApp: SOURCE_APP, employee: employee.id, operationalDate: OPERATIONAL_DATE });
      const importResult = await destination.query(`
        INSERT INTO imports (id,organization_id,imported_by_user_id,employee_id,file_name,source_format,period_year,period_month,status,import_mode,period_kind,period_label,scope_type,employee_count,shift_count,created_shift_count,existing_shift_count,file_fingerprint,context_fingerprint,outcome_detail)
        VALUES ($1,$2,$3,$4,$5,'groundsync',NULL,NULL,'completed','individual','multi',$6,'global',1,$7,0,$8,$9,$10,$11::jsonb)
        ON CONFLICT (organization_id,employee_id,file_fingerprint,context_fingerprint) WHERE employee_id IS NOT NULL AND file_fingerprint IS NOT NULL AND context_fingerprint IS NOT NULL
        DO UPDATE SET updated_at=NOW()
        RETURNING id`, [randomUUID(), employee.organization_id, ownerId, employee.id, `GroundSync migration — Sebastián ${EMPLOYEE_EXTERNAL_ID}`, `GroundSync ${SOURCE_APP} → ShiftImport`, sourceRows.length, classification.duplicate.length, fileFingerprint, contextFingerprint, JSON.stringify({ invalid: classification.invalid.length, operationalDate: OPERATIONAL_DATE })]);
      const importId = importResult.rows[0].id;
      for (const row of classification.historical) {
        await destination.query(`
          INSERT INTO shifts (id,organization_id,employee_id,import_id,date,start_time,end_time,location,origin,shift_type,counts_as_work,semantic_fingerprint,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'IMP',$9,$10,$11,NOW())
          ON CONFLICT (organization_id,employee_id,semantic_fingerprint) WHERE semantic_fingerprint IS NOT NULL DO NOTHING`,
          [randomUUID(), employee.organization_id, employee.id, importId, row.date, row.startTime, row.endTime, row.location, row.shiftType, row.countsAsWork, fingerprint({ employeeId: employee.id, ...row })]);
      }
      const futureByWeek = new Map();
      for (const row of classification.future) { const start = weekStart(row.date); if (!futureByWeek.has(start)) futureByWeek.set(start, []); futureByWeek.get(start).push(row); }
      for (const [periodStart, rows] of futureByWeek) {
        const schedule = await destination.query(`SELECT id FROM schedules WHERE organization_id=$1 AND area_id IS NULL AND period_start=$2 FOR UPDATE`, [employee.organization_id, periodStart]);
        if (schedule.rowCount !== 1) throw new Error(`Expected one global schedule for ${periodStart}`);
        const scheduleId = schedule.rows[0].id;
        const draft = await destination.query(`SELECT id FROM schedule_versions WHERE schedule_id=$1 AND status='DRAFT' ORDER BY version_number LIMIT 1`, [scheduleId]);
        let versionId = draft.rows[0]?.id;
        if (!versionId) {
          versionId = randomUUID();
          await destination.query(`INSERT INTO schedule_versions (id,schedule_id,version_number,status,created_by_user_id) VALUES ($1,$2,(SELECT COALESCE(MAX(version_number),0)+1 FROM schedule_versions WHERE schedule_id=$2),'DRAFT',$3)`, [versionId, scheduleId, ownerId]);
        }
        for (const row of rows) {
          await destination.query(`INSERT INTO shift_assignments (id,schedule_version_id,employee_id,date,start_time,end_time,location,import_id,shift_type,counts_as_work,updated_at) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW() WHERE NOT EXISTS (SELECT 1 FROM shift_assignments WHERE schedule_version_id=$2 AND employee_id=$3 AND date=$4 AND start_time IS NOT DISTINCT FROM $5 AND end_time IS NOT DISTINCT FROM $6 AND shift_type IS NOT DISTINCT FROM $9 AND counts_as_work IS NOT DISTINCT FROM $10 AND location IS NOT DISTINCT FROM $7)`, [randomUUID(), versionId, employee.id, row.date, row.startTime, row.endTime, row.location, importId, row.shiftType, row.countsAsWork]);
        }
        const status = await destination.query('SELECT status FROM schedule_versions WHERE id=$1 FOR UPDATE', [versionId]);
        if (status.rows[0]?.status === 'DRAFT') {
          await destination.query("UPDATE schedule_versions SET status='PUBLISHED',published_at=NOW(),published_by_user_id=$2 WHERE id=$1", [versionId, ownerId]);
          await destination.query(`INSERT INTO shifts (id,organization_id,employee_id,import_id,area_id,date,start_time,end_time,location,origin,schedule_version_id,shift_type,counts_as_work) SELECT gen_random_uuid(),$2,sa.employee_id,$3,NULL,sa.date,TO_CHAR(sa.start_time,'HH24:MI'),TO_CHAR(sa.end_time,'HH24:MI'),COALESCE(sa.location,''),'schedule',sa.schedule_version_id,sa.shift_type,sa.counts_as_work FROM shift_assignments sa WHERE sa.schedule_version_id=$1 AND sa.employee_id=$4 AND NOT EXISTS (SELECT 1 FROM shifts s WHERE s.employee_id=sa.employee_id AND s.date=sa.date AND s.start_time IS NOT DISTINCT FROM TO_CHAR(sa.start_time,'HH24:MI') AND s.end_time IS NOT DISTINCT FROM TO_CHAR(sa.end_time,'HH24:MI') AND s.shift_type IS NOT DISTINCT FROM sa.shift_type AND s.counts_as_work IS NOT DISTINCT FROM sa.counts_as_work)`, [versionId, employee.organization_id, importId, employee.id]);
        }
      }
      await destination.query(`UPDATE imports SET created_shift_count=(SELECT COUNT(*) FROM shifts WHERE import_id=$1), existing_shift_count=$2, updated_at=NOW() WHERE id=$1`, [importId, classification.duplicate.length]);
      await destination.query('COMMIT');
      console.log(JSON.stringify({ mode: 'APPLIED', importId, ...summary }, null, 2));
    } catch (error) { await destination.query('ROLLBACK'); throw error; }
  }
} finally { await source.end(); await destination.end(); }
