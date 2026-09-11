#!/usr/bin/env node
/**
 * Hardened reproducible integration test runner for Temporal Organizational Model (Phase 1).
 *
 * Safety properties:
 * 1. NEVER automatically consumes DATABASE_URL, POSTGRES_URL, or generic env vars.
 * 2. Default mode: dynamically resolves Neon 'main' branch, provisions ephemeral child branch,
 *    runs seed, migration, backfill assertions and integration tests exclusively there,
 *    and destroys ephemeral branch in finally block.
 * 3. If TEMPORAL_MODEL_DATABASE_URL is provided, explicitly requires
 *    ALLOW_EXISTING_TEMPORAL_TEST_DATABASE=true.
 * 4. Rejects target branch if it is default, main, protected, or lacks an unequivocally
 *    temporal/test name (tmp-, test-, ephemeral-).
 * 5. Returns FAIL and outputs branch ID if ephemeral branch cleanup fails.
 * 6. Seeds and asserts all 5 area backfill scenarios + employee link guarantee.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { Client } from "@neondatabase/serverless";

export const PROJECT_ID = process.env.NEON_PROJECT_ID || "holy-cake-85660318";

/**
 * Validates whether a branch name is unequivocally temporal or test.
 */
export function isTemporalBranchName(name) {
  if (!name || typeof name !== "string") return false;
  const lower = name.toLowerCase().trim();
  return (
    lower.startsWith("tmp-") ||
    lower.startsWith("tmp_") ||
    lower.startsWith("test-") ||
    lower.startsWith("test_") ||
    lower.startsWith("ephemeral-") ||
    lower.startsWith("ephemeral_")
  );
}

/**
 * Validates that a target branch is safe for destructive test operations.
 */
export function validateTargetBranch(branch) {
  if (!branch) {
    throw new Error("Target branch information is required for validation");
  }

  const name = typeof branch === "string" ? branch : branch.name;
  const isDefault = typeof branch === "object" ? Boolean(branch.default || branch.is_default || branch.primary) : false;
  const isProtected = typeof branch === "object" ? Boolean(branch.protected) : false;

  if (!name || typeof name !== "string") {
    throw new Error("Target branch must have a valid name");
  }

  const lower = name.toLowerCase().trim();

  if (isDefault) {
    throw new Error(`Refusing to target default branch: '${name}'`);
  }

  if (lower === "main" || lower === "master" || lower === "production") {
    throw new Error(`Refusing to target production/main branch: '${name}'`);
  }

  if (isProtected) {
    throw new Error(`Refusing to target protected branch: '${name}'`);
  }

  if (!isTemporalBranchName(name)) {
    throw new Error(
      `Target branch '${name}' does not have an unequivocally temporal name (must start with tmp-, test-, or ephemeral-)`
    );
  }

  return true;
}

/**
 * Dynamically resolves the 'main' branch of a Neon project.
 */
export function resolveNeonMainBranch(branches) {
  if (!Array.isArray(branches) || branches.length === 0) {
    throw new Error("No Neon branches found to resolve main branch");
  }
  const main =
    branches.find((b) => b.name === "main") ||
    branches.find((b) => b.default === true || b.primary === true);

  if (!main || !main.id) {
    throw new Error("Could not dynamically resolve Neon 'main' branch");
  }

  return main;
}

/**
 * Resolves runner configuration without ever falling back to DATABASE_URL or POSTGRES_URL.
 */
export function resolveRunnerConfig(env = process.env, options = {}) {
  const genericDbUrl = env.DATABASE_URL || env.POSTGRES_URL;
  const temporalDbUrl = env.TEMPORAL_MODEL_DATABASE_URL;

  if (temporalDbUrl) {
    if (env.ALLOW_EXISTING_TEMPORAL_TEST_DATABASE !== "true") {
      throw new Error(
        "Refusing to run against TEMPORAL_MODEL_DATABASE_URL without explicit ALLOW_EXISTING_TEMPORAL_TEST_DATABASE=true"
      );
    }

    if (options.targetBranch) {
      validateTargetBranch(options.targetBranch);
    }

    return {
      mode: "existing",
      connectionString: temporalDbUrl,
      isEphemeral: false,
      ignoredGenericUrl: Boolean(genericDbUrl),
    };
  }

  // Ephemeral mode is the only default. DATABASE_URL and POSTGRES_URL are strictly ignored.
  return {
    mode: "ephemeral",
    connectionString: null,
    isEphemeral: true,
    ignoredGenericUrl: Boolean(genericDbUrl),
  };
}

