/**
 * scripts/test-fresh-chain-0001-0038.mjs
 *
 * Verifies full migration chain (0001 to 0038) from scratch in a clean, empty database
 * created within an accredited, isolated Neon ephemeral child branch.
 *
 * Guarantees:
 * 1. ZERO writes or connections to Neon 'main'.
 * 2. Ephemeral branch created as child of 'preview/development'.
 * 3. Accreditation of branch identity and unpooled connection prior to execution.
 * 4. Empty database created (`CREATE DATABASE fresh_chain_test_0001_0038`).
 * 5. Full sequential run of 0001-0038 via runMigrations().
 * 6. Verification of 38 continuous ledger records matching real repository SHA-256 checksums.
 * 7. Schema catalog validation against expected baseline sentinels.
 * 8. Clean up: test database dropped and ephemeral branch destroyed (fail-closed).
 */

import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import fs from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { Client } from '@neondatabase/serverless';

if (!process.env.NEON_PROJECT_ID && fs.existsSync('.env.development.local')) {
  dotenv.config({ path: '.env.development.local' });
}
import {
  accreditDestinationBranch,
  runMigrations,
  inspectMigrationsStatus,
  extractSchemaCatalog,
  isMigrationMaterialized,
  computeMigrationChecksum,
  getNeonProjectId,
  MIGRATIONS_DIR,
} from '../db/migrate.mjs';

const BASE_BRANCH_ID = 'br-falling-heart-b1d6u2cx'; // preview/development
const FRESH_DB_NAME = 'fresh_chain_test_0001_0038';

function getRequiredProjectId() {
  const projectId = getNeonProjectId();
  if (!projectId) {
    throw new Error('NEON_PROJECT_ID environment variable is required.');
  }
  return projectId;
}

