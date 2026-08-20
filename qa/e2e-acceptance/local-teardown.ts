/* Removes every E2E fixture row created by local-setup.ts. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { FIXTURE_PATH } from './local-setup.js';

const here = __dirname;

function loadDatabaseUrl(): string {
  const envFile = readFileSync(join(here, '..', '..', '.env.development.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^DATABASE_URL=(.+)$/);
    if (match) {
      return match[1].trim().replace(/^"|"$/g, '');
    }
  }
  throw new Error('DATABASE_URL not found');
}

export default async function globalTeardown() {
  let fixture;
  try {
    fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  } catch {
    return;
  }
  const sql = neon(loadDatabaseUrl());
  // Deleting organizations cascades memberships/employees/shifts/imports.
  for (const org of [fixture.orgA, fixture.orgB, fixture.orgFresh]) {
    await sql`DELETE FROM organizations WHERE id = ${org}`;
  }
  await sql`DELETE FROM users WHERE email LIKE '%@e2e.test'`;
  console.log('[e2e] fixtures removed');
}