/**
 * Fetches all branches from Neon project via neonctl.
 */
export function fetchNeonBranches({ projectId = PROJECT_ID, neonctlExec = execFileSync } = {}) {
  const raw = neonctlExec(
    "npx",
    ["neonctl", "branches", "list", "--project-id", projectId, "--output", "json"],
    { encoding: "utf-8" }
  );
  return JSON.parse(raw);
}

/**
 * Provisions an ephemeral branch as a child of parentBranchId.
 */
export function createEphemeralBranch({
  projectId = PROJECT_ID,
  parentBranchId,
  neonctlExec = execFileSync,
} = {}) {
  if (!parentBranchId) {
    throw new Error("parentBranchId is required to create ephemeral branch");
  }

  const timestamp = Date.now();
  const rand = Math.random().toString(36).substring(2, 7);
  const branchName = `tmp-temporal-${timestamp}-${rand}`;

  validateTargetBranch(branchName);

  const raw = neonctlExec(
    "npx",
    [
      "neonctl",
      "branches",
      "create",
      "--name",
      branchName,
      "--parent",
      parentBranchId,
      "--project-id",
      projectId,
      "--output",
      "json",
    ],
    { encoding: "utf-8" }
  );

  const parsed = JSON.parse(raw);
  const branchId = parsed.branch?.id || parsed.id || (Array.isArray(parsed) ? parsed[0]?.id : null);
  if (!branchId) {
    throw new Error(`Failed to extract branch ID from neonctl output: ${raw}`);
  }

  let connectionString = null;
  if (parsed.connection_uris?.[0]?.connection_uri) {
    connectionString = parsed.connection_uris[0].connection_uri;
  } else {
    connectionString = neonctlExec(
      "npx",
      [
        "neonctl",
        "connection-string",
        branchId,
        "--project-id",
        projectId,
        "--database-name",
        "neondb",
      ],
      { encoding: "utf-8" }
    ).trim();
  }

  return { branchId, branchName, connectionString };
}

/**
 * Deletes an ephemeral branch from Neon.
 */
export function deleteEphemeralBranch({
  projectId = PROJECT_ID,
  branchId,
  neonctlExec = execFileSync,
} = {}) {
  if (!branchId) {
    throw new Error("branchId is required to delete ephemeral branch");
  }

  neonctlExec(
    "npx",
    ["neonctl", "branches", "delete", branchId, "--project-id", projectId],
    { encoding: "utf-8" }
  );
}

/**
 * Seeds legacy data covering:
 * - Unlinked employee (user_id IS NULL)
 * - Linked employee (user_id present)
 * - Case 1: Partially overlapping ranges
 * - Case 2: Contained ranges
 * - Case 3: Open period and consecutive assignments
 * - Case 4: Multiple secondary areas
 * - Case 5: employees.area_id fallback covering gaps (before, between, after)
 * - Legacy area_responsibles
 */
