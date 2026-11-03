/* F4 mobile E2E teardown: removes ONLY the tenant/users recorded by this run's f4-mobile-setup.ts and verifies zero residue. */
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { F4_FIXTURE_PATH } from './f4-mobile-setup';
import { qaLib } from './helpers/qa-mirror';

export default async function globalTeardown() {
  // No fixture of THIS run => nothing to delete (an older run's file is never trusted: setup rewrites it each time).
  if (!existsSync(F4_FIXTURE_PATH)) return;
  const fx = JSON.parse(readFileSync(F4_FIXTURE_PATH, 'utf8'));
  const lib = await qaLib();
  const db = await lib.connect();
  try {
    const marker = `%E2E-SHIFT-${fx.runId}%`;
    const emailSuffix = `%-${String(fx.runId).toLowerCase()}@e2e.test`;
    // Identity check before deleting: the tenant must carry this run's marker and the users this run's e-mail suffix.
    const org = (await db.query('SELECT name FROM organizations WHERE id = $1', [fx.orgA])).rows[0];
    if (org && !org.name.includes(`E2E-SHIFT-${fx.runId}`)) throw new Error("teardown refused: organization is not this run's synthetic tenant");
    await db.query('DELETE FROM organizations WHERE id = $1 AND name LIKE $2', [fx.orgA, marker]);
    await db.query('DELETE FROM users WHERE id = ANY($1::uuid[]) AND email LIKE $2', [fx.userIds, emailSuffix]);
    const left = (await db.query(
      `SELECT (SELECT count(*)::int FROM organizations WHERE name LIKE $1) AS organizations,
              (SELECT count(*)::int FROM users WHERE email LIKE $2) AS users`,
      [marker, emailSuffix])).rows[0];
    if (left.organizations !== 0 || left.users !== 0) throw new Error(`F4 mobile teardown left residue: ${JSON.stringify(left)}`);
    console.log(`[f4-mobile] fixtures removed; runId=${fx.runId}; residuals=0`);
  } finally {
    await db.end();
  }
  unlinkSync(F4_FIXTURE_PATH);
}
