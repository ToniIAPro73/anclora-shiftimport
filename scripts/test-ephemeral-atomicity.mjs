/**
 * scripts/test-ephemeral-atomicity.mjs
 *
 * Verifies real database transaction atomicity, rollback, and migration 0038
 * in an accredited, isolated Neon ephemeral child branch.
 *
 * Guarantees:
 * 1. ZERO writes or connections to Neon 'main'.
 * 2. Ephemeral branch created as child of 'preview/development'.
 * 3. Accreditation of branch identity and unpooled connection prior to execution.
 * 4. DDL + intentional ledger failure rolls back completely (table absent, ledger absent).
 * 5. Migration 0038 applies atomically with ledger checksums backfilled and NOT NULL.
 * 6. Branch is unconditionally destroyed in finally.
 */

import { execFileSync } from 'node:child_process';
import { Client } from '@neondatabase/serverless';
import {
  accreditDestinationBranch,
  runMigrations,
  inspectMigrationsStatus,
  getNeonProjectId,
} from '../db/migrate.mjs';

const BASE_BRANCH_ID = 'br-falling-heart-b1d6u2cx'; // preview/development

function getRequiredProjectId() {
  const projectId = getNeonProjectId();
  if (!projectId) {
    throw new Error('NEON_PROJECT_ID environment variable is required.');
  }
  return projectId;
}

function createTestEphemeralBranch(projectId, parentBranchId) {
  const branchName = `tmp-atomicity-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
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
      { encoding: 'utf-8' }
    );
    console.log(`[test] Ephemeral branch '${branchId}' successfully deleted.`);
  } catch (err) {
    console.error(`[test] ERROR deleting ephemeral branch '${branchId}':`, err.message);
  }
}

async function runRealAtomicityTest() {
  const projectId = getRequiredProjectId();
  let ephemeralInfo = null;
  let client = null;

  try {
    // 1. Create ephemeral child branch
    ephemeralInfo = createTestEphemeralBranch(projectId, BASE_BRANCH_ID);
    const { branchId, branchName, connectionString } = ephemeralInfo;

    // 2. Accredit branch before connection
    console.log(`[test] Accrediting destination ephemeral branch '${branchName}' (${branchId})...`);
    const accreditation = accreditDestinationBranch({
      connectionString,
      targetBranch: branchName,
      expectedBranchName: branchName,
      projectId,
      forWrite: true,
    });
    console.log(`[test] Branch accreditation PASS: verified endpoint host, non-pooler, not main.`);

    // 3. Connect directly via Client
    client = new Client(connectionString);
    await client.connect();

    // 4. Test atomic rollback: DDL + deliberate failure inside single transaction
    console.log('[test] Starting atomic rollback test (DDL + failing ledger insertion)...');
    await client.query('BEGIN');
    let deliberateErrorCaught = false;

    try {
      await client.query('CREATE TABLE _atomicity_test_probe (id int primary key, marker text);');
      // Deliberately trigger failure on ledger insertion (referencing a non-existent column)
      await client.query('INSERT INTO _migrations (name, non_existent_column) VALUES ($1, $2);', ['test_file', 'fail']);
      await client.query('COMMIT');
    } catch (err) {
      deliberateErrorCaught = true;
      console.log(`[test] Deliberate error successfully caught: ${err.message}`);
      await client.query('ROLLBACK');
    }

    if (!deliberateErrorCaught) {
      throw new Error('ATOMICITY FAILURE: expected deliberate error was not thrown!');
    }

    // Verify that table _atomicity_test_probe was rolled back completely
    const probeRes = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_atomicity_test_probe'"
    );
    const probeExists = (Array.isArray(probeRes) ? probeRes : probeRes.rows || []).length > 0;
    if (probeExists) {
      throw new Error('ATOMICITY FAILURE: _atomicity_test_probe exists after transaction rollback!');
    }
    console.log('[test] PASS: Table _atomicity_test_probe absent after rollback.');

    // Verify that ledger was unaffected
    const ledgerRes = await client.query(
      "SELECT 1 FROM _migrations WHERE name = 'test_file'"
    );
    const ledgerExists = (Array.isArray(ledgerRes) ? ledgerRes : ledgerRes.rows || []).length > 0;
    if (ledgerExists) {
      throw new Error('ATOMICITY FAILURE: test_file recorded in _migrations after rollback!');
    }
    console.log('[test] PASS: _migrations unaffected by rolled-back transaction.');

    // 5. Test real migration run on ephemeral branch: apply pending migrations up to 0038
    console.log('[test] Testing full migration application (including 0038) on ephemeral branch...');
    const migrationRes = await runMigrations(client, {
      accreditation,
      connectionString,
      targetBranch: branchName,
    });
    console.log(`[test] Applied ${migrationRes.appliedCount} pending migrations successfully.`);

    // 6. Verify 0038 materialized objects & ledger checksums
    const status = await inspectMigrationsStatus(client);
    console.log(`[test] Post-migration status: state=${status.state}, pending=${status.pending.length}`);
    if (status.state !== 'UP_TO_DATE' || status.pending.length !== 0) {
      throw new Error(`Expected UP_TO_DATE status after migrations, got: ${status.state}`);
    }

    // Verify checksum column is present and NOT NULL
    const colRes = await client.query(`
      SELECT column_name, is_nullable, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = '_migrations' AND column_name = 'checksum'
    `);
    const colRows = Array.isArray(colRes) ? colRes : colRes.rows || [];
    if (colRows.length === 0) {
      throw new Error('CHECKSUM VALIDATION FAILURE: _migrations.checksum column does not exist!');
    }
    if (colRows[0].is_nullable !== 'NO') {
      throw new Error(`CHECKSUM VALIDATION FAILURE: _migrations.checksum is_nullable is '${colRows[0].is_nullable}', expected 'NO'!`);
    }
    console.log('[test] PASS: _migrations.checksum exists and is NOT NULL.');

    // Verify that all 38 migrations in ledger have valid 64-char hex checksums
    const allMigsRes = await client.query('SELECT name, checksum FROM _migrations ORDER BY name');
    const allMigs = Array.isArray(allMigsRes) ? allMigsRes : allMigsRes.rows || [];
    if (allMigs.length !== 38) {
      throw new Error(`Expected 38 migrations in ledger, found ${allMigs.length}`);
    }

    const hex64 = /^[0-9a-f]{64}$/;
    for (const m of allMigs) {
      if (!m.checksum || !hex64.test(m.checksum)) {
        throw new Error(`Invalid checksum in ledger for '${m.name}': '${m.checksum}'`);
      }
    }
    console.log(`[test] PASS: All 38 migrations in ledger have verified 64-character SHA-256 checksums.`);

    console.log('\n======================================================');
    console.log('ALL REAL EPHEMERAL ATOMICITY & MIGRATION TESTS PASSED!');
    console.log('======================================================\n');
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {}
    }
    if (ephemeralInfo) {
      deleteTestEphemeralBranch(projectId, ephemeralInfo.branchId);
    }
  }
}

runRealAtomicityTest().catch((err) => {
  console.error('[test] FATAL:', err);
  process.exit(1);
});