function createTestEphemeralBranch(projectId, parentBranchId) {
  const branchName = `tmp-chain-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  console.log(`[test] Creating ephemeral branch '${branchName}' from base '${parentBranchId}'...`);

  const raw = execFileSync(
    'npx',
    [
      'neonctl',
      'branches',
      'create',
      '--name',
      branchName,
      '--parent',
      parentBranchId,
      '--project-id',
      projectId,
      '--output',
      'json',
    ],
    { encoding: 'utf-8' }
  );

  const parsed = JSON.parse(raw);
  const branchId = parsed.branch?.id || parsed.id || (Array.isArray(parsed) ? parsed[0]?.id : null);
  if (!branchId) {
    throw new Error(`Failed to obtain branch ID from neonctl output: ${raw}`);
  }

  const connectionString = execFileSync(
    'npx',
    [
      'neonctl',
      'connection-string',
      branchId,
      '--project-id',
      projectId,
      '--database-name',
      'neondb',
    ],
    { encoding: 'utf-8' }
  ).trim();

  return { branchId, branchName, connectionString };
}

function deleteTestEphemeralBranch(projectId, branchId) {
  console.log(`[test] Deleting ephemeral branch '${branchId}'...`);
  try {
    execFileSync(
      'npx',
      ['neonctl', 'branches', 'delete', branchId, '--project-id', projectId],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    console.log(`[test] Ephemeral branch '${branchId}' successfully deleted.`);
  } catch (err) {
    const msg = `CRITICAL: Failed to delete ephemeral branch '${branchId}': ${err.message}. Residual branch requires manual cleanup.`;
    console.error(`[test] ${msg}`);
    throw new Error(msg);
  }
}

async function runFreshChainTest() {
  const projectId = getRequiredProjectId();
  let ephemeralInfo = null;
  let databaseCreated = false;

  try {
    // 1. Create ephemeral child branch
    ephemeralInfo = createTestEphemeralBranch(projectId, BASE_BRANCH_ID);
    const { branchId, branchName, connectionString } = ephemeralInfo;

    // 2. Accredit branch before connection
    console.log(`[test] Accrediting destination ephemeral branch '${branchName}' (${branchId})...`);
    accreditDestinationBranch(connectionString, {
      targetBranch: branchName,
      expectedBranchName: branchName,
      projectId,
      forWrite: true,
    });
    console.log(`[test] Branch accreditation PASS: verified endpoint host, non-pooler, not main.`);

    // 3. Connect to default neondb and create fresh empty database
    const adminClient = new Client(connectionString);
    await adminClient.connect();
    try {
      console.log(`[test] Creating clean empty database '${FRESH_DB_NAME}'...`);
      await adminClient.query(`CREATE DATABASE ${FRESH_DB_NAME};`);
      databaseCreated = true;
      console.log(`[test] Database '${FRESH_DB_NAME}' successfully created.`);
    } finally {
      await adminClient.end();
    }

    // 4. Construct fresh database connection URL
    const freshDbUrlObj = new URL(connectionString);
    freshDbUrlObj.pathname = `/${FRESH_DB_NAME}`;
    const freshDbUrl = freshDbUrlObj.toString();

    // 5. Apply full migration chain (0001 to 0038) from scratch via runMigrations() [Pass 1]
    console.log('[test] Running full migration chain 0001-0038 from scratch via runMigrations() [Pass 1]...');
    const result = await runMigrations({
      connectionString: freshDbUrl,
      targetBranch: branchName,
      projectId,
    });
    console.log(`[test] Successfully applied ${result.appliedCount} migrations from scratch (Pass 1).`);
    if (result.appliedCount !== 38) {
      throw new Error(`Expected exactly 38 applied migrations in Pass 1, got: ${result.appliedCount}`);
    }

    // 5b. Run 2nd pass via runMigrations() — must result in 0 applied, state UP_TO_DATE [Pass 2]
    console.log('[test] Running 2nd pass via runMigrations() [Pass 2]...');
    const resultPass2 = await runMigrations({
      connectionString: freshDbUrl,
      targetBranch: branchName,
      projectId,
    });
    console.log(`[test] Pass 2 result: ${resultPass2.appliedCount} applied, ${resultPass2.pendingCount} pending.`);
    if (resultPass2.appliedCount !== 0) {
      throw new Error(`Expected exactly 0 applied migrations in Pass 2, got: ${resultPass2.appliedCount}`);
    }

    // 6. Connect to fresh database and verify status, ledger, checksums, and catalog
    const verifyClient = new Client(freshDbUrl);
    await verifyClient.connect();
    try {
      // Verify inspectMigrationsStatus reports UP_TO_DATE
      const status = await inspectMigrationsStatus(verifyClient);
      console.log(`[test] Status report: state=${status.state}, totalApplied=${status.applied.length}`);
      if (status.state !== 'UP_TO_DATE' || status.applied.length !== 38 || status.pending.length !== 0) {
        throw new Error(
          `Expected state UP_TO_DATE with 38 applied, got: state=${status.state}, applied=${status.applied.length}`
        );
      }

      // Verify all 38 continuous ledger entries
      const rowsRes = await verifyClient.query('SELECT name, checksum FROM _migrations ORDER BY name');
      const rows = Array.isArray(rowsRes) ? rowsRes : rowsRes.rows || [];
      if (rows.length !== 38) {
        throw new Error(`Expected 38 rows in _migrations, found: ${rows.length}`);
      }

      const repoFiles = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
      if (repoFiles.length !== 38) {
        throw new Error(`Expected 38 repo migration files, found: ${repoFiles.length}`);
      }

      for (let i = 0; i < 38; i++) {
        const file = repoFiles[i];
        const row = rows[i];
        if (row.name !== file) {
          throw new Error(`Sequence gap/order mismatch at index ${i}: expected ${file}, found ${row.name}`);
        }
        const content = await readFile(join(MIGRATIONS_DIR, file));
        const expectedChecksum = computeMigrationChecksum(content);
        if (row.checksum !== expectedChecksum) {
          throw new Error(
            `SHA-256 checksum mismatch for '${file}': ledger has ${row.checksum}, repo file has ${expectedChecksum}`
          );
        }
      }
      console.log('[test] PASS: All 38 continuous ledger records match exact repository file checksums.');

      // Verify catalog baseline objects and sentinels
      const catalog = await extractSchemaCatalog(verifyClient);
      const expectedTables = [
        '_migrations',
        'organizations',
        'users',
        'memberships',
        'employees',
        'imports',
        'shifts',
        'sessions',
        'password_reset_tokens',
        'login_attempts',
        'areas',
        'format_profiles',
        'organization_audit_events',
        'schedules',
        'schedule_versions',
        'shift_assignments',
        'shift_comments',
        'change_requests',
        'notifications',
        'oauth_identities',
        'approval_requests',
        'operational_assignments',
        'organization_people',
        'person_role_periods',
        'person_access_scope_periods',
        'employee_profiles',
        'employee_area_periods',
        'area_responsibles',
        'reporting_relationship_periods',
      ];

      for (const table of expectedTables) {
        if (!catalog.tables.has(table)) {
          throw new Error(`Catalog validation failure: expected table '${table}' does not exist!`);
        }
      }
      console.log(`[test] PASS: All ${expectedTables.length} core baseline tables confirmed in schema catalog.`);

      // Verify sentinels for key milestones
      const sentinelsToVerify = [
        '0001_init.sql',
        '0006_employee_pending_access.sql',
        '0007_remove_manager_role.sql',
        '0013_membership_roles_owner.sql',
        '0031_approval_audit_event_types.sql',
        '0036_temporal_organizational_model.sql',
        '0037_temporal_ownership_transfer_and_labor_integrity.sql',
        '0038_migration_ledger_checksums.sql',
      ];
      for (const sentinelName of sentinelsToVerify) {
        if (!isMigrationMaterialized(sentinelName, catalog)) {
          throw new Error(`Sentinel verification failure: '${sentinelName}' objects not materialized!`);
        }
      }
      console.log(`[test] PASS: Key migration sentinels verified in schema catalog.`);
    } finally {
      await verifyClient.end();
    }

    // 7. Clean up test database
    if (databaseCreated) {
      const dropClient = new Client(connectionString);
      await dropClient.connect();
      try {
        console.log(`[test] Dropping test database '${FRESH_DB_NAME}'...`);
        await dropClient.query(`DROP DATABASE IF EXISTS ${FRESH_DB_NAME} WITH (FORCE);`);
        console.log(`[test] Database '${FRESH_DB_NAME}' dropped successfully.`);
      } finally {
        await dropClient.end();
      }
    }

    console.log('\n======================================================');
    console.log('ALL FRESH CHAIN 0001-0038 MIGRATION TESTS PASSED!');
    console.log('======================================================\n');
  } finally {
    if (ephemeralInfo) {
      deleteTestEphemeralBranch(projectId, ephemeralInfo.branchId);
    }
  }
}

runFreshChainTest().catch((err) => {
  console.error('[test] FATAL:', err);
  process.exit(1);
});
