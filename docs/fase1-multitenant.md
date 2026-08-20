# Fase 1 — Multi-tenant Smart Import Foundation

## Arquitectura

ShiftImport pasa de localStorage-only a aplicación persistente multi-tenant sobre Neon PostgreSQL, manteniendo el modo invitado local-first intacto.

- **B2C** = organización de tipo `personal` (creada en el registro, con un Employee auto-vinculado al usuario).
- **B2B** = organización de tipo `company` con varios empleados y usuarios. Misma arquitectura, mismas tablas.

## Modelo de datos

| Tabla | Propósito | Claves de aislamiento |
|---|---|---|
| `organizations` | Tenant. `type`: `personal` \| `company` | — |
| `users` | Identidad de acceso (email + scrypt hash) | email único (lower) |
| `memberships` | User ↔ Organization + `role` (ADMIN/MANAGER/EMPLOYEE) | PK (user_id, organization_id) |
| `employees` | Persona de un cuadrante. `user_id` opcional, `external_employee_id` = nº nómina | organization_id |
| `imports` | Documento fuente (no estado global del calendario) | organization_id |
| `shifts` | Turno. NUNCA sin `organization_id` + `employee_id` | organization_id + employee_id |
| `sessions` | Cookie de sesión (solo hash SHA-256 del token) | user_id |

Reglas estructurales:

- Todo dato empresarial lleva `organization_id` (FK a `organizations`).
- Ningún `Shift` existe sin `organization_id` y `employee_id` (NOT NULL + FK).
- Sin UNIQUE sobre `date`: varios turnos legítimos por (org, empleado, fecha) están permitidos. La deduplicación es semántica (fingerprint) en cliente.
- Unidad de conflicto de re-importación: **organization + employee + fecha/horario** (fingerprint), nunca solo fecha.
- `external_employee_id` único por organización cuando existe (ancla de matching).

## Migraciones

- Versionadas en `db/migrations/*.sql`, orden por nombre.
- Runner: `node --env-file=.env.development.local db/migrate.mjs` (local) o con `DATABASE_URL` en el entorno (CI/Vercel).
- Tabla `_migrations` registra las aplicadas. Base vacía → esquema completo solo con migraciones.
- Nunca crear esquema desde Neon SQL Editor.

## Configuración Neon / variables

Integración Vercel ↔ Neon crea (sin valores aquí):

- `DATABASE_URL` (pooled — usada por API y migraciones)
- `DATABASE_URL_UNPOOLED`, `POSTGRES_URL*`, `PG*` (equivalentes)
- `NEON_PROJECT_ID`

Desarrollo local: `vercel link` + `vercel env pull .env.development.local`. Los `.env*` están en `.gitignore`; nunca commitear ni imprimir valores.

En Vercel (Production/Preview/Development) las variables ya están inyectadas por la integración. Preview usa database branching de Neon.

## Autenticación y roles

Solución propia mínima (sin dependencias externas):

- Registro (`POST /api/auth/register`): crea user + organización `personal` + membership ADMIN + Employee auto-vinculado.
- Login/logout (`/api/auth/login`, `/api/auth/logout`): cookie `anclora_session` httpOnly, SameSite=Lax, 30 días. Solo se persiste el hash del token.
- Passwords: scrypt (Node `crypto`), formato `scrypt:N:r:p:salt:hash`, comparación `timingSafeEqual`.
- Contexto de seguridad: `resolveContext` (`api/_lib/auth.js`) resuelve sesión → membership → organización activa. El cliente nunca envía `organization_id` fiable; un header `x-organization-id` solo se honra si el usuario es miembro.

Permisos mínimos:

| Capacidad | EMPLOYEE | MANAGER | ADMIN |
|---|---|---|---|
| Ver/importar/gestionar **sus** turnos | ✔ | ✔ | ✔ |
| Ver empleados y calendarios de la org | — | ✔ | ✔ |
| Crear empleados (alta inline en importación) | — | ✔ | ✔ |
| Editar/desactivar empleados, vincular User↔Employee | — | — | ✔ |

## Endpoints

- `POST /api/auth/register|login|logout`
- `GET /api/session/me`
- `GET /api/employees` — lista org-scoped (EMPLOYEE solo se ve a sí mismo)
- `GET /api/employees?match=1&externalEmployeeId=&name=` — matching del importador: `recognized` | `ambiguous` | `new`
- `POST /api/employees` (MANAGER+) · `PATCH /api/employees` (ADMIN: editar/desactivar/vincular user)
- `GET|POST /api/imports`
- `GET /api/shifts?employeeId=` · `PATCH /api/shifts {employeeId, upserts[], deleteIds[]}`

## Aislamiento multi-tenant (PASO 4)

Implementado en `api/_lib/data.js`, nunca en frontend:

- Toda consulta filtra por `organization_id` del contexto de sesión.
- Cualquier `employee_id` enviado por el cliente se valida contra la organización (`assertEmployeeInOrg`) → 403 si no pertenece.
- Rol EMPLOYEE: el filtro `employee_id` se fuerza al Employee vinculado al usuario, ignorando lo que pida el cliente.
- Deletes: `WHERE id AND organization_id AND employee_id`.

## Flujo de importación multi-empleado

1. Parser sin cambios: sigue extrayendo la fila del empleado indicado por el selector (nombre/ID).
2. Autenticado, el selector se resuelve contra el directorio de la org (`matchRemoteEmployee`): ID externo primero, nombre normalizado después.
3. Clasificación: `recognized` → importar bajo ese empleado; `ambiguous` → abortar con mensaje (nunca matching silencioso); `new` → alta inline (MANAGER+) sin abandonar el flujo, y continuar.
4. Se registra un `Import` (documento) y los turnos se persisten con `employee_id` + `import_id`.
5. Conflictos de re-importación: fingerprint semántico sobre los turnos **del mismo empleado**; otros empleados el mismo día no colisionan.
6. Varios empleados coexisten: el calendario visible es por empleado (selector "Equipo" para MANAGER/ADMIN, "Mis turnos" para EMPLOYEE).

## Migración de datos locales (PASO 10)

- Datos actuales: turnos en `localStorage` (`anclora_shifts_v1`), volumen pequeño, datos reales del usuario en su navegador. Nada en servidor (la tabla legacy nunca llegó a crearse; sync remoto nunca se activó).
- Estrategia: tras el primer login, si el Employee propio está vacío en remoto y hay turnos locales, se suben una vez (upsert) al Employee del usuario. Flag `anclora_shiftimport_migrated_v1`.
- La copia local **no se elimina** (backup). Sin reset de datos.

## Invariantes de seguridad (tests)

`api/_lib/data.test.js` (17 tests, sql fake) + `scripts/smoke-api.mjs` (12 checks contra Neon dev):

- Aislamiento tenant: lectura/escritura cross-org → 403.
- Aislamiento empleado: EMPLOYEE no lee/escribe turnos ajenos.
- Coexistencia multi-empleado: mismo día, dos empleados, sin conflicto.
- Re-import idempotente y confinado al empleado.
- Employee sin User: permitido.
- Múltiples imports coexisten; listados no cruzan orgs.
- Anónimo → 401.
