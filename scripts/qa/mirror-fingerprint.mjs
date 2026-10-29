#!/usr/bin/env node
/** Prints a stable fingerprint of the QA mirror (idempotency checks). No PII beyond hashes. */
import { connect, sha256, resolveSourceOrganization, targetNameFor } from './qa-lib.mjs';

export async function mirrorFingerprint(client) {
  const source = await resolveSourceOrganization(client);
  const mirrors = (await client.query('SELECT id FROM organizations WHERE name = $1', [targetNameFor(source)])).rows;
  if (mirrors.length !== 1) throw new Error(`QA mirror count is ${mirrors.length}, expected 1`);
  const id = mirrors[0].id;
  const queries = {
    employees: 'SELECT id, name, external_employee_id, user_id FROM employees WHERE organization_id = $1 ORDER BY id',
    shifts: "SELECT id, employee_id, TO_CHAR(date,'YYYY-MM-DD') d, start_time, end_time, shift_type, effective_state, layer, plan_revision, duty_role, semantic_fingerprint, change_id, import_id FROM shifts WHERE organization_id = $1 ORDER BY id",
    changes: "SELECT id, employee_id, TO_CHAR(date,'YYYY-MM-DD') d, change_type, original_shift_id FROM calendar_changes WHERE organization_id = $1 ORDER BY id",
    imports: 'SELECT id, file_name, period_year, shift_count FROM imports WHERE organization_id = $1 ORDER BY id',
    targets: 'SELECT id, employee_id, year, minimum_annual_minutes, maximum_annual_minutes FROM employee_annual_targets WHERE organization_id = $1 ORDER BY id',
    worktimeTargets: 'SELECT id, employee_id, target_kind, period_type, period_start, period_end, minimum_minutes, target_minutes, maximum_minutes, effective_from, revision, included_work_buckets, legacy_annual_target_id FROM employee_worktime_targets WHERE organization_id = $1 ORDER BY id',
    members: 'SELECT user_id, role FROM memberships WHERE organization_id = $1 ORDER BY user_id',
  };
  const parts = {};
  for (const [name, sql] of Object.entries(queries)) {
    const rows = (await client.query(sql, [id])).rows;
    parts[name] = `${rows.length}:${sha256(JSON.stringify(rows)).slice(0, 16)}`;
  }
  return { organizationId: id, mirrorCount: mirrors.length, parts, overall: sha256(JSON.stringify(parts)).slice(0, 24) };
}

if (process.argv[1]?.endsWith('mirror-fingerprint.mjs')) {
  const client = await connect();
  try { console.log(JSON.stringify(await mirrorFingerprint(client))); } finally { await client.end(); }
}
