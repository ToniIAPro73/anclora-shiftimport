#!/usr/bin/env node
/**
 * READ-ONLY fingerprint of the protected organizations (the real `ShiftImport` and Groundforce). Run before and after any QA with writes:
 * identical output proves the QA never touched them. Only SELECTs; prints counts and hashes, never row content, credentials or URLs.
 */
import { connect, sha256, PROTECTED_SOURCE_ORG_ID } from './qa-lib.mjs';

export const GROUNDFORCE_ORG_ID = 'ecbebcf6-787d-4b0f-be32-d67be64ce3b1';

const QUERIES = {
  employees: 'SELECT id, name, status, user_id FROM employees WHERE organization_id = $1 ORDER BY id',
  shifts: 'SELECT id, employee_id, date, start_time, end_time, shift_type, effective_state, provenance, import_id, schedule_version_id, updated_at FROM shifts WHERE organization_id = $1 ORDER BY id',
  imports: 'SELECT id, file_name, status, import_decision, reverted_at, deleted_at FROM imports WHERE organization_id = $1 ORDER BY id',
  schedules: 'SELECT id, area_id, period_start FROM schedules WHERE organization_id = $1 ORDER BY id',
  versions: 'SELECT sv.id, sv.status, sv.version_number FROM schedule_versions sv JOIN schedules s ON s.id = sv.schedule_id WHERE s.organization_id = $1 ORDER BY sv.id',
  assignments: 'SELECT sa.id, sa.employee_id, sa.date, sa.start_time FROM shift_assignments sa JOIN schedule_versions sv ON sv.id = sa.schedule_version_id JOIN schedules s ON s.id = sv.schedule_id WHERE s.organization_id = $1 ORDER BY sa.id',
  notifications: 'SELECT id, user_id, type, resource_id FROM notifications WHERE organization_id = $1 ORDER BY id',
  changes: 'SELECT id, employee_id, date, change_type FROM calendar_changes WHERE organization_id = $1 ORDER BY id',
  members: 'SELECT user_id, role FROM memberships WHERE organization_id = $1 ORDER BY user_id',
  audit: 'SELECT id, event_type FROM organization_audit_events WHERE organization_id = $1 ORDER BY id',
};

export async function protectedFingerprint(client, organizationId) {
  const parts = {};
  for (const [name, sql] of Object.entries(QUERIES)) {
    const rows = (await client.query(sql, [organizationId])).rows;
    parts[name] = `${rows.length}:${sha256(JSON.stringify(rows)).slice(0, 16)}`;
  }
  return { organizationId, parts, overall: sha256(JSON.stringify(parts)).slice(0, 24) };
}

if (process.argv[1]?.endsWith('protected-org-fingerprint.mjs')) {
  const client = await connect();
  try {
    const result = {};
    for (const [label, id] of [['shiftimport', PROTECTED_SOURCE_ORG_ID], ['groundforce', GROUNDFORCE_ORG_ID]]) {
      const exists = (await client.query('SELECT 1 FROM organizations WHERE id = $1', [id])).rowCount === 1;
      result[label] = exists ? await protectedFingerprint(client, id) : { organizationId: id, missing: true };
    }
    console.log(JSON.stringify(result));
  } finally { await client.end(); }
}