export async function seedLegacyBackfillCases(client, { seedOrgId }) {
  // Areas
  const aRes = await client.query(
    "INSERT INTO areas (organization_id, name) VALUES ($1, 'Area A'), ($1, 'Area B'), ($1, 'Area C'), ($1, 'Area D') RETURNING id, name",
    [seedOrgId]
  );
  const areaA = aRes.rows.find((r) => r.name === "Area A").id;
  const areaB = aRes.rows.find((r) => r.name === "Area B").id;
  const areaC = aRes.rows.find((r) => r.name === "Area C").id;
  const areaD = aRes.rows.find((r) => r.name === "Area D").id;

  // Users
  const uRes = await client.query(
    "INSERT INTO users (email, display_name, password_hash) VALUES " +
      "('seed_owner_' || gen_random_uuid() || '@test.com', 'Seed Owner', 'hash'), " +
      "('seed_admin_' || gen_random_uuid() || '@test.com', 'Seed Admin', 'hash'), " +
      "('seed_planner_' || gen_random_uuid() || '@test.com', 'Seed Planner', 'hash'), " +
      "('seed_emp_' || gen_random_uuid() || '@test.com', 'Seed Emp', 'hash') " +
      "RETURNING id, display_name"
  );
  const ownerId = uRes.rows.find((r) => r.display_name === "Seed Owner").id;
  const adminId = uRes.rows.find((r) => r.display_name === "Seed Admin").id;
  const plannerId = uRes.rows.find((r) => r.display_name === "Seed Planner").id;
  const empUserId = uRes.rows.find((r) => r.display_name === "Seed Emp").id;

  // Memberships
  await client.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'OWNER')", [seedOrgId, ownerId]);
  await client.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'ADMIN')", [seedOrgId, adminId]);
  await client.query("INSERT INTO memberships (organization_id, user_id, role, planner_scope_type, scoped_area_id) VALUES ($1, $2, 'PLANNER', 'AREAS', $3)", [seedOrgId, plannerId, areaA]);

  // Area Responsibles
  await client.query("INSERT INTO area_responsibles (organization_id, area_id, user_id) VALUES ($1, $2, $3)", [seedOrgId, areaA, adminId]);

  // Unlinked employee
  const unlinkedRes = await client.query(
    "INSERT INTO employees (organization_id, name, user_id, area_id, status, created_at) VALUES ($1, 'Unlinked Emp', NULL, $2, 'active', '2026-01-01') RETURNING id",
    [seedOrgId, areaA]
  );
  const unlinkedEmpId = unlinkedRes.rows[0].id;

  // Case 1: Partially overlapping ranges
  const c1Res = await client.query(
    "INSERT INTO employees (organization_id, name, user_id, area_id, status, created_at) VALUES ($1, 'Emp Case 1 Overlap', NULL, $2, 'active', '2026-01-01') RETURNING id",
    [seedOrgId, areaA]
  );
  const c1Id = c1Res.rows[0].id;
  await client.query(
    "INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to) VALUES " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-03-01', '2026-06-30'), " +
      "($1, 'EMPLOYEE_AREA', $2, $4, '2026-05-01', '2026-08-31')",
    [seedOrgId, c1Id, areaB, areaC]
  );

  // Case 2: Contained ranges
  const c2Res = await client.query(
    "INSERT INTO employees (organization_id, name, user_id, area_id, status, created_at) VALUES ($1, 'Emp Case 2 Contained', NULL, $2, 'active', '2026-01-01') RETURNING id",
    [seedOrgId, areaA]
  );
  const c2Id = c2Res.rows[0].id;
  await client.query(
    "INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to) VALUES " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-02-01', '2026-10-31'), " +
      "($1, 'EMPLOYEE_AREA', $2, $4, '2026-04-01', '2026-06-30')",
    [seedOrgId, c2Id, areaB, areaC]
  );

  // Case 3: Open period and consecutive assignments
  const c3Res = await client.query(
    "INSERT INTO employees (organization_id, name, user_id, area_id, status, created_at) VALUES ($1, 'Emp Case 3 Consecutive', NULL, $2, 'active', '2026-01-01') RETURNING id",
    [seedOrgId, areaA]
  );
  const c3Id = c3Res.rows[0].id;
  await client.query(
    "INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to) VALUES " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-03-01', '2026-05-31'), " +
      "($1, 'EMPLOYEE_AREA', $2, $4, '2026-06-01', NULL)",
    [seedOrgId, c3Id, areaB, areaC]
  );

  // Case 4: Multiple secondary areas
  const c4Res = await client.query(
    "INSERT INTO employees (organization_id, name, user_id, area_id, status, created_at) VALUES ($1, 'Emp Case 4 MultiSec', NULL, $2, 'active', '2026-01-01') RETURNING id",
    [seedOrgId, areaA]
  );
  const c4Id = c4Res.rows[0].id;
  await client.query(
    "INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to) VALUES " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-01-01', NULL), " +
      "($1, 'EMPLOYEE_AREA', $2, $4, '2026-03-01', '2026-07-31'), " +
      "($1, 'EMPLOYEE_AREA', $2, $5, '2026-05-01', '2026-09-30')",
    [seedOrgId, c4Id, areaA, areaB, areaC]
  );

  // Case 5: employees.area_id fallback covering gaps (before, between, after)
  const c5Res = await client.query(
    "INSERT INTO employees (organization_id, name, user_id, area_id, status, created_at) VALUES ($1, 'Emp Case 5 Gaps', $2, $3, 'active', '2026-01-01') RETURNING id",
    [seedOrgId, empUserId, areaA]
  );
  const c5Id = c5Res.rows[0].id;
  await client.query(
    "INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to) VALUES " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-03-01', '2026-04-30'), " +
      "($1, 'EMPLOYEE_AREA', $2, $4, '2026-08-01', '2026-09-30')",
    [seedOrgId, c5Id, areaB, areaC]
  );

  return {
    areas: { areaA, areaB, areaC, areaD },
    users: { ownerId, adminId, plannerId, empUserId },
    employees: { unlinkedEmpId, c1Id, c2Id, c3Id, c4Id, c5Id },
  };
}

