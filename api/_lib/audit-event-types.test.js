import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * recordAuditEvent swallows write errors: an event type missing from the CHECK constraint of organization_audit_events is lost silently.
 * Every literal `eventType` used by the API must be allowed by the latest constraint definition.
 */
const root = join(__dirname, '..', '..');

function allowedTypes() {
  const dir = join(root, 'db', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const last = files.filter((f) => readFileSync(join(dir, f), 'utf8').includes('organization_audit_events_event_type_check')).pop();
  const sql = readFileSync(join(dir, last), 'utf8');
  const start = sql.lastIndexOf('organization_audit_events_event_type_check');
  const block = sql.slice(start, sql.indexOf(');', start));
  return new Set([...block.matchAll(/'([A-Za-z_.]+)'/g)].map((m) => m[1]));
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return e.name.endsWith('.js') && !e.name.endsWith('.test.js') ? [p] : [];
  });
}

describe('organization_audit_events event types', () => {
  it('every literal eventType written by the API is allowed by the database CHECK constraint', () => {
    const allowed = allowedTypes();
    expect(allowed.size).toBeGreaterThan(20);
    const used = new Set();
    for (const file of sourceFiles(join(root, 'api'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/eventType:\s*'([A-Za-z_.]+)'/g)) used.add(m[1]);
    }
    const missing = [...used].filter((type) => !allowed.has(type));
    expect(missing).toEqual([]);
  });
});
