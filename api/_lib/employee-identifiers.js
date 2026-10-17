import { HttpError, requireRole } from './auth.js';
import { assertEmployeeInOrg } from './data.js';

/**
 * Source identifiers: the same person is known by different payroll numbers in different source systems
 * (e.g. TRYP_EMPLOYEE_CALENDAR 6888 vs TRYP_TEAM_SCHEDULE 84881). A mapping is created ONLY by an explicit
 * administrative action; it is never inferred (not by name, not by similarity, not by another system's number).
 */
const clean = (value) => String(value ?? '').trim();

function conflict(message, code) {
  const error = new HttpError(409, message);
  error.code = code;
  return error;
}

export async function resolveBySourceIdentifier(sql, ctx, { sourceSystem, externalIdentifier }) {
  const system = clean(sourceSystem);
  const identifier = clean(externalIdentifier);
  if (!system || !identifier) throw new HttpError(400, 'sourceSystem and externalIdentifier are required');
  const rows = await sql`
    SELECT e.id, e.name, e.external_employee_id, e.status
    FROM employee_source_identifiers i
    JOIN employees e ON e.id = i.employee_id AND e.organization_id = i.organization_id
    WHERE i.organization_id = ${ctx.organizationId} AND i.source_system = ${system} AND i.external_identifier = ${identifier}
  `;
  return rows[0]
    ? { mapped: true, employee: { id: rows[0].id, name: rows[0].name, externalEmployeeId: rows[0].external_employee_id, status: rows[0].status } }
    : { mapped: false, employee: null };
}

/** Same lookup, used by the importer's employee matching (step 1: known source-specific mapping). */
export async function findEmployeeIdBySourceIdentifier(sql, ctx, sourceSystem, externalIdentifier) {
  const system = clean(sourceSystem);
  const identifier = clean(externalIdentifier);
  if (!system || !identifier) return null;
  const rows = await sql`
    SELECT employee_id FROM employee_source_identifiers
    WHERE organization_id = ${ctx.organizationId} AND source_system = ${system} AND external_identifier = ${identifier}
  `;
  return rows[0]?.employee_id ?? null;
}

/** Source systems whose individual exports carry ONE employee: the only ones an EMPLOYEE may self-bind. */
const SELF_BINDABLE_SYSTEMS = new Set(['TRYP_EMPLOYEE_CALENDAR']);

