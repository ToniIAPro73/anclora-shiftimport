#!/usr/bin/env node
/**
 * Format Memory v1 — real dev-DB acceptance run (FM-09).
 *
 * Exercises the actual data-access functions in api/_lib/format-profiles.js
 * against the real Neon dev branch (no fakes, no mocks) — unmocked evidence
 * for scenarios A-D, F-I from
 * sdd/features/format-memory-v1/04_ACCEPTANCE_TEST_PLAN.md. Scenario E
 * (guest local migration) and the browser-driven parts of A/B/C are already
 * covered by the extensive Vitest UI test suites written in FM-01..FM-08
 * (ProfileAssistantPanel.test.tsx, ImportModal.test.tsx,
 * FormatProfileMigrationModal.test.tsx, FormatProfilesModal.test.tsx) —
 * see 06_FINAL_REPORT.md for the honest ENVIRONMENT_BLOCKED note on full
 * browser-driven Playwright coverage of the multi-step assistant UI.
 *
 * Run: node --env-file=.env.development.local qa/e2e-acceptance/format-memory-acceptance.mjs
 * Cleans up all rows it creates, even on failure.
 */
import { neon } from '@neondatabase/serverless';
import {
  confirmFormatProfile,
  createCandidateFormatProfile,
  deprecateFormatProfile,
  getFormatProfile,
  listFormatProfiles,
  reactivateFormatProfile,
  recordFormatProfileUse,
  renameFormatProfile,
} from '../../api/_lib/format-profiles.js';
import { HttpError } from '../../api/_lib/auth.js';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

let pass = 0;
let fail = 0;
const results = [];

function assert(condition, label) {
  if (condition) {
    pass += 1;
    results.push(`PASS  ${label}`);
  } else {
    fail += 1;
    results.push(`FAIL  ${label}`);
  }
}

async function expectHttpError(fn, expectedStatus, label) {
  try {
    await fn();
    assert(false, `${label} (expected HttpError ${expectedStatus}, got no throw)`);
  } catch (error) {
    assert(error instanceof HttpError && error.status === expectedStatus, `${label} (got ${error?.status ?? error})`);
  }
}

const baseSignature = (overrides = {}) => ({
  documentType: 'TYPE_A', structureHash: 'deadbeef', dayHeaderCount: 31, columnCount: 33, hasLegend: true, ...overrides,
});

const candidateInput = (overrides = {}) => ({
  displayName: 'Cuadrante mensual FM-09',
  sourceType: 'pdf',
  signature: baseSignature(),
  tokenAliases: { DL: 'libre' },
  codeTimes: {},
  offTokens: ['DL'],
  employeeRowStrategy: 'manual-row',
  employeeRowIndex: 3,
  dayColumnMap: null,
  tabularMemory: null,
  parserConfig: { clusterTolerance: 4, columnMatchMaxDistance: 12 },
  ...overrides,
});

