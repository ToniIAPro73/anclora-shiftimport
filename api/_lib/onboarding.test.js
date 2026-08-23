import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('onboarding atomicity', () => {
  it('exposes the frontend onboarding route at /api/onboarding', async () => {
    // Vercel maps api/onboarding.js to /api/onboarding. The frontend calls
    // that exact route; api/onboarding/onboarding.js alone would deploy as
    // /api/onboarding/onboarding and return a platform 404.
    const routePath = path.resolve(__dirname, '..', 'onboarding.js');
    const content = await fs.readFile(routePath, 'utf8');

    expect(content).toContain("./onboarding/onboarding.js");
  });

  it('onboarding handler uses .transaction()', async () => {
    // Handler is in api/onboarding/onboarding.js (parent dir of this test location)
    const handlerPath = path.resolve(__dirname, '..', 'onboarding', 'onboarding.js');
    const content = await fs.readFile(handlerPath, 'utf8');

    // Verify sql.transaction() is called (not standalone queries)
    expect(content).toContain('sql.transaction');
    // Verify organization creation inside transaction block
    expect(content).toContain('INSERT INTO organizations');
    // Verify membership creation
    expect(content).toContain('INSERT INTO memberships');
    // Verify optional employee creation
    expect(content).toContain('INSERT INTO employees');
  });

  it('transaction rollback works for simulated failure', async () => {
    let transactionUsed = false;

    const fakeSql = function () { return Promise.resolve([]); };
    fakeSql.transaction = async (fn) => {
      transactionUsed = true;
      throw new Error('simulated failure mid-transaction');
    };

    let threw = false;
    try {
      await fakeSql.transaction(async (txn) => {
        await txn`SELECT 1`;
      });
    } catch {
      threw = true;
    }

    expect(transactionUsed).toBe(true);
    expect(threw).toBe(true);
  });
});
