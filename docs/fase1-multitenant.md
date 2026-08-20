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
- Login/logout (`/api/auth/login`, `/api/auth/logout`): cookie `anclora_session` httpOnly, SameSite=Lax, Secure en HTTPS, 30 días. Solo se persiste el hash SHA-256 del token (128 bytes de entropía, `crypto.randomBytes(32)`). Login crea token nuevo (no session fixation) y limpia sesiones expiradas del usuario.
- Rate limit de login: ventana fija en memoria (10 intentos / 5 min por email, por instancia serverless — limitación documentada, no distribuido).
- Login con mensaje genérico (sin enumeración de usuarios). El registro devuelve 409 si el email existe (mismo criterio que anclora-impulso; gap low documentado).
- Passwords: scrypt (Node `crypto`), formato `scrypt:N:r:p:salt:hash`, comparación `timingSafeEqual`.
- Contexto de seguridad: `resolveContext` (`api/_lib/auth.js`) resuelve sesión → membership → organización activa. El header `x-organization-id` solo se honra si el usuario es miembro. **Sin fallback silencioso a la primera membership**: multi-org sin selección ⇒ contexto sin organización ⇒ endpoints de datos responden 400 `Organization selection required`.

Ciclo de estado auth (frontend): UNAUTHENTICATED → AUTHENTICATING (pantalla login, `aria-busy`) → sesión creada → resolución memberships → org activa (única o selección explícita persistida por usuario en `anclora_shiftimport_active_org_v1`) → role → vínculo User↔Employee → AUTHORIZED. Casos explícitos: sesión expirada/inválida (401 → invitado), multi-org sin selección (modal bloqueante), EMPLOYEE sin empleado vinculado (estado bloqueado "Cuenta no vinculada", sin datos), logout (limpia contexto cliente + token servidor).

Permisos mínimos:

| Capacidad | EMPLOYEE | MANAGER | ADMIN |
|---|---|---|---|
| Ver/importar/gestionar **sus** turnos | ✔ | ✔ | ✔ |
| Ver empleados y calendarios de la org | — | ✔ | ✔ |
| Crear empleados (alta inline en importación) | — | ✔ | ✔ |
| Editar/desactivar empleados, vincular User↔Employee | — | — | ✔ |
| Listar/añadir/cambiar rol/eliminar memberships | — | — | ✔ |

Gestión B2B mínima (`api/memberships`, solo ADMIN): añadir usuario existente por email o crear uno nuevo con contraseña inicial entregada fuera de banda (sin infra de email — limitación documentada), asignar/cambiar rol (whitelist ADMIN/MANAGER/EMPLOYEE), vincular User↔Employee al alta, eliminar membership. Protecciones: último ADMIN no se degrada ni se elimina; prohibido auto-eliminarse; el empleado vinculado queda con `user_id NULL` al remover. MANAGER no puede tocar roles ni usuarios (403).

## Contratos Anclora aplicados (Fase 1.1)

Fuente canónica: `anclora-vault/00-governance/contracts/` (dossier `20-products/shiftimport/dossier.md`).

- `components/ANCLORA_AUTH_LOGIN_SCREEN_CONTRACT.md` v1.3.0 → `src/components/AuthScreen.tsx` (card 460px/rounded-3xl/blur-xl, orden logo→divisor→nombre→email→password→CTA "Iniciar sesión"→forgot→no-account→social disabled→legal, `role="alert"`, show/hide password, hover `scale(1.018)`, reduced-motion).
- `components/MODAL_CONTRACT.md` + accesibilidad de overlays → primitive común `src/components/ui/ModalShell.tsx` (backdrop blur, ESC, click-outside, focus trap, foco inicial/retorno, `role="dialog" aria-modal`, footer secundaria-izquierda/primaria-derecha, modo blocking).
- `components/UI_MOTION_CONTRACT.md` → hover/focus-visible medido, `prefers-reduced-motion` respetado en la pantalla auth.
- `core/ANCLORA_PREMIUM_APP_CONTRACT.md` → un CTA dominante por vista, familias de botones (`btn-gold`/`btn-outline`).
- Branding: acento canónico `#6AAD49` (`--color-accent` ya existente).
- Gap documentado: `anclora-design-system` (paquete CSS) no se integra como dependencia en esta fase (bug conocido de `@import` anidados en Vite/Lightning CSS y ausencia de tema `product-anclora-shiftimport`); se usan tokens locales con valores canónicos. Modales heredados (ShiftModal/ImportModal/etc.) conservan su shell propio con ESC; su migración a ModalShell queda pendiente (low).

