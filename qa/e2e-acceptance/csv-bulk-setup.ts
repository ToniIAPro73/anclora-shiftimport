import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../../api/_lib/passwords.js';

// Synthetic QA-only tenant for the bulk CSV team import E2E suite (commit
// 30a052e: BulkCsvImportModal + api/employees/bulk.js + api/invitations/bulk.js).
// Mirrors the isolation pattern from invitations-setup.ts: one throwaway
// organization, deleted in globalTeardown, with a guard that refuses to
// touch the Groundforce tenant. Invite emails use the @e2e.test reserved
// test domain (RFC 2606) so a real POST to the invitations endpoint never
// reaches an actual recipient even though it calls the real Resend API.

const fixturePath = join(__dirname, 'artifacts', 'csv-bulk-fixture.json');
const root = join(__dirname, '..');

function readEnvValue(name: string): string {
  const file = readFileSync(join(root, '..', '.env.local'), 'utf8');
  const line = file.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function orgCounts(sql: ReturnType<typeof neon>, organizationId: string) {
  const [memberships, people, employees, profiles, invitations] = await Promise.all([
    sql`SELECT count(*)::int AS count FROM memberships WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM organization_people WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM employees WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM employee_profiles WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM user_access_invitations WHERE organization_id = ${organizationId}`,
  ]);
  return {
    memberships: memberships[0].count,
    people: people[0].count,
    employees: employees[0].count,
    profiles: profiles[0].count,
    invitations: invitations[0].count,
  };
}

export default async function globalSetup() {
  const sql = neon(readEnvValue('DATABASE_URL'));
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${randomUUID().slice(0, 8)}`;
  const protectedOrg = (await sql`SELECT id FROM organizations WHERE lower(name) = lower('Groundforce') LIMIT 1`)[0]?.id ?? null;
  const protectedCounts = protectedOrg ? await orgCounts(sql, protectedOrg) : null;
  const createdOrganizations: string[] = [];
  const createdUsers: string[] = [];

  try {
    const orgRow = (await sql`
      INSERT INTO organizations (name, type, plan) VALUES (${`E2E_CSVBULK_${runId}`}, 'company', 'team') RETURNING id
    `)[0];
    const organizationId = orgRow.id;
    createdOrganizations.push(organizationId);

    const ownerEmail = `owner-csvbulk-${runId}@e2e.test`;
    const ownerPassword = 'E2e-csvbulk-owner-1234';
    const ownerUser = (await sql`
      INSERT INTO users (email, password_hash, display_name) VALUES (${ownerEmail}, ${hashPassword(ownerPassword)}, 'E2E CSV Bulk Owner') RETURNING id
    `)[0];
    createdUsers.push(ownerUser.id);
    await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${ownerUser.id}, ${organizationId}, 'OWNER')`;
    const ownerPerson = (await sql`
      INSERT INTO organization_people (organization_id, user_id, status) VALUES (${organizationId}, ${ownerUser.id}, 'ACTIVE') RETURNING id
    `)[0];
    await sql`
      INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, created_by_user_id, source)
      VALUES (${organizationId}, ${ownerPerson.id}, 'OWNER', CURRENT_DATE, ${ownerUser.id}, 'USER')
    `;

    const areaName = `QA Area ${runId}`;
    const area = (await sql`
      INSERT INTO areas (organization_id, name, code, active) VALUES (${organizationId}, ${areaName}, ${`QA${runId.slice(-6)}`}, TRUE) RETURNING id, name
    `)[0];

    const empUpdateExternalId = `EMP-UPD-${runId}`;
    const empUpdateOriginalName = `Empleado Original ${runId}`;
    await sql`
      INSERT INTO employees (organization_id, external_employee_id, name, status, area_id)
      VALUES (${organizationId}, ${empUpdateExternalId}, ${empUpdateOriginalName}, 'active', ${area.id})
    `;

    const empUnchangedExternalId = `EMP-SAME-${runId}`;
    const empUnchangedName = `Empleado Sin Cambios ${runId}`;
    await sql`
      INSERT INTO employees (organization_id, external_employee_id, name, status, area_id)
      VALUES (${organizationId}, ${empUnchangedExternalId}, ${empUnchangedName}, 'active', ${area.id})
    `;

    const empNewExternalId = `EMP-NEW-${runId}`;

    // Unlinked employee for the externalEmployeeId association + secure
    // invite test (no user_id — free to receive an invitation).
    const empAssocExternalId = `EMP-ASSOC-${runId}`;
    await sql`
      INSERT INTO employees (organization_id, external_employee_id, name, status)
      VALUES (${organizationId}, ${empAssocExternalId}, ${`Empleado Asociable ${runId}`}, 'active')
    `;

    // Employee already linked to a different existing user — used to prove
    // the "already linked" conflict rejection.
    const linkedUserEmail = `linked-user-${runId}@e2e.test`;
    const linkedUser = (await sql`
      INSERT INTO users (email, password_hash, display_name) VALUES (${linkedUserEmail}, ${hashPassword('E2e-linked-user-1234')}, 'E2E Linked User') RETURNING id
    `)[0];
    createdUsers.push(linkedUser.id);
    await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${linkedUser.id}, ${organizationId}, 'EMPLOYEE')`;
    const empLinkedExternalId = `EMP-LINKED-${runId}`;
    await sql`
      INSERT INTO employees (organization_id, external_employee_id, name, status, user_id)
      VALUES (${organizationId}, ${empLinkedExternalId}, ${`Empleado Vinculado ${runId}`}, 'active', ${linkedUser.id})
    `;

    const fixture = {
      runId,
      createdOrganizations,
      createdUsers,
      organizationId,
      owner: { email: ownerEmail, password: ownerPassword },
      area: { id: area.id, name: area.name },
      employees: {
        update: { externalId: empUpdateExternalId, originalName: empUpdateOriginalName, updatedName: `Empleado Actualizado ${runId}` },
        unchanged: { externalId: empUnchangedExternalId, name: empUnchangedName },
        new: { externalId: empNewExternalId, name: `Empleado Nuevo ${runId}` },
        assoc: { externalId: empAssocExternalId },
        linked: { externalId: empLinkedExternalId },
        ghostExternalId: `EMP-GHOST-${runId}`,
      },
      invite: {
        assocEmail: `invite-assoc-${runId}@e2e.test`,
        roleRejectEmail: `role-reject-${runId}@e2e.test`,
        conflictEmail: `link-conflict-${runId}@e2e.test`,
        duplicateEmail: `dup-user-${runId}@e2e.test`,
      },
      protectedOrg,
      protectedCounts,
    };

    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
  } catch (error) {
    for (const id of createdOrganizations) await sql`DELETE FROM organizations WHERE id = ${id}`;
    for (const id of createdUsers) await sql`DELETE FROM users WHERE id = ${id}`;
    throw error;
  }
}
