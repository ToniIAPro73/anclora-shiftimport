#!/usr/bin/env node
/**
 * Hardened reproducible integration test runner for Temporal Organizational Model (Phase 1).
 *
 * Safety properties:
 * 1. NEVER automatically consumes DATABASE_URL, POSTGRES_URL, or generic env vars.
 * 2. Default mode: dynamically resolves base branch ('preview/development'), provisions ephemeral child branch,
 *    runs seed, migration, backfill assertions and integration tests exclusively there,
 *    and destroys ephemeral branch in finally block.
 * 3. If TEMPORAL_MODEL_DATABASE_URL is provided, explicitly requires
 *    ALLOW_EXISTING_TEMPORAL_TEST_DATABASE=true.
 * 4. Rejects target branch if it is default, main, protected, or lacks an unequivocally
 *    temporal/test name (tmp-, test-, ephemeral-).
 * 5. Returns FAIL and outputs branch ID if ephemeral branch cleanup fails.
 * 6. Seeds and asserts all 5 area backfill scenarios + employee link guarantee.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { Client } from "@neondatabase/serverless";

export const PROJECT_ID = process.env.NEON_PROJECT_ID || "holy-cake-85660318";
export const DEFAULT_BASE_BRANCH_ID = "br-falling-heart-b1d6u2cx"; // preview/development

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
export function validateTargetBranch(branch, { expectedParentBranchId = null } = {}) {
  if (!branch) {
    throw new Error("Target branch information is required for validation");
  }

  const name = typeof branch === "string" ? branch : branch.name;
  const isDefault = typeof branch === "object" ? Boolean(branch.default || branch.is_default || branch.primary) : false;
  const isProtected = typeof branch === "object" ? Boolean(branch.protected) : false;
  const parentId = typeof branch === "object" ? (branch.parent_id || null) : null;

  if (!name || typeof name !== "string") {
    throw new Error("Target branch must have a valid name");
  }

  const lower = name.toLowerCase().trim();

  if (isDefault) {
    throw new Error(`Refusing to target default branch: '${name}'`);
  }

  if (
    lower === "main" ||
    lower === "master" ||
    lower === "production" ||
    lower === "preview/production" ||
    lower === "preview/staging"
  ) {
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

  if (expectedParentBranchId && parentId && parentId !== expectedParentBranchId) {
    throw new Error(
      `Target branch '${name}' parent '${parentId}' does not match expected parent '${expectedParentBranchId}'`
    );
  }

  return true;
}

/**
 * Resolves the base branch for ephemeral branching.
 * Strictly rejects 'main', 'master', 'production', default, or primary branches.
 */
export function resolveNeonBaseBranch(branches, requestedBaseBranchId = DEFAULT_BASE_BRANCH_ID) {
  if (!Array.isArray(branches) || branches.length === 0) {
    throw new Error("No Neon branches found to resolve base branch");
  }

  const baseBranch = branches.find(
    (b) => b.id === requestedBaseBranchId || b.name === requestedBaseBranchId
  );

  if (!baseBranch || !baseBranch.id) {
    throw new Error(`Base branch '${requestedBaseBranchId}' not found in Neon project branches`);
  }

  const lowerName = (baseBranch.name || "").toLowerCase().trim();
  const isDefault = Boolean(baseBranch.default || baseBranch.is_default || baseBranch.primary);
  const isProtected = Boolean(baseBranch.protected);

  if (
    lowerName === "main" ||
    lowerName === "master" ||
    lowerName === "production" ||
    lowerName === "preview/production" ||
    lowerName === "preview/staging" ||
    isDefault
  ) {
    throw new Error(
      `Refusing to use 'main' or default/primary branch as base branch: '${baseBranch.name}' (${baseBranch.id})`
    );
  }

  if (isProtected) {
    throw new Error(
      `Refusing to use protected branch as base branch: '${baseBranch.name}' (${baseBranch.id})`
    );
  }

  return baseBranch;
}

/**
 * Dynamically resolves the 'main' branch of a Neon project (retained for introspection).
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
 * Fetches all endpoints from Neon project via neonctl.
 */