/** Deterministic name key: case, accents, punctuation and repeated spaces only. No fuzzy matching of any kind. */
export function normalizeNameKey(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The QA mirror decorates pseudonymised employees as "<Name> — QA". That decoration is an artefact of the mirror, so the
 * exact suffix is ignored ONLY inside an organization that is itself a QA mirror; production names compare as they are.
 */
export function employeeNameKey(name, organizationName) {
  const base = String(name ?? '');
  if (/QA Mirror\s*$/i.test(String(organizationName ?? ''))) return normalizeNameKey(base.replace(/\s+[—–-]\s+QA\s*$/i, ''));
  return normalizeNameKey(base);
}

const publicEmployee = (row) => ({ id: row.id, name: row.name, externalEmployeeId: row.external_employee_id ?? null, status: row.status });

/**
 * Who does an individual TRYP export belong to? Order: explicit source mapping -> canonical id -> unique exact name.
 * status: MAPPED | CANONICAL (resolved) | CANDIDATE (needs an explicit association) | AMBIGUOUS | NONE | MISMATCH | NOT_YOURS.
 * An EMPLOYEE only ever sees / matches their own record.
 */
export async function resolveSourceIdentity(sql, ctx, { sourceSystem, externalIdentifier, documentName }) {
  const system = clean(sourceSystem);
  const identifier = clean(externalIdentifier);
  if (!system || !identifier) throw new HttpError(400, 'sourceSystem and externalIdentifier are required');
  const org = (await sql`SELECT name FROM organizations WHERE id = ${ctx.organizationId}`)[0];
  const rows = await sql`
    SELECT id, name, external_employee_id, status FROM employees
    WHERE organization_id = ${ctx.organizationId} AND status <> 'inactive'
  `;
  const scoped = ctx.role === 'EMPLOYEE' ? rows.filter((row) => row.id === ctx.employeeId) : rows;
  const docKey = employeeNameKey(documentName, org?.name);
  const byName = docKey ? scoped.filter((row) => employeeNameKey(row.name, org?.name) === docKey) : [];

  const mappedId = await findEmployeeIdBySourceIdentifier(sql, ctx, system, identifier);
  if (mappedId) {
    const employee = rows.find((row) => row.id === mappedId);
    if (ctx.role === 'EMPLOYEE' && mappedId !== ctx.employeeId) return { status: 'NOT_YOURS', employee: null, candidates: [] };
    // The name says it is somebody else: never silently reuse (or steal) an alias.
    if (byName.length === 1 && byName[0].id !== mappedId) return { status: 'MISMATCH', employee: employee ? publicEmployee(employee) : null, candidates: [publicEmployee(byName[0])] };
    return { status: 'MAPPED', employee: employee ? publicEmployee(employee) : null, candidates: [] };
  }
  const canonical = scoped.filter((row) => clean(row.external_employee_id) === identifier);
  if (canonical.length === 1) return { status: 'CANONICAL', employee: publicEmployee(canonical[0]), candidates: [] };
  if (byName.length === 1) return { status: 'CANDIDATE', employee: publicEmployee(byName[0]), candidates: [] };
  if (byName.length > 1) return { status: 'AMBIGUOUS', employee: null, candidates: byName.map(publicEmployee) };
  return { status: ctx.role === 'EMPLOYEE' ? 'NOT_YOURS' : 'NONE', employee: null, candidates: [] };
}

export async function createSourceIdentifierMapping(sql, ctx, { employeeId, sourceSystem, externalIdentifier, documentName }) {
  const system = clean(sourceSystem);
  const identifier = clean(externalIdentifier);
  if (!system || !identifier) throw new HttpError(400, 'sourceSystem and externalIdentifier are required');
  if (ctx.role === 'EMPLOYEE') {
    // SELF-BINDING only: their own record, a single-employee export, and a document name that identifies them unambiguously.
    const forbidden = (message) => Object.assign(new HttpError(403, message), { code: 'SOURCE_BINDING_FORBIDDEN' });
    if (!ctx.employeeId || employeeId !== ctx.employeeId) throw forbidden('You can only associate your own employee record');
    if (!SELF_BINDABLE_SYSTEMS.has(system)) throw forbidden('This source cannot be associated by an employee');
    const verdict = await resolveSourceIdentity(sql, ctx, { sourceSystem: system, externalIdentifier: identifier, documentName });
    const already = verdict.status === 'MAPPED' && verdict.employee?.id === ctx.employeeId;
    if (!already && !(verdict.status === 'CANDIDATE' && verdict.employee?.id === ctx.employeeId)) {
      throw forbidden('The document does not unambiguously identify you');
    }
  } else {
    requireRole(ctx, 'ADMIN');
  }
  await assertEmployeeInOrg(sql, ctx, employeeId);

  const existing = await resolveBySourceIdentifier(sql, ctx, { sourceSystem: system, externalIdentifier: identifier });
  if (existing.mapped) {
    if (existing.employee.id === employeeId) return { created: false, ...existing };
    throw conflict('This source identifier already belongs to another employee', 'SOURCE_IDENTIFIER_TAKEN');
  }
  // An identifier that is already the CANONICAL number of someone else is never silently re-pointed.
  const canonical = await sql`
    SELECT id FROM employees
    WHERE organization_id = ${ctx.organizationId} AND external_employee_id = ${identifier} AND id <> ${employeeId}
  `;
  if (canonical.length > 0) throw conflict('This number is the canonical id of another employee', 'SOURCE_IDENTIFIER_CANONICAL_CONFLICT');

  await sql`
    INSERT INTO employee_source_identifiers (organization_id, employee_id, source_system, external_identifier, created_by_user_id)
    VALUES (${ctx.organizationId}, ${employeeId}, ${system}, ${identifier}, ${ctx.user.id})
  `;
  return { created: true, ...(await resolveBySourceIdentifier(sql, ctx, { sourceSystem: system, externalIdentifier: identifier })) };
}

/**
 * Fail-closed guard for imports that carry a source-system number: the target employee must be the one the number
 * is explicitly mapped to, or (when unmapped) the one whose canonical external id IS that number. Anything else is
 * a 409 — the client gate is UX, this is the enforcement.
 */
export async function assertSourceIdentifierTarget(sql, ctx, { sourceSystem, sourceIdentifier, employeeId }) {
  const system = clean(sourceSystem);
  const identifier = clean(sourceIdentifier);
  if (!system || !identifier) return;
  const mapped = await findEmployeeIdBySourceIdentifier(sql, ctx, system, identifier);
  if (mapped) {
    if (mapped !== employeeId) throw conflict('The document number is associated with a different employee', 'SOURCE_IDENTIFIER_MISMATCH');
    return;
  }
  const rows = await sql`SELECT external_employee_id FROM employees WHERE id = ${employeeId} AND organization_id = ${ctx.organizationId}`;
  if (clean(rows[0]?.external_employee_id) !== identifier) {
    throw conflict('The document number is not associated with this employee', 'SOURCE_IDENTIFIER_UNMAPPED');
  }
}
