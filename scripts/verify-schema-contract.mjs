import pg from 'pg';
import { createHash } from 'node:crypto';

const { Client } = pg;
const sources = [
  ['FRESH', 'SCHEMA_FRESH_DATABASE_URL'],
  ['LOCAL', 'SCHEMA_LOCAL_DATABASE_URL'],
  ['PRODUCTION', 'SCHEMA_PRODUCTION_DATABASE_URL'],
];

const catalogQueries = {
  tables: `
    SELECT c.relname AS name, c.relkind AS kind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
     ORDER BY c.relname`,
  columns: `
    SELECT c.relname AS relation, a.attnum AS position, a.attname AS name,
           format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
           pg_get_expr(d.adbin, d.adrelid) AS default_value, a.attidentity AS identity,
           a.attgenerated AS generated
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY c.relname, a.attnum`,
  primary_keys: `
    SELECT c.relname AS relation, con.conname AS name, con.contype AS kind,
           pg_get_constraintdef(con.oid, true) AS definition,
           con.confdeltype AS delete_rule, con.confupdtype AS update_rule,
           con.condeferrable AS deferrable, con.condeferred AS initially_deferred
      FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND con.contype = 'p'
     ORDER BY c.relname, con.conname`,
  foreign_keys: `
    SELECT c.relname AS relation, con.conname AS name, con.contype AS kind,
           pg_get_constraintdef(con.oid, true) AS definition,
           con.confdeltype AS delete_rule, con.confupdtype AS update_rule,
           con.condeferrable AS deferrable, con.condeferred AS initially_deferred
      FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND con.contype = 'f'
     ORDER BY c.relname, con.conname`,
  unique_constraints: `
    SELECT c.relname AS relation, con.conname AS name, con.contype AS kind,
           pg_get_constraintdef(con.oid, true) AS definition
      FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND con.contype = 'u'
     ORDER BY c.relname, con.conname`,
  check_constraints: `
    SELECT c.relname AS relation, con.conname AS name, pg_get_constraintdef(con.oid, true) AS definition
      FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND con.contype = 'c'
     ORDER BY c.relname, con.conname`,
  exclusion_constraints: `
    SELECT c.relname AS relation, con.conname AS name, pg_get_constraintdef(con.oid, true) AS definition
      FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND con.contype = 'x'
     ORDER BY c.relname, con.conname`,
  indexes: `
    SELECT tablename AS relation, indexname AS name, indexdef AS definition
      FROM pg_indexes WHERE schemaname = 'public'
     ORDER BY tablename, indexname`,
  triggers: `
    SELECT c.relname AS relation, t.tgname AS name,
           pg_get_triggerdef(t.oid, true) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND NOT t.tgisinternal
     ORDER BY c.relname, t.tgname`,
  functions: `
    SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS signature,
           md5(pg_get_functiondef(p.oid)) AS definition_hash
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
     ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)`,
  extensions: `
    SELECT e.extname AS name, n.nspname AS schema
      FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
     ORDER BY e.extname`,
};

const canonical = (rows) => JSON.stringify(rows.map((row) => Object.values(row)));
const digest = (value) => createHash('sha256').update(value).digest('hex');

async function inspect(label, connectionString) {
  const client = new Client({ connectionString, ssl: connectionString.includes('neon.tech') ? { rejectUnauthorized: true } : false });
  await client.connect();
  try {
    const identity = await client.query('SELECT current_database() AS database, current_setting(\'server_version_num\') AS version');
    console.log(`INSPECTING=${label} DATABASE=${identity.rows[0].database} POSTGRES=${identity.rows[0].version}`);
    const catalog = {};
    for (const [category, sql] of Object.entries(catalogQueries)) {
      const { rows } = await client.query(sql);
      catalog[category] = rows;
      console.log(`INSPECTED=${label} CATEGORY=${category} COUNT=${rows.length}`);
    }
    catalog.runtime_required_schema = (await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'type'
      ) AS organizations_type,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'approval_policy'
      ) AS organizations_approval_policy,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'account_status'
      ) AS users_account_status,
      to_regclass('public.shifts') IS NOT NULL AS shifts_table,
      to_regclass('public.schedules') IS NOT NULL AS schedules_table,
      to_regclass('public.schedule_versions') IS NOT NULL AS schedule_versions_table,
      to_regclass('public.shift_assignments') IS NOT NULL AS shift_assignments_table
    `)).rows;
    return { label, database: identity.rows[0].database, version: identity.rows[0].version, catalog };
  } finally {
    await client.end();
  }
}

async function main() {
  const configured = sources.filter(([, envName]) => process.env[envName]);
  if (!process.env.SCHEMA_FRESH_DATABASE_URL) {
    throw new Error('SCHEMA_FRESH_DATABASE_URL is required');
  }
  if (configured.length < 2) {
    throw new Error('Configure at least two SCHEMA_*_DATABASE_URL values to compare');
  }

  const inspected = [];
  for (const [label, envName] of configured) {
    inspected.push(await inspect(label, process.env[envName]));
  }
  const reference = inspected.find((entry) => entry.label === 'FRESH');
  console.log(`REFERENCE=FRESH DATABASE=${reference.database} POSTGRES=${reference.version}`);
  let compatible = true;
  for (const candidate of inspected.filter((entry) => entry !== reference)) {
    console.log(`CANDIDATE=${candidate.label} DATABASE=${candidate.database} POSTGRES=${candidate.version}`);
    for (const category of [...Object.keys(catalogQueries), 'runtime_required_schema']) {
      const left = canonical(reference.catalog[category]);
      const right = canonical(candidate.catalog[category]);
      const match = left === right;
      if (!match) compatible = false;
      const outputName = ({ tables: 'TABLES', columns: 'COLUMNS', primary_keys: 'PRIMARY_KEYS', foreign_keys: 'FOREIGN_KEYS', unique_constraints: 'UNIQUE_CONSTRAINTS', check_constraints: 'CHECK_CONSTRAINTS', exclusion_constraints: 'EXCLUSION_CONSTRAINTS', indexes: 'INDEXES', triggers: 'TRIGGERS', functions: 'FUNCTIONS', extensions: 'EXTENSIONS', runtime_required_schema: 'RUNTIME_REQUIRED_SCHEMA' })[category];
      console.log(`${outputName}_MATCH=${match} FRESH_COUNT=${reference.catalog[category].length} ${candidate.label}_COUNT=${candidate.catalog[category].length} FRESH_SHA256=${digest(left)} ${candidate.label}_SHA256=${digest(right)}`);
      if (!match) {
        const leftSet = new Set(reference.catalog[category].map((row) => canonical([row])));
        const rightSet = new Set(candidate.catalog[category].map((row) => canonical([row])));
        const missing = [...leftSet].filter((row) => !rightSet.has(row)).slice(0, 12).map((row) => JSON.parse(row)[0]);
        const extra = [...rightSet].filter((row) => !leftSet.has(row)).slice(0, 12).map((row) => JSON.parse(row)[0]);
        console.log(`${outputName}_MISSING_IN_${candidate.label}=${JSON.stringify(missing)}`);
        console.log(`${outputName}_EXTRA_IN_${candidate.label}=${JSON.stringify(extra)}`);
      }
    }
  }
  console.log(`SCHEMA_COMPATIBLE=${compatible}`);
  if (!compatible) process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted connection]') : 'Unknown schema verifier failure';
  console.error(`schema contract verification failed: ${message}`);
  process.exit(1);
});
