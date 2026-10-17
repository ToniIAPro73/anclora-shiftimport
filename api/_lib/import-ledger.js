/**
 * Effect-ledger attribution for write paths that belong to an import.
 *
 * Inside the SAME transaction as the business write, the first two statements (a) serialize the organization's ledger writers with
 * reversions and (b) declare which import the following row changes belong to (`app.import_id`, transaction-local). The database
 * triggers (record_import_effect) then store BEFORE/AFTER of every mutated row in import_effects. The import id is validated against
 * the organization: a foreign or unknown id yields NULL, i.e. no attribution (never a cross-tenant ledger row).
 */
export function ledgerPrefix(txn, organizationId, importId) {
  return [
    txn`SELECT pg_advisory_xact_lock(hashtextextended(${`import-ledger:${organizationId}`}, 0))`,
    txn`SELECT set_config('app.import_id', (SELECT id::text FROM imports WHERE id = ${importId} AND organization_id = ${organizationId}), true)`,
  ];
}

export const LEDGER_PREFIX_LENGTH = 2;
