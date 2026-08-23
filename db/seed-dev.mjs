// Dev-only synthetic employee seeder. Idempotent upsert of the 40-employee
// reference dataset into an EXISTING organization, as Employees only
// (never Users/memberships/sessions). Development-only by explicit guard —
// see assertNonProduction().
//
// Usage:
//   node --env-file=.env.development.local db/seed-dev.mjs --organization-id <id>
//   node --env-file=.env.development.local db/seed-dev.mjs --organization-id <id> --dry-run
//   npm run seed:dev -- --organization-id <id> [--dry-run]
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATASET_PATH = join(ROOT, 'test-data/fixtures/parser-regression/02_team_preloaded_40_employees.json');
export const EXPECTED_EMPLOYEE_COUNT = 40;

export class SeedAbortError extends Error {}

function abort(message) {
  throw new SeedAbortError(message);
}

export function parseArgs(argv) {
  const args = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--organization-id') {
      args.organizationId = argv[index += 1];
    } else if (arg === '--organization-name') {
      args.organizationName = argv[index += 1];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }
  return args;
}

/**
 * Refuses to run against Production. VERCEL_ENV, when present, is a signal
 * set by the platform itself (trustworthy). Otherwise — a plain local
 * invocation — nothing about "running from a dev machine" is trusted; an
 * explicit SEED_ALLOW_ENV=development opt-in is required, or this aborts.
 */
export function assertNonProduction(env = process.env) {
  if (env.VERCEL_ENV === 'production') {
    abort('Refusing to seed non-development database.');
  }
  if (String(env.NODE_ENV ?? '').toLowerCase() === 'production') {
    abort('Refusing to seed non-development database.');
  }
  if (env.VERCEL_ENV === 'development') {
    return;
  }
  if (env.SEED_ALLOW_ENV !== 'development') {
    abort(
      'Cannot confirm this is a Development database (no VERCEL_ENV=development from the platform, '
      + 'and no explicit SEED_ALLOW_ENV=development opt-in). Aborting rather than guessing.',
    );
  }
}

/** Validates the dataset shape/content. Never touches the DB. */
export function validateDataset(parsed) {
  const employees = parsed?.employees;
  if (!Array.isArray(employees) || employees.length !== EXPECTED_EMPLOYEE_COUNT) {
    abort(
      `Dataset must contain exactly ${EXPECTED_EMPLOYEE_COUNT} employees `
      + `(found ${Array.isArray(employees) ? employees.length : 'none'}).`,
    );
  }

  const seenIds = new Set();
  for (const employee of employees) {
    const externalId = String(employee?.external_employee_id ?? '').trim();
    const label = employee?.full_name ?? externalId ?? '?';
    if (!externalId) {
      abort(`Employee "${label}" is missing external_employee_id.`);
    }
    if (seenIds.has(externalId)) {
      abort(`Duplicate external_employee_id in dataset: ${externalId}`);
    }
    seenIds.add(externalId);

    if (/password|secret|token|api[_-]?key/i.test(JSON.stringify(employee))) {
      abort(`Employee ${externalId} has a suspicious credential-like field — refusing to seed.`);
    }
    const email = String(employee?.email_synthetic ?? '');
    if (email && !email.toLowerCase().endsWith('@example.invalid')) {
      abort(`Employee ${externalId} has a non-synthetic-looking email (${email}) — refusing to seed.`);
    }
  }

  return employees;
}