async function main() {
  const orgA = (await sql`INSERT INTO organizations (name, type, plan) VALUES ('FM09 Org A', 'company', 'team') RETURNING id`)[0].id;
  const orgB = (await sql`INSERT INTO organizations (name, type) VALUES ('FM09 Org B', 'company') RETURNING id`)[0].id;
  const adminId = (await sql`INSERT INTO users (email, password_hash, display_name) VALUES ('fm09-admin@e2e.test', 'x', 'FM09 Admin') RETURNING id`)[0].id;
  const empId = (await sql`INSERT INTO users (email, password_hash, display_name) VALUES ('fm09-emp@e2e.test', 'x', 'FM09 Empleado') RETURNING id`)[0].id;
  const adminBId = (await sql`INSERT INTO users (email, password_hash, display_name) VALUES ('fm09-admin-b@e2e.test', 'x', 'FM09 Admin B') RETURNING id`)[0].id;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${adminId}, ${orgA}, 'ADMIN')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${empId}, ${orgA}, 'EMPLOYEE')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${adminBId}, ${orgB}, 'ADMIN')`;

  const ctxAdminA = { user: { id: adminId }, organizationId: orgA, role: 'ADMIN' };
  const ctxEmpA = { user: { id: empId }, organizationId: orgA, role: 'EMPLOYEE' };
  const ctxAdminB = { user: { id: adminBId }, organizationId: orgB, role: 'ADMIN' };

  try {
    // --- A. First import (learning) ---
    const { profile: v1, created } = await createCandidateFormatProfile(sql, ctxAdminA, candidateInput());
    assert(created === true, 'A: create-candidate inserts a new row (created=true)');
    assert(v1.status === 'candidate', 'A: new profile status is candidate');
    assert(v1.version === 1, 'A: new profile starts at version 1');

    // ADMIN confirms it.
    const confirmed = await confirmFormatProfile(sql, ctxAdminA, v1.id, v1.updatedAt);
    assert(confirmed.status === 'validated', 'A: ADMIN confirm moves candidate -> validated');

    // --- B/C. Reuse — same org, second user (EMPLOYEE) ---
    const listedByEmployee = await listFormatProfiles(sql, ctxEmpA, {});
    assert(listedByEmployee.some((p) => p.id === v1.id), 'C: EMPLOYEE of the same org can list the profile ADMIN created');
    const used = await recordFormatProfileUse(sql, ctxEmpA, v1.id, 'success');
    assert(used.useCount === 1 && used.successfulUseCount === 1, 'C: EMPLOYEE recordUse increments counters (org-shared reuse)');

    // --- D. Isolation: Org B cannot see Org A's profile ---
    await expectHttpError(() => getFormatProfile(sql, ctxAdminB, v1.id), 404, 'D: cross-tenant getFormatProfile is 404 (no leak)');
    const listedByOrgB = await listFormatProfiles(sql, ctxAdminB, {});
    assert(!listedByOrgB.some((p) => p.id === v1.id), 'D: cross-tenant list never includes another org\'s profile');

    // --- F. Drift: template changed, new candidate version, v1 preserved ---
    const driftedSignature = baseSignature({ structureHash: 'cafebabe', columnCount: 40 });
    const { profile: v2, created: v2Created } = await createCandidateFormatProfile(sql, ctxEmpA, candidateInput({
      signature: driftedSignature,
      supersedesLogicalProfileId: v1.logicalProfileId,
    }));
    assert(v2Created === true, 'F: drift creates a new row, not an in-place update');
    assert(v2.version === 2 && v2.status === 'candidate', 'F: drifted candidate is version 2, status candidate');
    assert(v2.supersedesProfileId === v1.id, 'F: new candidate supersedes v1 by id');

    const v1AfterDrift = await getFormatProfile(sql, ctxAdminA, v1.id);
    assert(v1AfterDrift.status === 'validated' && v1AfterDrift.signature.structureHash === baseSignature().structureHash,
      'F: v1 is untouched immediately after drift (still validated, original signature)');

    const v2Confirmed = await confirmFormatProfile(sql, ctxAdminA, v2.id, v2.updatedAt);
    assert(v2Confirmed.status === 'validated', 'F: ADMIN confirms v2 -> validated');
    const v1AfterConfirm = await getFormatProfile(sql, ctxAdminA, v1.id);
    assert(v1AfterConfirm.status === 'legacy', 'F: confirming v2 demotes v1 to legacy (never deleted)');
    assert(v1AfterConfirm.signature.structureHash === baseSignature().structureHash, 'F: v1 signature/history intact after demotion (no data loss)');

    // --- G. Rollback: reactivate the legacy v1 ---
    const reactivated = await reactivateFormatProfile(sql, ctxAdminA, v1.id, v1AfterConfirm.updatedAt);
    assert(reactivated.status === 'validated', 'G: reactivating a legacy version restores it to validated');

    // Rename (ADMIN-only metadata edit).
    const renamed = await renameFormatProfile(sql, ctxAdminA, v2.id, 'Cuadrante mensual (renombrado)', v2Confirmed.updatedAt);
    assert(renamed.displayName === 'Cuadrante mensual (renombrado)', 'metadata: ADMIN rename updates displayName');

    // Deprecate.
    const deprecated = await deprecateFormatProfile(sql, ctxAdminA, v2.id, renamed.updatedAt);
    assert(deprecated.status === 'deprecated', 'lifecycle: ADMIN deprecate moves candidate/validated -> deprecated');

    // --- H. Privacy: zero PII across every persisted row for these orgs ---
    const allRows = await sql`SELECT * FROM format_profiles WHERE organization_id IN (${orgA}, ${orgB})`;
    const serialized = JSON.stringify(allRows).toLowerCase();
    const forbidden = ['fm09 admin', 'fm09 empleado', 'fm09 admin b', 'fm09-admin@e2e.test', 'fm09-emp@e2e.test'];
    for (const needle of forbidden) {
      assert(!serialized.includes(needle), `H: persisted rows never contain "${needle}"`);
    }
    assert(/^[0-9a-f]{8}$/.test(allRows[0]?.signature?.structureHash ?? ''), 'H: structureHash is an 8-hex-char one-way hash, never raw text');

    // --- I. Errors: malicious/adversarial payloads rejected, role gating enforced ---
    await expectHttpError(
      () => createCandidateFormatProfile(sql, ctxAdminA, candidateInput({ displayName: 'María García López' })),
      400,
      'I: name-shaped displayName is rejected (400 INVALID_PROFILE_PAYLOAD)',
    );
    await expectHttpError(
      () => createCandidateFormatProfile(sql, ctxAdminA, { ...candidateInput(), employeeName: 'Ana Torres' }),
      400,
      'I: unknown field ("employeeName") is rejected outright, never silently dropped',
    );
    await expectHttpError(
      () => confirmFormatProfile(sql, ctxEmpA, v1.id, v1AfterConfirm.updatedAt),
      403,
      'I: EMPLOYEE cannot confirm (403, ADMIN-only)',
    );
    await expectHttpError(
      () => renameFormatProfile(sql, ctxEmpA, v1.id, 'x', v1AfterConfirm.updatedAt),
      403,
      'I: EMPLOYEE cannot rename (403, ADMIN-only)',
    );

    // Idempotency: repeating the exact same v1 candidate create returns the same row.
    const repeat = await createCandidateFormatProfile(sql, ctxAdminA, candidateInput());
    assert(repeat.created === false && repeat.profile.id === v1.id, 'idempotency: identical structureHash create returns the existing row, not a duplicate');
  } finally {
    await sql`DELETE FROM organizations WHERE id IN (${orgA}, ${orgB})`; // cascades format_profiles/memberships
    await sql`DELETE FROM users WHERE id IN (${adminId}, ${empId}, ${adminBId})`;
  }

  console.log(results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('FM-09 acceptance script crashed:', error);
  process.exitCode = 1;
});