/**
 * Verifies that the backfill complied with all requirements for the 5 cases.
 */
export async function verifyLegacyBackfillResults(client, { seedOrgId, seedData }) {
  const { areas, users, employees } = seedData;

  // 1. Employee link guarantee: unlinked employee MUST be PENDING_INVITATION
  const unlinkedCheck = await client.query(
    `SELECT op.status, op.user_id, ep.id as profile_id
      FROM organization_people op
      JOIN employee_profiles ep ON ep.organization_person_id = op.id
      WHERE op.organization_id = $1 AND ep.id = $2`,
    [seedOrgId, employees.unlinkedEmpId]
  );
  if (unlinkedCheck.rows.length === 0 || unlinkedCheck.rows[0].status !== "PENDING_INVITATION" || unlinkedCheck.rows[0].user_id !== null) {
    throw new Error(`Link invariant failed: unlinked employee must have status=PENDING_INVITATION. Found: ${JSON.stringify(unlinkedCheck.rows)}`);
  }

  // 2. Area responsibles mapped to person_access_scope_periods
  const respCheck = await client.query(
    `SELECT pasp.scope_type, pasp.area_id, pasp.source
      FROM person_access_scope_periods pasp
      JOIN organization_people op ON op.id = pasp.organization_person_id
      WHERE pasp.organization_id = $1 AND op.user_id = $2`,
    [seedOrgId, users.adminId]
  );
  if (!respCheck.rows.some((r) => r.scope_type === "AREA" && r.area_id === areas.areaA && r.source === "LEGACY_AREA_RESPONSIBLE")) {
    throw new Error(`Area responsible backfill failed for admin ${users.adminId}`);
  }

  // 3. Global invariant: NO overlapping primary area periods for ANY employee
  const overlapCheck = await client.query(
    `SELECT eap1.employee_profile_id, eap1.area_id as a1, eap2.area_id as a2,
             eap1.valid_from as from1, eap1.valid_to as to1,
             eap2.valid_from as from2, eap2.valid_to as to2
      FROM employee_area_periods eap1
      JOIN employee_area_periods eap2
        ON eap1.employee_profile_id = eap2.employee_profile_id
       AND eap1.id <> eap2.id
      WHERE eap1.organization_id = $1
        AND eap1.is_primary = true
        AND eap2.is_primary = true
        AND daterange(eap1.valid_from, eap1.valid_to, '[]') && daterange(eap2.valid_from, eap2.valid_to, '[]')`,
    [seedOrgId]
  );
  if (overlapCheck.rows.length > 0) {
    throw new Error(`Invariant violated: Found overlapping primary area periods: ${JSON.stringify(overlapCheck.rows)}`);
  }

  // Case 1 Check: Partially overlapping assignments (areaB 03-01..06-30 vs areaC 05-01..08-31)
  const c1Periods = (await client.query(
    `SELECT area_id, valid_from::text, valid_to::text, is_primary, source
      FROM employee_area_periods
      WHERE organization_id = $1 AND employee_profile_id = $2
      ORDER BY valid_from, is_primary DESC`,
    [seedOrgId, employees.c1Id]
  )).rows;

  // areaB stays primary across 2026-03-01..2026-06-30 (merged contiguous)
  const c1AreaB = c1Periods.find((r) => r.area_id === areas.areaB && r.valid_from === '2026-03-01' && r.valid_to === '2026-06-30' && r.is_primary);
  // areaC has secondary period in overlap window 2026-05-01..2026-06-30
  const c1AreaCSecondary = c1Periods.find((r) => r.area_id === areas.areaC && r.valid_from === '2026-05-01' && r.valid_to === '2026-06-30' && !r.is_primary);
  // areaC becomes primary once areaB completes 2026-07-01..2026-08-31
  const c1AreaCPrimary = c1Periods.find((r) => r.area_id === areas.areaC && r.valid_from === '2026-07-01' && r.valid_to === '2026-08-31' && r.is_primary);

  if (!c1AreaB || !c1AreaCSecondary || !c1AreaCPrimary) {
    throw new Error(`Case 1 precedence failed: areaB=${Boolean(c1AreaB)}, areaC_sec=${Boolean(c1AreaCSecondary)}, areaC_pri=${Boolean(c1AreaCPrimary)}. Found: ${JSON.stringify(c1Periods)}`);
  }

  // Case 2 Check: Contained assignments (areaB 02-01..10-31 contains areaC 04-01..06-30)
  const c2Periods = (await client.query(
    `SELECT area_id, valid_from::text, valid_to::text, is_primary, source
      FROM employee_area_periods
      WHERE organization_id = $1 AND employee_profile_id = $2
      ORDER BY valid_from, is_primary DESC`,
    [seedOrgId, employees.c2Id]
  )).rows;
  const c2Contained = c2Periods.find((r) => r.area_id === areas.areaC && r.valid_from === "2026-04-01" && r.valid_to === "2026-06-30");
  if (!c2Contained || c2Contained.is_primary !== false) {
    throw new Error(`Case 2 contained area must be secondary: ${JSON.stringify(c2Contained)}`);
  }

  // Case 3 Check: Open period and consecutive assignments
  const c3Periods = (await client.query(
    `SELECT area_id, valid_from::text, valid_to::text, is_primary, source
      FROM employee_area_periods
      WHERE organization_id = $1 AND employee_profile_id = $2
      ORDER BY valid_from`,
    [seedOrgId, employees.c3Id]
  )).rows;
  const c3Open = c3Periods.find((r) => r.area_id === areas.areaC && r.valid_from === "2026-06-01" && r.valid_to === null);
  if (!c3Open || !c3Open.is_primary) {
    throw new Error(`Case 3 open period failed: ${JSON.stringify(c3Open)}`);
  }

  // Case 4 Check: Multiple secondary areas concurrently
  const c4Periods = (await client.query(
    `SELECT area_id, valid_from::text, valid_to::text, is_primary, source
      FROM employee_area_periods
      WHERE organization_id = $1 AND employee_profile_id = $2
      ORDER BY valid_from, is_primary DESC`,
    [seedOrgId, employees.c4Id]
  )).rows;

  const c4Primary = c4Periods.find((r) => r.area_id === areas.areaA && r.valid_from === '2026-01-01' && r.valid_to === null && r.is_primary);
  const c4SecB = c4Periods.find((r) => r.area_id === areas.areaB && r.valid_from === '2026-03-01' && r.valid_to === '2026-07-31' && !r.is_primary);
  const c4SecC = c4Periods.find((r) => r.area_id === areas.areaC && r.valid_from === '2026-05-01' && r.valid_to === '2026-09-30' && !r.is_primary);

  if (!c4Primary || !c4SecB || !c4SecC) {
    throw new Error(`Case 4 multiple secondary areas failed: primary=${Boolean(c4Primary)}, secB=${Boolean(c4SecB)}, secC=${Boolean(c4SecC)}. Found: ${JSON.stringify(c4Periods)}`);
  }

  // Case 5 Check: employees.area_id fallback covering gaps before, between, and after
  const c5Periods = (await client.query(
    `SELECT area_id, valid_from::text, valid_to::text, is_primary, source
      FROM employee_area_periods
      WHERE organization_id = $1 AND employee_profile_id = $2
      ORDER BY valid_from`,
    [seedOrgId, employees.c5Id]
  )).rows;

  const gapBefore = c5Periods.find((r) => r.area_id === areas.areaA && r.valid_from === "2026-01-01" && r.valid_to === "2026-02-28" && r.source === "LEGACY_EMPLOYEE_AREA_FALLBACK");
  const gapBetween = c5Periods.find((r) => r.area_id === areas.areaA && r.valid_from === "2026-05-01" && r.valid_to === "2026-07-31" && r.source === "LEGACY_EMPLOYEE_AREA_FALLBACK");
  const gapAfter = c5Periods.find((r) => r.area_id === areas.areaA && r.valid_from === "2026-10-01" && r.valid_to === null && r.source === "LEGACY_EMPLOYEE_AREA_FALLBACK");

  if (!gapBefore || !gapBetween || !gapAfter) {
    throw new Error(`Case 5 fallback gaps failed: before=${Boolean(gapBefore)}, between=${Boolean(gapBetween)}, after=${Boolean(gapAfter)}`);
  }
}