## Endpoints

- `POST /api/auth/register|login|logout`
- `GET /api/session/me`
- `GET /api/employees` — lista org-scoped (EMPLOYEE solo se ve a sí mismo)
- `GET /api/employees?match=1&externalEmployeeId=&name=` — matching del importador: `recognized` | `ambiguous` | `new`
- `POST /api/employees` (MANAGER+) · `PATCH /api/employees` (ADMIN: editar/desactivar/vincular user)
- `GET|POST|PATCH|DELETE /api/memberships` (ADMIN: gestión B2B mínima de usuarios/roles)
- `GET|POST /api/imports`
- `GET /api/shifts?employeeId=` · `PATCH /api/shifts {employeeId, upserts[], deleteIds[]}`
- Sin organización activa (multi-org sin selección): endpoints de datos responden 400; sin sesión: 401.

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

## Migración de datos locales (PASO 10 / Fase 1.1 PASO 13)

- Datos actuales: turnos en `localStorage` (`anclora_shifts_v1`), volumen pequeño, datos reales del usuario en su navegador. Nada en servidor (la tabla legacy nunca llegó a crearse; sync remoto nunca se activó).
- Flujo EXPLÍCITO, nunca silencioso: tras login, si el Employee propio está vacío en remoto y hay turnos locales, se muestra `LocalMigrationModal` con preview (nº de registros, organización destino, empleado destino) y acciones: **Importar a mi cuenta** / **Mantener solo en este dispositivo** (no vuelve a preguntar) / **Cancelar** (pregunta en el próximo inicio).
- Idempotente: upsert por id (`ON CONFLICT (id)`), repetir no duplica. La copia local **no se elimina** (backup). Sin reset de datos.

## Importación multi-empleado — alcance real (Fase 1.1 PASO 11)

- **A** Un documento puede persistir datos de varios empleados sin pisarse: SÍ (coexistencia por `employee_id`, verificado en smoke + E2E).
- **B** Una entidad Import puede contener turnos de varios empleados: SÍ a nivel de modelo y API (`import_id` compartido, upserts con `employeeId` mezclados validados por org).
- **C** Seleccionar uno/varios/todos los empleados detectados de un PDF en una sola operación de UI: **NO — GAP (medium)**. El parser extrae una fila por selector; el flujo UI actual es empleado a empleado (detectar → seleccionar → importar → cambiar empleado → repetir con el mismo documento).
- **D** El flujo actual sigue siendo por empleado, sin pérdida ni solape entre ellos.

## Invariantes de seguridad (tests)

`api/_lib/data.test.js` + `api/_lib/auth.test.js` + `api/_lib/passwords.test.js` (tests unitarios con sql fake) + `scripts/smoke-api.mjs` (24 checks contra Neon dev) + E2E navegador `qa/e2e-acceptance/playwright.local.config.ts` (5 casos contra `vercel dev` + Neon dev con seed/teardown automático):

- Aislamiento tenant: lectura/escritura cross-org → 403.
- Aislamiento empleado: EMPLOYEE no lee/escribe turnos ajenos.
- Multi-org: sin selección explícita no hay organización activa (400 en datos); header con org ajena no se honra; revocación efectiva inmediata.
- Escalación de privilegios bloqueada (EMPLOYEE/MANAGER no gestionan memberships; último ADMIN protegido).
- Coexistencia multi-empleado: mismo día, dos empleados, sin conflicto.
- Re-import idempotente y confinado al empleado.
- Employee sin User: permitido; EMPLOYEE sin vínculo: estado bloqueado seguro.
- Migración local explícita e idempotente.
- Anónimo → 401; sesión expirada → fail closed.

`scripts/smoke-api.mjs` se mantiene manual (requiere `DATABASE_URL` de desarrollo): no existe infraestructura de base de datos de test para CI y no debe apuntar a producción. Si en el futuro existe una rama Neon de CI, el script es ejecutable tal cual con esa variable.
