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
 * 4. DDL + intentional ledger failure rolls back completely (probe table absent, ledger absent).
 * 5. Migration 0038 applies atomically with ledger checksums backfilled and NOT NULL.
 * 6. Branch is destroyed in finally; deletion failure is fail-closed with residual branchId logged.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';
import { Client } from '@neondatabase/serverless';

if (!process.env.NEON_PROJECT_ID && fs.existsSync('.env.development.local')) {
  dotenv.config({ path: '.env.development.local' });
}
import {
  accreditDestinationBranch,
  runMigrations,
  inspectMigrationsStatus,
  getNeonProjectId,
  MIGRATIONS_DIR,
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
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    console.log(`[test] Ephemeral branch '${branchId}' successfully deleted.`);
  } catch (err) {
    const msg = `CRITICAL: Failed to delete ephemeral branch '${branchId}': ${err.message}. Residual branch requires manual cleanup.`;
    console.error(`[test] ${msg}`);
    throw new Error(msg);
  }
}

async function runRealAtomicityTest() {
  const projectId = getRequiredProjectId();
  let ephemeralInfo = null;
  let tmpMigrationsDir = null;

  try {
    // 1. Create ephemeral child branch of preview/development
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

    // 3. Inspect existing applied migrations on the ephemeral branch
    const prepClient = new Client(connectionString);
    await prepClient.connect();
    let appliedNames = [];
    try {
      const res = await prepClient.query('SELECT name FROM _migrations ORDER BY name');
      appliedNames = (Array.isArray(res) ? res : res.rows || []).map((r) => r.name);
      console.log(`[test] Ephemeral branch currently has ${appliedNames.length} applied migrations.`);
    } finally {
      await prepClient.end();
    }

    // 4. Create temporary migrations directory containing applied migrations + probe migration
    tmpMigrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomicity-probe-'));
    const realFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of realFiles) {
      if (appliedNames.includes(file)) {
        fs.copyFileSync(path.join(MIGRATIONS_DIR, file), path.join(tmpMigrationsDir, file));
      }
    }

    // Determine next sequential migration file name
    const nextSeq = String(appliedNames.length + 1).padStart(4, '0');
    const probeFileName = `${nextSeq}_atomicity_runner_probe.sql`;
    fs.writeFileSync(
      path.join(tmpMigrationsDir, probeFileName),
      'CREATE TABLE _atomicity_runner_probe (id int primary key, marker text);\n'
    );
    console.log(`[test] Created probe migration in tmp dir: ${probeFileName}`);

    // 5. Install temporary trigger on _migrations that fails on INSERT
    const triggerClient = new Client(connectionString);
    await triggerClient.connect();
    try {
      console.log('[test] Installing temporary trigger trg_test_fail_insert on _migrations...');
      await triggerClient.query(`
        CREATE OR REPLACE FUNCTION trg_fail_on_ledger_insert() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'Simulated failure during ledger insertion for atomicity verification';
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_test_fail_insert ON _migrations;
        CREATE TRIGGER trg_test_fail_insert
        BEFORE INSERT ON _migrations
        FOR EACH ROW
        EXECUTE FUNCTION trg_fail_on_ledger_insert();
      `);
    } finally {
      await triggerClient.end();
    }

    // 6. Invoke runMigrations() with probe directory — must fail and roll back completely
    console.log('[test] Invoking runMigrations() against temporary probe directory...');
    let errorCaught = null;
    try {
      await runMigrations({
        connectionString,
        targetBranch: branchName,
        projectId,
        migrationsDir: tmpMigrationsDir,
      });
    } catch (err) {
      errorCaught = err;
      console.log(`[test] Expected failure caught: ${err.message}`);
    }

    if (!errorCaught || !errorCaught.message.includes('Simulated failure during ledger insertion')) {
      throw new Error(
        `ATOMICITY FAILURE: Expected simulated ledger failure was not thrown! Got: ${errorCaught?.message}`
      );
    }

    // 7. Verify rollback: table absent, ledger entry absent, connection operative
    const verifyClient = new Client(connectionString);
    await verifyClient.connect();
    try {
      const probeRes = await verifyClient.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_atomicity_runner_probe'"
      );
      const probeExists = (Array.isArray(probeRes) ? probeRes : probeRes.rows || []).length > 0;
      if (probeExists) {
        throw new Error('ATOMICITY FAILURE: _atomicity_runner_probe table exists after transaction rollback!');
      }
      console.log('[test] PASS: Table _atomicity_runner_probe absent after rollback.');

      const ledgerRes = await verifyClient.query('SELECT 1 FROM _migrations WHERE name = $1', [probeFileName]);
      const ledgerExists = (Array.isArray(ledgerRes) ? ledgerRes : ledgerRes.rows || []).length > 0;
      if (ledgerExists) {
        throw new Error(`ATOMICITY FAILURE: ${probeFileName} recorded in _migrations after rollback!`);
      }
      console.log(`[test] PASS: ${probeFileName} absent from _migrations after rollback.`);

      // Verify connection and transaction state
      const pingRes = await verifyClient.query('SELECT 1 AS alive');
      const isAlive = (Array.isArray(pingRes) ? pingRes : pingRes.rows || [])[0]?.alive === 1;
      if (!isAlive) {
        throw new Error('ATOMICITY FAILURE: client connection unusable or transaction unclosed');
      }
      console.log('[test] PASS: Connection is healthy and transaction is closed.');

      // 8. Uninstall temporary trigger
      console.log('[test] Uninstalling temporary trigger...');
      await verifyClient.query('DROP TRIGGER IF EXISTS trg_test_fail_insert ON _migrations');
      await verifyClient.query('DROP FUNCTION IF EXISTS trg_fail_on_ledger_insert()');
    } finally {
      await verifyClient.end();
    }

    // 9. Execute real migrations up to 0038 using real repository migrations directory
    console.log('[test] Applying real migrations (including 0038) on ephemeral branch...');
    const runResult = await runMigrations({
      connectionString,
      targetBranch: branchName,
      projectId,
      migrationsDir: MIGRATIONS_DIR,
    });
    console.log(`[test] Applied ${runResult.appliedCount} real migrations.`);

    // 10. Verify post-migration status and 0038 checksum column
    const finalClient = new Client(connectionString);
    await finalClient.connect();
    try {
      const status = await inspectMigrationsStatus(finalClient);
      console.log(`[test] Final migration status: state=${status.state}, pending=${status.pending.length}`);
      if (status.state !== 'UP_TO_DATE' || status.pending.length !== 0) {
        throw new Error(`Expected UP_TO_DATE status, got: ${status.state}`);
      }

      const colRes = await finalClient.query(`
        SELECT column_name, is_nullable, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = '_migrations' AND column_name = 'checksum'
      `);
      const colRows = Array.isArray(colRes) ? colRes : colRes.rows || [];
      if (colRows.length === 0 || colRows[0].is_nullable !== 'NO') {
        throw new Error('CHECKSUM VALIDATION FAILURE: _migrations.checksum does not exist or is nullable');
      }
      console.log('[test] PASS: _migrations.checksum column exists and is NOT NULL.');

      const countRes = await finalClient.query('SELECT count(*)::int AS count FROM _migrations');
      const count = (Array.isArray(countRes) ? countRes : countRes.rows || [])[0]?.count;
      if (count !== 38) {
        throw new Error(`Expected 38 migrations in ledger, found: ${count}`);
      }
      console.log(`[test] PASS: Ledger contains exactly 38 applied migrations with verified checksums.`);
    } finally {
      await finalClient.end();
    }

    console.log('\n======================================================');
    console.log('ALL REAL EPHEMERAL ATOMICITY & MIGRATION TESTS PASSED!');
    console.log('======================================================\n');
  } finally {
    if (tmpMigrationsDir && fs.existsSync(tmpMigrationsDir)) {
      try {
        fs.rmSync(tmpMigrationsDir, { recursive: true, force: true });
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