export function fetchNeonEndpoints({ projectId = PROJECT_ID, neonctlExec = execFileSync } = {}) {
  const raw = neonctlExec(
    "npx",
    ["neonctl", "api", `/projects/${projectId}/endpoints`],
    { encoding: "utf-8" }
  );
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.endpoints || [];
}

/**
 * Resolves the actual Neon branch associated with a database connection string.
 * Maps: connection string host -> Neon endpoint -> Neon branch.
 */
export function resolveBranchFromConnectionString(
  connectionString,
  {
    projectId = PROJECT_ID,
    neonctlExec = execFileSync,
    branches = null,
    endpoints = null,
    expectedBranchId = null,
    expectedEndpointId = null,
  } = {}
) {
  if (!connectionString || typeof connectionString !== "string") {
    throw new Error("connectionString is required to resolve branch");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(connectionString);
  } catch (err) {
    throw new Error(`Invalid connection string: ${err.message}`);
  }

  const hostname = parsedUrl.hostname;
  if (!hostname) {
    throw new Error(`Could not extract hostname from connection string: ${connectionString}`);
  }

  const endpointList = endpoints || fetchNeonEndpoints({ projectId, neonctlExec });
  const matchedEndpoint = endpointList.find((ep) => {
    if (ep.host === hostname) return true;
    if (ep.hosts?.read_write_host === hostname) return true;
    if (ep.hosts?.read_write_pooled_host === hostname) return true;
    if (ep.id && (hostname.startsWith(ep.id + '.') || hostname.startsWith(ep.id + '-'))) return true;
    return false;
  });

  if (!matchedEndpoint) {
    throw new Error(`Could not identify Neon endpoint for host '${hostname}' in project '${projectId}'. Refusing to connect.`);
  }

  if (expectedEndpointId && matchedEndpoint.id !== expectedEndpointId) {
    throw new Error(
      `Endpoint mismatch: expected endpoint '${expectedEndpointId}', but host '${hostname}' mapped to endpoint '${matchedEndpoint.id}'. Refusing to connect.`
    );
  }

  const branchId = matchedEndpoint.branch_id;
  if (!branchId) {
    throw new Error(`Neon endpoint '${matchedEndpoint.id}' has no associated branch_id. Refusing to connect.`);
  }

  if (expectedBranchId && branchId !== expectedBranchId) {
    throw new Error(
      `Branch mismatch: expected branch '${expectedBranchId}', but endpoint '${matchedEndpoint.id}' belongs to branch '${branchId}'. Refusing to connect.`
    );
  }

  const branchList = branches || fetchNeonBranches({ projectId, neonctlExec });
  const matchedBranch = branchList.find((b) => b.id === branchId);
  if (!matchedBranch) {
    throw new Error(`Branch '${branchId}' associated with endpoint '${matchedEndpoint.id}' was not found in project '${projectId}'. Refusing to connect.`);
  }

  return matchedBranch;
}

/**
 * Asserts that a connection string points to a verified, safe, temporal Neon branch.
 * Strictly resolves: connectionString -> host -> endpoint -> branch -> validation.
 * Fails closed before any database connection.
 */
export function assertSafeTemporalDatabaseUrl(
  connectionString,
  {
    projectId = PROJECT_ID,
    neonctlExec = execFileSync,
    branches = null,
    endpoints = null,
    expectedBranchId = null,
    expectedEndpointId = null,
  } = {}
) {
  const branch = resolveBranchFromConnectionString(connectionString, {
    projectId,
    neonctlExec,
    branches,
    endpoints,
    expectedBranchId,
    expectedEndpointId,
  });
  validateTargetBranch(branch);
  return branch;
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

    const neonctlExec = options.neonctlExec || execFileSync;
    const projectId = options.projectId || PROJECT_ID;
    const targetBranch = assertSafeTemporalDatabaseUrl(temporalDbUrl, {
      projectId,
      neonctlExec,
      branches: options.branches,
      endpoints: options.endpoints,
      expectedBranchId: options.expectedBranchId,
      expectedEndpointId: options.expectedEndpointId,
    });

    return {
      mode: "existing",
      connectionString: temporalDbUrl,
      isEphemeral: false,
      ignoredGenericUrl: Boolean(genericDbUrl),
      targetBranch,
    };
  }

  const baseBranchId = env.TEMPORAL_BASE_BRANCH_ID || options.baseBranchId || DEFAULT_BASE_BRANCH_ID;

  // Ephemeral mode is the only default. DATABASE_URL and POSTGRES_URL are strictly ignored.
  return {
    mode: "ephemeral",
    connectionString: null,
    isEphemeral: true,
    baseBranchId,
    ignoredGenericUrl: Boolean(genericDbUrl),
  };
}

