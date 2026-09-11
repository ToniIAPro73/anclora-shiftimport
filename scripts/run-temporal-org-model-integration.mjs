#!/usr/bin/env node
/**
 * Reproducible integration test runner for Temporal Organizational Model (Phase 1).
 *
 * Capabilities:
 * 1. Automatically provisions an ephemeral Neon child branch from preview/development.
 * 2. Seeds legacy schema & data to verify pre-migration compatibility (0035 state).
 * 3. Applies migration 0036_temporal_organizational_model.sql via db/migrate.mjs.
 * 4. Verifies real backfill (unlinked employees -> PENDING_INVITATION, priority 1 & 2 area assignments,
 *    area_responsibles -> person_access_scope_periods).
 * 5. Runs the full 20-scenario PostgreSQL integration test suite (db/temporal-org-model.integration.test.mjs).
 * 6. Always destroys the ephemeral Neon branch in the finally block.
 *
 * Usage:
 *   node scripts/run-temporal-org-model-integration.mjs
 *   TEMPORAL_MODEL_DATABASE_URL="postgres://..." node scripts/run-temporal-org-model-integration.mjs
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { Client } from '@neondatabase/serverless';

const PROJECT_ID = process.env.NEON_PROJECT_ID || 'holy-cake-85660318';
const PARENT_BRANCH = process.env.NEON_PARENT_BRANCH || 'br-falling-heart-b1d6u2cx'; // preview/development

async function main() {
  let branchId = null;
  let connectionString = process.env.TEMPORAL_MODEL_DATABASE_URL || process.env.DATABASE_URL;

  const isEphemeral = !connectionString;

  try {
    if (isEphemeral) {
      const timestamp = Date.now();
      const branchName = `tmp-temporal-model-${timestamp}`;
      console.log(`[runner] Provisioning ephemeral Neon branch '${branchName}' from ${PARENT_BRANCH}...`);

      const raw = execFileSync(
        'npx',
        [
          'neonctl',
          'branches',
          'create',
          '--name', branchName,
          '--parent', PARENT_BRANCH,
          '--project-id', PROJECT_ID,
          '--output', 'json',
        ],
        { encoding: 'utf-8' }
      );

      const parsed = JSON.parse(raw);
      branchId = parsed.branch?.id || parsed.id || (Array.isArray(parsed) ? parsed[0]?.id : null);
      if (!branchId) {
        throw new Error(`Failed to extract branch ID from neonctl output: ${raw}`);
      }
      console.log(`[runner] Ephemeral branch created: ${branchId}`);

      if (parsed.connection_uris?.[0]?.connection_uri) {
        connectionString = parsed.connection_uris[0].connection_uri;
      } else {
        connectionString = execFileSync(
          'npx',
          [
            'neonctl',
            'connection-string',
            branchId,
            '--project-id', PROJECT_ID,
            '--database-name', 'neondb',
          ],
          { encoding: 'utf-8' }
        ).trim();
      }
      console.log(`[runner] Acquired endpoint for ephemeral branch.`);
    } else {
      console.log('[runner] Using provided database connection string (non-ephemeral mode).');
    }

    const client = new Client(connectionString);
    await client.connect();

    try {
      // -------------------------------------------------------------
      // Step 1: Validate pre-migration state & seed legacy test data
      // -------------------------------------------------------------
      console.log('[runner] Step 1: Validating pre-migration state & seeding legacy data...');
      
      const preMig = await client.query("SELECT name FROM _migrations WHERE name = '0036_temporal_organizational_model.sql'");
      if (preMig.rows.length > 0) {
        throw new Error('Pre-migration assertion failed: 0036_temporal_organizational_model.sql is already applied on this branch.');
      }

      // Generate seed UUIDs
      const seedOrgId = (await client.query("INSERT INTO organizations (name, type) VALUES ('Backfill Verification Corp', 'company') RETURNING id")).rows[0].id;
      const seedOwnerUser = (await client.query("INSERT INTO users (email, display_name, password_hash) VALUES ('seed_owner@test.com', 'Seed Owner', 'hash') RETURNING id")).rows[0].id;
      const seedAdminUser = (await client.query("INSERT INTO users (email, display_name, password_hash) VALUES ('seed_admin@test.com', 'Seed Admin', 'hash') RETURNING id")).rows[0].id;
      const seedPlannerUser = (await client.query("INSERT INTO users (email, display_name, password_hash) VALUES ('seed_planner@test.com', 'Seed Planner', 'hash') RETURNING id")).rows[0].id;
      const seedEmpUser = (await client.query("INSERT INTO users (email, display_name, password_hash) VALUES ('seed_emp@test.com', 'Seed Emp User', 'hash') RETURNING id")).rows[0].id;

      const seedArea1 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Seed Area Rampa') RETURNING id", [seedOrgId])).rows[0].id;
      const seedArea2 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Seed Area Pasaje') RETURNING id", [seedOrgId])).rows[0].id;

      // Legacy memberships
      await client.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'OWNER')", [seedOrgId, seedOwnerUser]);
      await client.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'ADMIN')", [seedOrgId, seedAdminUser]);
      await client.query("INSERT INTO memberships (organization_id, user_id, role, planner_scope_type, scoped_area_id) VALUES ($1, $2, 'PLANNER', 'AREAS', $3)", [seedOrgId, seedPlannerUser, seedArea1]);

      // Legacy employees: one linked with user_id, one unlinked (user_id IS NULL)
      const seedEmpLinked = (await client.query(`
        INSERT INTO employees (organization_id, name, user_id, area_id, status)
        VALUES ($1, 'Linked Employee Seed', $2, $3, 'active') RETURNING id
      `, [seedOrgId, seedEmpUser, seedArea1])).rows[0].id;

      const seedEmpUnlinked = (await client.query(`
        INSERT INTO employees (organization_id, name, user_id, area_id, status)
        VALUES ($1, 'Unlinked Employee Seed', NULL, $2, 'active') RETURNING id
      `, [seedOrgId, seedArea2])).rows[0].id;

      // Legacy operational_assignments (Priority 1 for area assignment)
      await client.query(`
        INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to)
        VALUES ($1, 'EMPLOYEE_AREA', $2, $3, '2026-02-01', NULL)
      `, [seedOrgId, seedEmpLinked, seedArea2]);

      await client.query(`
        INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to)
        VALUES ($1, 'PLANNER_AREA', $2, $3, '2026-02-01', NULL)
      `, [seedOrgId, seedPlannerUser, seedArea2]);

      await client.query(`
        INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to)
        VALUES ($1, 'PLANNER_EMPLOYEE', $2, $3, '2026-02-01', NULL)
      `, [seedOrgId, seedPlannerUser, seedEmpLinked]);

      // Legacy area_responsibles
      await client.query(`
        INSERT INTO area_responsibles (organization_id, area_id, user_id)
        VALUES ($1, $2, $3)
      `, [seedOrgId, seedArea1, seedAdminUser]);

      console.log('[runner] Legacy seed data committed successfully.');

      // -------------------------------------------------------------
      // Step 2: Apply migration 0036
      // -------------------------------------------------------------
      console.log('[runner] Step 2: Running migration 0036 against ephemeral branch...');
      const migrateResult = spawnSync('node', ['db/migrate.mjs'], {
        env: { ...process.env, DATABASE_URL: connectionString },
        encoding: 'utf-8',
      });

      if (migrateResult.status !== 0) {
        console.error(migrateResult.stdout);
        console.error(migrateResult.stderr);
        throw new Error(`Migration runner failed with status ${migrateResult.status}`);
      }
      console.log('[runner] Migration 0036 applied successfully.');

      // -------------------------------------------------------------
      // Step 3: Verify backfill against seeded legacy records
      // -------------------------------------------------------------
      console.log('[runner] Step 3: Verifying deterministic backfill assertions...');

      // 1. Unlinked employee must have status = PENDING_INVITATION
      const unlinkedPerson = await client.query(`
        SELECT op.id, op.status, ep.id as profile_id
        FROM organization_people op
        JOIN employee_profiles ep ON ep.organization_person_id = op.id
        WHERE op.organization_id = $1 AND ep.id = $2;
      `, [seedOrgId, seedEmpUnlinked]);
      if (unlinkedPerson.rows.length === 0 || unlinkedPerson.rows[0].status !== 'PENDING_INVITATION') {
        throw new Error(`Backfill assertion failed: Unlinked employee must be in PENDING_INVITATION status. Found: ${JSON.stringify(unlinkedPerson.rows)}`);
      }

      // 2. Linked employee must have active profile
      const linkedPerson = await client.query(`
        SELECT op.id, op.status, ep.id as profile_id
        FROM organization_people op
        JOIN employee_profiles ep ON ep.organization_person_id = op.id
        WHERE op.organization_id = $1 AND ep.id = $2;
      `, [seedOrgId, seedEmpLinked]);
      if (linkedPerson.rows.length === 0 || linkedPerson.rows[0].status !== 'ACTIVE') {
        throw new Error(`Backfill assertion failed: Linked employee must be ACTIVE. Found: ${JSON.stringify(linkedPerson.rows)}`);
      }

      // 3. Area precedence: operational_assignments (Priority 1) vs employees.area_id fallback (Priority 2)
      const linkedEmpAreas = await client.query(`
        SELECT area_id, is_primary, source FROM employee_area_periods
        WHERE organization_id = $1 AND employee_profile_id = $2;
      `, [seedOrgId, seedEmpLinked]);
      const hasPriority1Assignment = linkedEmpAreas.rows.some(r => r.area_id === seedArea2 && r.source === 'LEGACY_OPERATIONAL_ASSIGNMENT' && r.is_primary);
      if (!hasPriority1Assignment) {
        throw new Error(`Backfill assertion failed: Priority 1 assignment from operational_assignments missing for linked employee. Found: ${JSON.stringify(linkedEmpAreas.rows)}`);
      }

      const unlinkedEmpAreas = await client.query(`
        SELECT area_id, is_primary, source FROM employee_area_periods
        WHERE organization_id = $1 AND employee_profile_id = $2;
      `, [seedOrgId, seedEmpUnlinked]);
      const hasPriority2Fallback = unlinkedEmpAreas.rows.some(r => r.area_id === seedArea2 && r.source === 'LEGACY_EMPLOYEE_AREA_FALLBACK' && r.is_primary);
      if (!hasPriority2Fallback) {
        throw new Error(`Backfill assertion failed: Priority 2 fallback missing for unlinked employee. Found: ${JSON.stringify(unlinkedEmpAreas.rows)}`);
      }

      // 4. Area responsibles backfill
      const adminScopes = await client.query(`
        SELECT scope_type, area_id, source
        FROM person_access_scope_periods pasp
        JOIN organization_people op ON op.id = pasp.organization_person_id
        WHERE pasp.organization_id = $1 AND op.user_id = $2;
      `, [seedOrgId, seedAdminUser]);
      const hasAreaResponsible = adminScopes.rows.some(r => r.scope_type === 'AREA' && r.area_id === seedArea1 && r.source === 'LEGACY_AREA_RESPONSIBLE');
      if (!hasAreaResponsible) {
        throw new Error(`Backfill assertion failed: Access scope from area_responsibles missing. Found: ${JSON.stringify(adminScopes.rows)}`);
      }

      console.log('[runner] All backfill invariants verified successfully.');
    } finally {
      await client.end();
    }

    // -------------------------------------------------------------
    // Step 4: Run PostgreSQL 20-scenario integration test suite
    // -------------------------------------------------------------
    console.log('[runner] Step 4: Running full 20-scenario PostgreSQL integration test suite...');
    const testResult = spawnSync('npx', ['vitest', 'run', 'db/temporal-org-model.integration.test.mjs'], {
      env: {
        ...process.env,
        TEMPORAL_MODEL_DATABASE_URL: connectionString,
      },
      stdio: 'inherit',
    });

    if (testResult.status !== 0) {
      throw new Error(`Integration test suite failed with exit code ${testResult.status}`);
    }

    console.log('[runner] All integration tests PASSED.');
  } finally {
    // -------------------------------------------------------------
    // Step 5: Tear down ephemeral branch
    // -------------------------------------------------------------
    if (isEphemeral && branchId) {
      console.log(`[runner] Cleaning up ephemeral branch ${branchId}...`);
      try {
        execFileSync(
          'npx',
          ['neonctl', 'branches', 'delete', branchId, '--project-id', PROJECT_ID],
          { encoding: 'utf-8' }
        );
        console.log(`[runner] Ephemeral branch ${branchId} deleted successfully.`);
      } catch (cleanupErr) {
        console.error(`[runner] Warning: Failed to delete ephemeral branch ${branchId}:`, cleanupErr.message);
      }
    }
  }
}

main().catch((err) => {
  console.error('[runner] Integration test run FAILED:', err.message);
  process.exit(1);
});