export async function loadDataset(path = DATASET_PATH) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    abort(`Dataset not found at ${path}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    abort('Dataset is not valid JSON.');
  }
  return validateDataset(parsed);
}

/** Resolves the target organization. Never falls back to "the first one". */
export async function resolveOrganization(sql, args) {
  if (args.organizationId) {
    const rows = await sql`SELECT id, name, type FROM organizations WHERE id = ${args.organizationId}`;
    if (rows.length === 0) {
      abort(`No organization found with id ${args.organizationId}`);
    }
    return rows[0];
  }
  if (args.organizationName) {
    const rows = await sql`SELECT id, name, type FROM organizations WHERE name = ${args.organizationName}`;
    if (rows.length === 0) {
      abort(`No organization found with name "${args.organizationName}"`);
    }
    if (rows.length > 1) {
      abort(`Organization name "${args.organizationName}" is ambiguous (${rows.length} matches). Use --organization-id instead.`);
    }
    return rows[0];
  }
  abort('No organization specified. Pass --organization-id <id> (preferred) or --organization-name <exact name>.');
  return undefined;
}

const normalizeStatus = (raw) => (String(raw ?? 'ACTIVE').toLowerCase() === 'inactive' ? 'inactive' : 'active');

/** Pure decision: what should happen to one dataset employee, given the
 * existing row (if any) for the same organization + external id. */
export function planEmployeeAction(datasetEmployee, existingRow) {
  const externalId = String(datasetEmployee.external_employee_id).trim();
  const name = String(datasetEmployee.full_name ?? '').trim();
  const status = normalizeStatus(datasetEmployee.status);

  if (!existingRow) {
    return { kind: 'CREATE', externalId, name, status };
  }
  if (existingRow.name !== name || existingRow.status !== status) {
    return { kind: 'UPDATE', externalId, name, status };
  }
  return { kind: 'SKIP', externalId, name, status };
}

/** Loads every existing row for this org among the dataset's external ids,
 * so decisions never depend on a second organization's data. */
async function loadExistingByExternalId(sql, organizationId, externalIds) {
  const rows = await sql`
    SELECT external_employee_id, name, status, user_id
    FROM employees
    WHERE organization_id = ${organizationId}
  `;
  const relevant = new Set(externalIds);
  const byExternalId = new Map();
  for (const row of rows) {
    if (row.external_employee_id && relevant.has(row.external_employee_id)) {
      byExternalId.set(row.external_employee_id, row);
    }
  }
  return byExternalId;
}

export async function runSeed(sql, employees, organization, { dryRun = false } = {}) {
  const externalIds = employees.map((employee) => String(employee.external_employee_id).trim());
  const existingByExternalId = await loadExistingByExternalId(sql, organization.id, externalIds);

  const totals = { created: 0, updated: 0, skipped: 0, errors: 0 };

  for (const employee of employees) {
    const externalId = String(employee.external_employee_id).trim();
    const existing = existingByExternalId.get(externalId);
    const action = planEmployeeAction(employee, existing);

    try {
      if (action.kind === 'CREATE') {
        console.log(`CREATE ${action.externalId} ${action.name}`);
        if (!dryRun) {
          // user_id intentionally omitted: NULL by default, never a User.
          await sql`
            INSERT INTO employees (organization_id, external_employee_id, name, status)
            VALUES (${organization.id}, ${action.externalId}, ${action.name}, ${action.status})
          `;
        }
        totals.created += 1;
      } else if (action.kind === 'UPDATE') {
        console.log(`UPDATE ${action.externalId} ${action.name}`);
        if (!dryRun) {
          // Only name/status/updated_at — user_id is never touched here.
          await sql`
            UPDATE employees
            SET name = ${action.name}, status = ${action.status}, updated_at = NOW()
            WHERE organization_id = ${organization.id} AND external_employee_id = ${action.externalId}
          `;
        }
        totals.updated += 1;
      } else {
        console.log(`SKIP ${action.externalId} ${action.name}`);
        totals.skipped += 1;
      }
    } catch (error) {
      totals.errors += 1;
      console.error(`ERROR ${action.externalId}: ${error instanceof Error ? error.message : error}`);
    }
  }

  return totals;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertNonProduction();

  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (!connectionString) {
    abort('DATABASE_URL is not configured.');
  }
  const sql = neon(connectionString);

  const employees = await loadDataset();
  const organization = await resolveOrganization(sql, args);

  console.log(`Target organization: ${organization.id} (${organization.name}, ${organization.type})`);
  console.log(`Dataset: ${employees.length} synthetic employees from ${DATASET_PATH}`);
  console.log(args.dryRun ? 'Mode: DRY RUN (no writes)' : 'Mode: WRITE');
  console.log('');

  const totals = await runSeed(sql, employees, organization, { dryRun: args.dryRun });

  console.log('');
  console.log(`Totals: ${totals.created} created, ${totals.updated} updated, ${totals.skipped} skipped, ${totals.errors} errors`);
  if (totals.errors > 0) {
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((error) => {
    if (error instanceof SeedAbortError) {
      console.error(`ABORT: ${error.message}`);
    } else {
      console.error('seed failed:', error instanceof Error ? error.message : error);
    }
    process.exit(1);
  });
}