/**
 * Accredits an ephemeral branch before any connection, seed, or migration.
 * Verifies exact branch ID, temporal naming pattern, parent_id, not default/primary/protected,
 * and that connection string hostname resolves to an endpoint belonging to this exact branch.
 */
export function accreditBranchBeforeConnection({
  branchId,
  connectionString,
  baseBranchId,
  expectedEndpointId = null,
  projectId = PROJECT_ID,
  neonctlExec = execFileSync,
  branches = null,
  endpoints = null,
} = {}) {
  if (!branchId) {
    throw new Error("accreditBranchBeforeConnection: branchId is required");
  }
  if (!connectionString) {
    throw new Error("accreditBranchBeforeConnection: connectionString is required");
  }
  if (!baseBranchId) {
    throw new Error("accreditBranchBeforeConnection: baseBranchId is required");
  }

  const branchList = branches || fetchNeonBranches({ projectId, neonctlExec });
  const matchedBranch = branchList.find((b) => b.id === branchId);
  if (!matchedBranch) {
    throw new Error(`Accreditation failure: Created branch '${branchId}' not found in Neon project branches`);
  }

  if (!isTemporalBranchName(matchedBranch.name)) {
    throw new Error(
      `Accreditation failure: Branch '${matchedBranch.name}' does not have an unequivocally temporal name (must start with tmp-, test-, or ephemeral-)`
    );
  }

  if (matchedBranch.parent_id !== baseBranchId) {
    throw new Error(
      `Accreditation failure: Branch '${matchedBranch.name}' parent_id '${matchedBranch.parent_id}' does not match expected base branch '${baseBranchId}'`
    );
  }

  if (matchedBranch.default || matchedBranch.is_default || matchedBranch.primary) {
    throw new Error(
      `Accreditation failure: Branch '${matchedBranch.name}' is marked as default or primary branch`
    );
  }

  if (matchedBranch.protected) {
    throw new Error(
      `Accreditation failure: Branch '${matchedBranch.name}' is marked as protected branch`
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(connectionString);
  } catch (err) {
    throw new Error(`Accreditation failure: Invalid connection string: ${err.message}`);
  }

  const hostname = parsedUrl.hostname;
  if (!hostname) {
    throw new Error(`Accreditation failure: Could not extract hostname from connection string`);
  }

  const endpointList = endpoints || fetchNeonEndpoints({ projectId, neonctlExec });
  const matchedEndpoint = endpointList.find((ep) => {
    if (ep.host === hostname) return true;
    if (ep.hosts?.read_write_host === hostname) return true;
    if (ep.hosts?.read_write_pooled_host === hostname) return true;
    if (ep.id && (hostname.startsWith(ep.id + '.') || hostname.startsWith(ep.id + '-'))) return true;
    return false;
  });

  if (!matchedEndpoint) {
    throw new Error(
      `Accreditation failure: Host '${hostname}' does not map to any endpoint in Neon project '${projectId}'`
    );
  }

  if (matchedEndpoint.branch_id !== branchId) {
    throw new Error(
      `Accreditation failure: Endpoint '${matchedEndpoint.id}' belongs to branch '${matchedEndpoint.branch_id}', not the accredited ephemeral branch '${branchId}'`
    );
  }

  if (expectedEndpointId && matchedEndpoint.id !== expectedEndpointId) {
    throw new Error(
      `Accreditation failure: Expected endpoint ID '${expectedEndpointId}', but host '${hostname}' resolved to endpoint '${matchedEndpoint.id}'`
    );
  }

  return { branch: matchedBranch, endpoint: matchedEndpoint };
}

export const TEMPORAL_TABLES = [
  "organization_people",
  "employee_profiles",
  "person_role_periods",
  "employee_area_periods",
  "person_access_scope_periods",
  "reporting_relationship_periods",
];

export const TEMPORAL_VIEWS = [
  "current_person_roles",
  "current_employee_areas",
  "current_person_access_scopes",
  "current_reporting_relationships",
];

export const TEMPORAL_ROUTINES = [
  "check_employee_profile_person_link_validity",
  "check_organization_person_employee_link_validity",
  "check_reporting_relationship_validity",
  "check_employee_area_period_labor_validity",
  "transfer_organization_ownership_temporal",
  "check_employee_profile_labor_tenure_update",
];

export const TEMPORAL_TRIGGERS = [
  "trg_check_employee_profile_person_link",
  "trg_check_organization_person_employee_link",
  "trg_check_reporting_relationship",
  "trg_check_employee_area_period_labor_validity",
  "trg_check_employee_profile_labor_tenure",
];

export const TEMPORAL_MIGRATIONS = [
  "0036_temporal_organizational_model.sql",
  "0037_temporal_ownership_transfer_and_labor_integrity.sql",
];

/**
 * Asserts that no temporal tables, views, routines, triggers, or migrations are present.
 * Fails closed if any temporal artifact is found.
 */
export async function assertNoTemporalObjectsPresent(client, { context = "database" } = {}) {
  // 1. Check _migrations
  const hasMigrationsTable = await client.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_migrations'"
  );
  if (hasMigrationsTable.rows.length > 0) {
    const migs = await client.query(
      "SELECT name FROM _migrations WHERE name = ANY($1::text[])",
      [TEMPORAL_MIGRATIONS]
    );
    if (migs.rows.length > 0) {
      throw new Error(
        `Preflight assertion failed: temporal migration(s) [${migs.rows.map((r) => r.name).join(", ")}] already recorded in _migrations in ${context}`
      );
    }
  }

  // 2. Check tables
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
    [TEMPORAL_TABLES]
  );
  if (tables.rows.length > 0) {
    throw new Error(
      `Preflight assertion failed: temporal table(s) [${tables.rows.map((r) => r.table_name).join(", ")}] already exist in ${context}`
    );
  }

  // 3. Check views
  const views = await client.query(
    "SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
    [TEMPORAL_VIEWS]
  );
  if (views.rows.length > 0) {
    throw new Error(
      `Preflight assertion failed: temporal view(s) [${views.rows.map((r) => r.table_name).join(", ")}] already exist in ${context}`
    );
  }

  // 4. Check routines
  const routines = await client.query(
    "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = ANY($1::text[])",
    [TEMPORAL_ROUTINES]
  );
  if (routines.rows.length > 0) {
    throw new Error(
      `Preflight assertion failed: temporal routine(s) [${routines.rows.map((r) => r.routine_name).join(", ")}] already exist in ${context}`
    );
  }

  // 5. Check triggers
  const triggers = await client.query(
    "SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = 'public' AND trigger_name = ANY($1::text[])",
    [TEMPORAL_TRIGGERS]
  );
  if (triggers.rows.length > 0) {
    throw new Error(
      `Preflight assertion failed: temporal trigger(s) [${triggers.rows.map((r) => r.trigger_name).join(", ")}] already exist in ${context}`
    );
  }

  return true;
}

