/**
 * Deployment switch for import auto-publication (decision `historical-and-auto-publish`).
 *
 * The Neon branch is shared by every Git branch and migration `0049` (CHECK on `imports.import_decision`, `publication_summary`,
 * audit event) must exist before the first auto-publishing import is stored. Until Toni has applied and validated `0049`, the
 * deployment keeps this OFF and behaves exactly like `historical-and-plan` (INV-11). The server re-checks it on every request.
 */
export function isImportAutoPublishEnabled(env = process.env) {
  return String(env.IMPORT_AUTO_PUBLISH_ENABLED ?? '').trim().toLowerCase() === 'true';
}