/**
 * Main harness orchestration function.
 */
export async function runTemporalIntegrationHarness(options = {}) {
  const env = options.env || process.env;
  const neonctlExec = options.neonctlExec || execFileSync;
  const spawnSyncFn = options.spawnSyncFn || spawnSync;
  const ClientClass = options.ClientClass || Client;
  const verifyBackfillFn = options.verifyBackfillFn || verifyLegacyBackfillResults;
  const seedCasesFn = options.seedCasesFn || seedLegacyBackfillCases;

  const config = resolveRunnerConfig(env, options);

  if (config.ignoredGenericUrl) {
    console.log("[runner] Notice: DATABASE_URL / POSTGRES_URL was present in environment and strictly ignored for safety.");
  }

  let branchId = null;
  let connectionString = config.connectionString;
  const isEphemeral = config.isEphemeral;
  let executionError = null;
  let cleanupError = null;
  let passedCount = 0;

  try {
    if (isEphemeral) {
      console.log(`[runner] Querying branches for project '${PROJECT_ID}' to resolve 'main'...`);
      const branches = fetchNeonBranches({ projectId: PROJECT_ID, neonctlExec });
      const mainBranch = resolveNeonMainBranch(branches);
      console.log(`[runner] Resolved parent branch '${mainBranch.name}' (${mainBranch.id})`);

      console.log(`[runner] Provisioning ephemeral Neon child branch from '${mainBranch.id}'...`);
      const created = createEphemeralBranch({
        projectId: PROJECT_ID,
        parentBranchId: mainBranch.id,
        neonctlExec,
      });

      branchId = created.branchId;
      connectionString = created.connectionString;
      console.log(`[runner] Ephemeral child branch '${created.branchName}' (${branchId}) ready.`);
    } else {
      console.log("[runner] Using verified explicit TEMPORAL_MODEL_DATABASE_URL.");
    }

    // Step 1: Connect and seed legacy data
    console.log("[runner] Connecting to database...");
    const client = new ClientClass(connectionString);
    await client.connect();

    let seedData = null;
    let seedOrgId = null;

    try {
      console.log("[runner] Step 1: Checking pre-migration state and seeding legacy backfill cases...");
      // Record baseline migrations (0001..0035) present in parent branch schema
      await client.query("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
      const priorMigrations = [
        "0001_init.sql", "0002_password_reset.sql", "0003_login_attempts.sql", "0004_organization_plan.sql",
        "0005_employee_lifecycle.sql", "0006_employee_pending_access.sql", "0007_remove_manager_role.sql",
        "0008_areas_optional.sql", "0009_format_profiles.sql", "0010_import_history.sql",
        "0011_import_idempotency.sql", "0012_format_profiles_structurehash_uniqueness.sql",
        "0013_membership_roles_owner.sql", "0014_single_owner_per_organization.sql",
        "0015_membership_scoped_area.sql", "0016_organization_audit_events.sql",
        "0017_schedules.sql", "0018_schedule_versions.sql", "0019_shift_assignments.sql",
        "0020_shifts_schedule_version.sql", "0021_shift_assignments_import_id.sql",
        "0022_shift_acknowledgements.sql", "0023_shift_comments.sql", "0024_change_requests.sql",
        "0025_notifications.sql", "0026_oauth_identities.sql", "0027_approval_policy.sql",
        "0028_approval_requests.sql", "0029_approval_decision_metadata.sql",
        "0030_approval_rejection_metadata.sql", "0031_approval_audit_event_types.sql",
        "0032_change_request_application.sql", "0033_import_outcome.sql",
        "0034_shift_type_semantics.sql", "0035_operational_assignments.sql"
      ];
      for (const m of priorMigrations) {
        await client.query("INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [m]);
      }

      const preMig = await client.query(
        "SELECT name FROM _migrations WHERE name = '0036_temporal_organizational_model.sql'"
      );
      if (preMig.rows.length > 0) {
        throw new Error("Pre-migration assertion failed: 0036_temporal_organizational_model.sql is already applied on this target database.");
      }

      const orgRes = await client.query(
        "INSERT INTO organizations (name, type) VALUES ('Temporal Backfill Verification Corp', 'company') RETURNING id"
      );
      seedOrgId = orgRes.rows[0].id;

      seedData = await seedCasesFn(client, { seedOrgId });
      console.log("[runner] Legacy scenarios seeded successfully.");
    } finally {
      await client.end();
    }

    // Step 2: Apply migration 0036
    console.log("[runner] Step 2: Applying migration 0036_temporal_organizational_model.sql...");
    const migrateResult = spawnSyncFn("node", ["db/migrate.mjs"], {
      env: { ...env, DATABASE_URL: connectionString },
      encoding: "utf-8",
    });
    if (migrateResult.status !== 0) {
      console.error(migrateResult.stdout);
      console.error(migrateResult.stderr);
      throw new Error(`Migration runner db/migrate.mjs failed with status ${migrateResult.status}`);
    }
    console.log("[runner] Migration 0036 applied successfully.");

    // Step 3: Verify backfill results against seed
    console.log("[runner] Step 3: Verifying 5 legacy backfill cases and link invariants...");
    const verifyClient = new ClientClass(connectionString);
    await verifyClient.connect();
    try {
      await verifyBackfillFn(verifyClient, { seedOrgId, seedData });
      console.log("[runner] Backfill verification PASSED (all 5 cases + link guarantee confirmed).");
    } finally {
      await verifyClient.end();
    }

    // Step 4: Run PostgreSQL integration test suite
    console.log("[runner] Step 4: Running 23-scenario PostgreSQL integration test suite (Vitest)...");
    const testResult = spawnSyncFn(
      "npx",
      ["vitest", "run", "db/temporal-org-model.integration.test.mjs"],
      {
        env: {
          ...env,
          TEMPORAL_MODEL_DATABASE_URL: connectionString,
          // Explicitly clear generic DB URLs
          DATABASE_URL: "",
          POSTGRES_URL: "",
        },
        stdio: "inherit",
      }
    );

    if (testResult.status !== 0) {
      throw new Error(`Integration test suite failed with exit code ${testResult.status}`);
    }

    passedCount = 23;
    console.log(`[runner] All ${passedCount} integration scenarios PASSED.`);
  } catch (err) {
    executionError = err;
    console.error(`[runner] Execution error: ${err.message}`);
  } finally {
    // Step 5: Ephemeral branch cleanup
    if (isEphemeral && branchId) {
      console.log(`[runner] Step 5: Cleaning up ephemeral branch '${branchId}'...`);
      try {
        deleteEphemeralBranch({
          projectId: PROJECT_ID,
          branchId,
          neonctlExec,
        });
        console.log(`[runner] Ephemeral branch '${branchId}' successfully destroyed.`);
      } catch (cleanErr) {
        cleanupError = cleanErr;
        console.error(`[runner] FATAL CLEANUP FAILURE: Could not delete ephemeral branch '${branchId}': ${cleanErr.message}`);
        console.error(`[runner] MANUAL ACTION REQUIRED: Run 'npx neonctl branches delete ${branchId} --project-id ${PROJECT_ID}'`);
      }
    }
  }

  // If cleanup failed or tests failed, the harness must return FAIL
  if (executionError || cleanupError) {
    const finalMessage = [
      executionError ? `Test execution failed: ${executionError.message}` : null,
      cleanupError ? `Branch cleanup failed for branchId '${branchId}': ${cleanupError.message}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const finalErr = new Error(finalMessage);
    finalErr.branchId = branchId;
    finalErr.passedCount = executionError ? 0 : passedCount;
    throw finalErr;
  }

  return { status: "PASS", branchId, passedCount };
}

// Direct execution entrypoint
if (process.argv[1] && process.argv[1].endsWith("run-temporal-org-model-integration.mjs")) {
  runTemporalIntegrationHarness()
    .then((res) => {
      console.log(`[runner] Result: ${res.status} (${res.passedCount} tests passed)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[runner] Result: FAIL - ${err.message}`);
      process.exit(1);
    });
}