/**
 * Asserts that all temporal tables, views, routines, and migrations are materialized after migration.
 */
export async function assertTemporalObjectsMaterialized(client, { context = "database" } = {}) {
  // 1. Check _migrations
  const migs = await client.query(
    "SELECT name FROM _migrations WHERE name = ANY($1::text[])",
    [TEMPORAL_MIGRATIONS]
  );
  const foundMigs = new Set(migs.rows.map((r) => r.name));
  for (const m of TEMPORAL_MIGRATIONS) {
    if (!foundMigs.has(m)) {
      throw new Error(`Post-migration assertion failed: migration '${m}' was not recorded in _migrations in ${context}`);
    }
  }

  // 2. Check tables
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
    [TEMPORAL_TABLES]
  );
  const foundTables = new Set(tables.rows.map((r) => r.table_name));
  for (const t of TEMPORAL_TABLES) {
    if (!foundTables.has(t)) {
      throw new Error(`Post-migration assertion failed: temporal table '${t}' was not created in ${context}`);
    }
  }

  // 3. Check views
  const views = await client.query(
    "SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
    [TEMPORAL_VIEWS]
  );
  const foundViews = new Set(views.rows.map((r) => r.table_name));
  for (const v of TEMPORAL_VIEWS) {
    if (!foundViews.has(v)) {
      throw new Error(`Post-migration assertion failed: temporal view '${v}' was not created in ${context}`);
    }
  }

  // 4. Check routines
  const routines = await client.query(
    "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = ANY($1::text[])",
    [TEMPORAL_ROUTINES]
  );
  const foundRoutines = new Set(routines.rows.map((r) => r.routine_name));
  for (const r of TEMPORAL_ROUTINES) {
    if (!foundRoutines.has(r)) {
      throw new Error(`Post-migration assertion failed: routine '${r}' not found in ${context}`);
    }
  }

  // 5. Check triggers
  const triggers = await client.query(
    "SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = 'public' AND trigger_name = ANY($1::text[])",
    [TEMPORAL_TRIGGERS]
  );
  const foundTriggers = new Set(triggers.rows.map((t) => t.trigger_name));
  for (const trg of TEMPORAL_TRIGGERS) {
    if (!foundTriggers.has(trg)) {
      throw new Error(`Post-migration assertion failed: trigger '${trg}' not found in ${context}`);
    }
  }

  return true;
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

  // Case Same-Area A: Open followed by closed in same area
  const cSaRes = await client.query(
    "INSERT INTO employees (organization_id, name, user_id, area_id, status, created_at) VALUES ($1, 'Emp Same-Area Open+Closed', NULL, NULL, 'active', '2026-01-01') RETURNING id",
    [seedOrgId]
  );
  const cSaId = cSaRes.rows[0].id;
  await client.query(
    "INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to) VALUES " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-02-01', NULL), " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-05-01', '2026-08-31')",
    [seedOrgId, cSaId, areaB]
  );

  // Case Same-Area B: Closed contained in open in same area
  const cSbRes = await client.query(
    "INSERT INTO employees (organization_id, name, user_id, area_id, status, created_at) VALUES ($1, 'Emp Same-Area Contained in Open', NULL, NULL, 'active', '2026-01-01') RETURNING id",
    [seedOrgId]
  );
  const cSbId = cSbRes.rows[0].id;
  await client.query(
    "INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to) VALUES " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-01-01', NULL), " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-03-01', '2026-04-30')",
    [seedOrgId, cSbId, areaB]
  );

  // Case Same-Area C: Consecutive and overlapping closed in same area
  const cScRes = await client.query(
    "INSERT INTO employees (organization_id, name, user_id, area_id, status, created_at) VALUES ($1, 'Emp Same-Area Consecutive Overlap', NULL, NULL, 'active', '2026-01-01') RETURNING id",
    [seedOrgId]
  );
  const cScId = cScRes.rows[0].id;
  await client.query(
    "INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to) VALUES " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-02-01', '2026-04-30'), " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-05-01', '2026-07-31'), " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-07-15', '2026-09-30')",
    [seedOrgId, cScId, areaB]
  );

  // Case Same-Area D: Legacy exact duplicates in same area
  const cSdRes = await client.query(
    "INSERT INTO employees (organization_id, name, user_id, area_id, status, created_at) VALUES ($1, 'Emp Same-Area Duplicates', NULL, NULL, 'active', '2026-01-01') RETURNING id",
    [seedOrgId]
  );
  const cSdId = cSdRes.rows[0].id;
  await client.query(
    "INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to) VALUES " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-03-01', '2026-06-30'), " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-03-01', '2026-06-30')",
    [seedOrgId, cSdId, areaB]
  );

  // Case Labor E: Clamping assignments to labor tenure (started_on / ended_on) and discarding empty intersections
  const cLeRes = await client.query(
    "INSERT INTO employees (organization_id, name, user_id, area_id, status, created_at, deactivated_at) VALUES " +
      "($1, 'Emp Labor Clamped', NULL, NULL, 'inactive', '2026-02-01', '2026-08-31') RETURNING id",
    [seedOrgId]
  );
  const cLeId = cLeRes.rows[0].id;
  await client.query(
    "INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to) VALUES " +
      "($1, 'EMPLOYEE_AREA', $2, $3, '2026-01-01', '2026-10-31'), " +
      "($1, 'EMPLOYEE_AREA', $2, $4, '2026-09-01', '2026-11-30')",
    [seedOrgId, cLeId, areaB, areaC]
  );

  // Case Labor F: Inactive employee fallback cutoff (does NOT extend to infinity)
  const cLfRes = await client.query(
    "INSERT INTO employees (organization_id, name, user_id, area_id, status, created_at, deactivated_at) VALUES " +
      "($1, 'Emp Inactive Fallback Cutoff', NULL, $2, 'inactive', '2026-01-01', '2026-05-31') RETURNING id",
    [seedOrgId, areaA]
  );
  const cLfId = cLfRes.rows[0].id;

  return {
    areas: { areaA, areaB, areaC, areaD },
    users: { ownerId, adminId, plannerId, empUserId },
    employees: { unlinkedEmpId, c1Id, c2Id, c3Id, c4Id, c5Id, cSaId, cSbId, cScId, cSdId, cLeId, cLfId },
  };
}

