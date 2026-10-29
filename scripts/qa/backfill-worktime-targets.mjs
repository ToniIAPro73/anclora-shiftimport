#!/usr/bin/env node
/**
 * Copies legacy annual targets to the versioned authority in QA Mirror only.
 * Production data backfill is intentionally a separately reviewed release action.
 */
import { assertQaOrganization, connect, deterministicUuid, resolveSourceOrganization, targetNameFor } from './qa-lib.mjs';
import { legacyAnnualTargetVersion } from './worktime-target-backfill.mjs';

export async function backfillQaWorktimeTargets(client, { apply = false, log = console.log } = {}) {
  const source = await resolveSourceOrganization(client);
  const mirrors = (await client.query('SELECT id, name FROM organizations WHERE name = $1', [targetNameFor(source)])).rows;
  if (mirrors.length !== 1) throw new Error(`Expected exactly one QA Mirror, found ${mirrors.length}`);
  const target = mirrors[0];
  await assertQaOrganization(client, target.id);
  const legacy = (await client.query(
    `SELECT old.*, TO_CHAR(old.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS effective_date
     FROM employee_annual_targets old
     WHERE old.organization_id = $1 AND NOT EXISTS (
       SELECT 1 FROM employee_worktime_targets current
       WHERE current.legacy_annual_target_id = old.id
     ) ORDER BY old.year, old.employee_id`, [target.id],
  )).rows;
  if (!apply) return { mode: 'DRY_RUN', organization: target.name, missingVersions: legacy.length };
  await client.query('BEGIN');
  try {
    await assertQaOrganization(client, target.id);
    const versions = legacy.map((row) => legacyAnnualTargetVersion(row, {
      organizationId: target.id,
      id: deterministicUuid(target.id, `worktime-target-backfill:${row.id}`),
      employeeId: row.employee_id,
      effectiveFrom: row.effective_date,
      createdByUserId: null,
    }));
    const inserted = versions.length
      ? (await client.query(
        `INSERT INTO employee_worktime_targets
           (id, organization_id, employee_id, target_kind, period_type, period_start, period_end,
            minimum_minutes, target_minutes, maximum_minutes, effective_from, revision, source, notes,
            included_work_buckets, legacy_annual_target_id, created_by_user_id, created_at)
         SELECT id, organization_id, employee_id, target_kind, period_type, period_start, period_end,
            minimum_minutes, target_minutes, maximum_minutes, effective_from, revision, source, notes,
            included_work_buckets, legacy_annual_target_id, created_by_user_id, created_at
         FROM jsonb_populate_recordset(NULL::employee_worktime_targets, $1::jsonb)
         ON CONFLICT (legacy_annual_target_id) DO NOTHING RETURNING id`, [JSON.stringify(versions)],
      )).rowCount : 0;
    const remaining = (await client.query(
      `SELECT COUNT(*)::int AS count FROM employee_annual_targets old
       WHERE old.organization_id = $1 AND NOT EXISTS (
         SELECT 1 FROM employee_worktime_targets current WHERE current.legacy_annual_target_id = old.id
       )`, [target.id],
    )).rows[0].count;
    if (remaining) throw new Error(`QA backfill left ${remaining} annual target(s) without a version`);
    await client.query('COMMIT');
    log(`[worktime-targets] QA Mirror versions created: ${inserted}`);
    return { mode: 'APPLY', organization: target.name, inserted, remaining };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

if (process.argv[1]?.endsWith('backfill-worktime-targets.mjs')) {
  const apply = process.argv.includes('--apply');
  if (apply && process.argv.includes('--dry-run')) throw new Error('Choose --apply or --dry-run, not both');
  const client = await connect();
  try {
    console.log(JSON.stringify(await backfillQaWorktimeTargets(client, { apply }), null, 2));
  } finally { await client.end(); }
}