/**
 * Verifies that the backfill complied with all requirements for the cases.
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

  // Case Same-Area A: Open followed by closed in same area -> single open period [2026-02-01, NULL]
  const cSaPeriods = (await client.query(
    "SELECT area_id, valid_from::text, valid_to::text, is_primary FROM employee_area_periods WHERE employee_profile_id = $1",
    [employees.cSaId]
  )).rows;
  if (cSaPeriods.length !== 1 || cSaPeriods[0].area_id !== areas.areaB || cSaPeriods[0].valid_from !== '2026-02-01' || cSaPeriods[0].valid_to !== null) {
    throw new Error(`Same-area Case A failed: expected 1 open period [2026-02-01, NULL], got ${JSON.stringify(cSaPeriods)}`);
  }

  // Case Same-Area B: Closed contained in open in same area -> single open period [2026-01-01, NULL]
  const cSbPeriods = (await client.query(
    "SELECT area_id, valid_from::text, valid_to::text, is_primary FROM employee_area_periods WHERE employee_profile_id = $1",
    [employees.cSbId]
  )).rows;
  if (cSbPeriods.length !== 1 || cSbPeriods[0].area_id !== areas.areaB || cSbPeriods[0].valid_from !== '2026-01-01' || cSbPeriods[0].valid_to !== null) {
    throw new Error(`Same-area Case B failed: expected 1 open period [2026-01-01, NULL], got ${JSON.stringify(cSbPeriods)}`);
  }

  // Case Same-Area C: Consecutive and overlapping closed in same area -> single merged period [2026-02-01, 2026-09-30]
  const cScPeriods = (await client.query(
    "SELECT area_id, valid_from::text, valid_to::text, is_primary FROM employee_area_periods WHERE employee_profile_id = $1",
    [employees.cScId]
  )).rows;
  if (cScPeriods.length !== 1 || cScPeriods[0].area_id !== areas.areaB || cScPeriods[0].valid_from !== '2026-02-01' || cScPeriods[0].valid_to !== '2026-09-30') {
    throw new Error(`Same-area Case C failed: expected 1 merged period [2026-02-01, 2026-09-30], got ${JSON.stringify(cScPeriods)}`);
  }

  // Case Same-Area D: Duplicates in same area -> single period [2026-03-01, 2026-06-30]
  const cSdPeriods = (await client.query(
    "SELECT area_id, valid_from::text, valid_to::text, is_primary FROM employee_area_periods WHERE employee_profile_id = $1",
    [employees.cSdId]
  )).rows;
  if (cSdPeriods.length !== 1 || cSdPeriods[0].area_id !== areas.areaB || cSdPeriods[0].valid_from !== '2026-03-01' || cSdPeriods[0].valid_to !== '2026-06-30') {
    throw new Error(`Same-area Case D failed: expected 1 period [2026-03-01, 2026-06-30], got ${JSON.stringify(cSdPeriods)}`);
  }

  // Case Labor E: Clamped to tenure [2026-02-01, 2026-08-31], outside assignment discarded
  const cLePeriods = (await client.query(
    "SELECT area_id, valid_from::text, valid_to::text, is_primary FROM employee_area_periods WHERE employee_profile_id = $1",
    [employees.cLeId]
  )).rows;
  if (cLePeriods.length !== 1 || cLePeriods[0].area_id !== areas.areaB || cLePeriods[0].valid_from !== '2026-02-01' || cLePeriods[0].valid_to !== '2026-08-31') {
    throw new Error(`Labor Case E failed: expected 1 clamped period [2026-02-01, 2026-08-31], got ${JSON.stringify(cLePeriods)}`);
  }

  // Case Labor F: Inactive employee fallback stops at deactivated_at (2026-05-31), NOT NULL
  const cLfPeriods = (await client.query(
    "SELECT area_id, valid_from::text, valid_to::text, is_primary FROM employee_area_periods WHERE employee_profile_id = $1",
    [employees.cLfId]
  )).rows;
  if (cLfPeriods.length !== 1 || cLfPeriods[0].area_id !== areas.areaA || cLfPeriods[0].valid_from !== '2026-01-01' || cLfPeriods[0].valid_to !== '2026-05-31') {
    throw new Error(`Labor Case F failed: expected fallback ending at 2026-05-31, got ${JSON.stringify(cLfPeriods)}`);
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
      console.log(`[runner] Querying branches for project '${PROJECT_ID}' to resolve base branch...`);
      const branches = fetchNeonBranches({ projectId: PROJECT_ID, neonctlExec });
      const baseBranch = resolveNeonBaseBranch(branches, config.baseBranchId);
      console.log(`[runner] Resolved base branch '${baseBranch.name}' (${baseBranch.id})`);

      // Preflight 1: Base branch must be in clean legacy state
      console.log(`[runner] Preflight 1: Verifying base branch '${baseBranch.name}' (${baseBranch.id}) legacy state...`);
      const baseConnectionString =
        options.baseConnectionString ||
        neonctlExec(
          "npx",
          [
            "neonctl",
            "connection-string",
            baseBranch.id,
            "--project-id",
            PROJECT_ID,
            "--database-name",
            "neondb",
          ],
          { encoding: "utf-8" }
        ).trim();

      const baseClient = new ClientClass(baseConnectionString);
      await baseClient.connect();
      try {
        await assertNoTemporalObjectsPresent(baseClient, {
          context: `base branch '${baseBranch.name}' (${baseBranch.id})`,
        });
        console.log(`[runner] Preflight 1 PASSED: Base branch is free of temporal objects.`);
      } finally {
        await baseClient.end();
      }

      console.log(`[runner] Provisioning ephemeral Neon child branch from '${baseBranch.id}'...`);
      const created = createEphemeralBranch({
        projectId: PROJECT_ID,
        parentBranchId: baseBranch.id,
        neonctlExec,
      });

      branchId = created.branchId;
      connectionString = created.connectionString;
      console.log(`[runner] Ephemeral child branch '${created.branchName}' (${branchId}) created.`);

      // Accreditation before ANY connection, seed or migration
      console.log(`[runner] Accrediting ephemeral child branch '${branchId}' before connection...`);
      try {
        accreditBranchBeforeConnection({
          branchId,
          connectionString,
          baseBranchId: baseBranch.id,
          expectedEndpointId: options.expectedEndpointId || null,
          projectId: PROJECT_ID,
          neonctlExec,
          branches: options.accreditBranches || null,
          endpoints: options.accreditEndpoints || null,
        });
        console.log(`[runner] Accreditation PASSED for branch '${branchId}'.`);
      } catch (accreditErr) {
        console.error(`[runner] Accreditation FAILED for branch '${branchId}': ${accreditErr.message}`);
        try {
          deleteEphemeralBranch({ projectId: PROJECT_ID, branchId, neonctlExec });
          console.log(`[runner] Ephemeral branch '${branchId}' deleted after failed accreditation.`);
        } catch (delErr) {
          console.error(`[runner] Warning: failed to delete branch '${branchId}' after failed accreditation: ${delErr.message}`);
        }
        branchId = null;
        throw accreditErr;
      }
    } else {
      console.log("[runner] Using verified explicit TEMPORAL_MODEL_DATABASE_URL.");
    }

    // Step 1: Preflight 2 on target database & Seed legacy data
    console.log("[runner] Step 1: Connecting to target database...");
    const client = new ClientClass(connectionString);
    await client.connect();

    let seedData = null;
    let seedOrgId = null;

    try {
      console.log("[runner] Preflight 2: Verifying target database legacy state before seed...");
      await assertNoTemporalObjectsPresent(client, {
        context: `target database (branch: ${branchId || "existing"})`,
      });
      console.log("[runner] Preflight 2 PASSED: Target database has clean legacy baseline.");

      // Record baseline migrations if needed
      await client.query("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");

      const orgRes = await client.query(
        "INSERT INTO organizations (name, type) VALUES ('Temporal Backfill Verification Corp', 'company') RETURNING id"
      );
      seedOrgId = orgRes.rows[0].id;

      seedData = await seedCasesFn(client, { seedOrgId });
      console.log("[runner] Legacy scenarios seeded successfully.");
    } finally {
      await client.end();
    }

    // Step 2: Apply migrations
    console.log("[runner] Step 2: Applying migrations (0036, 0037)...");
    const migrateTarget = branchId || branchName || "ephemeral";
    const migrateResult = spawnSyncFn("node", ["db/migrate.mjs", `--target-branch=${migrateTarget}`], {
      env: { ...env, DATABASE_URL: connectionString, TARGET_BRANCH: migrateTarget },
      encoding: "utf-8",
    });
    if (migrateResult.status !== 0) {
      console.error(migrateResult.stdout);
      console.error(migrateResult.stderr);
      throw new Error(`Migration runner db/migrate.mjs failed with status ${migrateResult.status}`);
    }
    console.log("[runner] Migrations 0036 and 0037 applied successfully.");

    // Step 3: Verify post-migration objects and legacy backfill cases
    console.log("[runner] Step 3: Verifying post-migration objects and legacy backfill cases...");
    const verifyClient = new ClientClass(connectionString);
    await verifyClient.connect();
    try {
      await assertTemporalObjectsMaterialized(verifyClient, {
        context: `target database post-migration (branch: ${branchId || "existing"})`,
      });
      console.log("[runner] Post-migration objects materialized assertion PASSED.");

      await verifyBackfillFn(verifyClient, { seedOrgId, seedData });
      console.log("[runner] Backfill verification PASSED (all 5 cases + link guarantee confirmed).");
    } finally {
      await verifyClient.end();
    }

    // Step 4: Run PostgreSQL integration test suite
    console.log("[runner] Step 4: Running PostgreSQL integration test suite (Vitest)...");
    const reportFilePath = path.join(process.cwd(), `.vitest-temporal-report-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.json`);
    const testResult = spawnSyncFn(
      "npx",
      [
        "vitest",
        "run",
        "db/temporal-org-model.integration.test.mjs",
        "--reporter=default",
        "--reporter=json",
        `--outputFile=${reportFilePath}`,
      ],
      {
        env: {
          ...env,
          TEMPORAL_MODEL_DATABASE_URL: connectionString,
          TEMPORAL_RUNNER_BRANCH_ID: branchId || "",
          // Explicitly clear generic DB URLs
          DATABASE_URL: "",
          POSTGRES_URL: "",
        },
        stdio: "inherit",
      }
    );

    // Extract actual test results dynamically from vitest json report
    let reportParsedSuccessfully = false;
    try {
      if (fs.existsSync(reportFilePath)) {
        const rawReport = fs.readFileSync(reportFilePath, "utf-8");
        const parsedReport = JSON.parse(rawReport);
        passedCount = Number(parsedReport.numPassedTests) || 0;
        reportParsedSuccessfully = true;
      }
    } catch (parseErr) {
      console.warn(`[runner] Warning: Could not parse vitest JSON report: ${parseErr.message}`);
    } finally {
      if (fs.existsSync(reportFilePath)) {
        try {
          fs.unlinkSync(reportFilePath);
        } catch {
          // ignore cleanup error
        }
      }
    }

    if (testResult.status !== 0) {
      throw new Error(`Integration test suite failed with exit code ${testResult.status}`);
    }

    if (!reportParsedSuccessfully || passedCount <= 0) {
      throw new Error(
        `Integration test suite reported 0 passed tests or missing/unreadable JSON report (passed: ${passedCount})`
      );
    }

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
