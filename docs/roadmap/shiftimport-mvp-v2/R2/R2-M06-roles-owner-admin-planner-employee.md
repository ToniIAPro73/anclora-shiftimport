# R2-M06 — Roles: OWNER / ADMIN / PLANNER / EMPLOYEE

STATUS: DONE — PASS

## 1. Objetivo

Ejecutar la migración del modelo de roles actual (`ADMIN`/`EMPLOYEE`) al modelo objetivo (`OWNER`/`ADMIN`/`PLANNER`/`EMPLOYEE`) decidido en R0-M03, incluyendo backfill de datos existentes.

## 2. Problema que resuelve

El modelo actual de 2 roles no distingue entre "propietario de la organización" y "administrador operativo", ni existe un rol de planificación (`PLANNER`) necesario para R3 (scheduling) y R5 (approval routing).

## 3. Estado actual del repositorio

`memberships.role CHECK IN ('ADMIN','EMPLOYEE')` (migración 0007, que además eliminó un rol `MANAGER` previo migrándolo a `ADMIN` — precedente directo para esta migración). Guard de rol en `api/_lib/auth.js:163-165`.

## 4. Alcance IN

- Migración de esquema: ampliar el CHECK constraint a `('OWNER','ADMIN','PLANNER','EMPLOYEE')` y preservar el invariante de un único OWNER por organización.
- Backfill: aplicar la regla OWNER aprobada por producto (la membership `ADMIN` con `created_at` más antigua por organización pasa a `OWNER`; empates por `user_id` ascendente porque `memberships` usa una clave primaria compuesta y no tiene columna `id`).
- Actualizar guard de rol en `api/_lib/auth.js` para reconocer los 4 roles y su jerarquía (`OWNER > ADMIN > PLANNER > EMPLOYEE` a efectos de permisos generales; los scopes de R2-M07 refinan esto).
- Actualizar cualquier UI que muestre/seleccione rol (selector de rol en `MembersModal.tsx` u otro punto).

## 5. Alcance OUT

- No se implementan scopes (`ORGANIZATION`/`AREA`/`SELF`) — eso es R2-M07.
- No se implementa editor de roles personalizados, ni `TEAM` scope, ni cadenas de delegación (prohibido explícitamente por master-prompt sección 13 hasta R9).

## 6. Dependencias

R0-M03 (decisión formal del modelo de roles y regla de backfill OWNER).

## 7. Decisiones arquitectónicas

Regla de backfill OWNER (aprobada por producto y ejecutada aquí): la membership más antigua (`MIN(created_at)`) de cada organización se promueve a `OWNER`. Si existe empate, se resuelve por `user_id` ascendente (determinista; la tabla no tiene `id` simple). Toda membership `ADMIN` restante permanece `ADMIN`. `PLANNER` no se asigna por backfill — es un rol de asignación explícita futura, ninguna membership existente lo recibe automáticamente.

## 8. Modelo de datos afectado

`memberships.role` — ampliar CHECK constraint. Migración forward-safe: `ALTER TABLE memberships DROP CONSTRAINT ...; ALTER TABLE memberships ADD CONSTRAINT ... CHECK (role IN ('OWNER','ADMIN','PLANNER','EMPLOYEE'));` seguido de `UPDATE` de backfill dentro de la misma migración. `0014_single_owner_per_organization.sql` añade un índice único parcial para impedir un segundo OWNER.

## 9. API / Backend

- `api/_lib/auth.js`: extender función de guard de rol para aceptar los 4 valores.
- Cualquier endpoint que hoy compruebe `role === 'ADMIN'` debe revisarse explícitamente (grep obligatorio) para decidir si el nuevo `OWNER` también debe pasar esa comprobación (por defecto: sí, `OWNER` implica todos los permisos de `ADMIN`).

## 10. Frontend / UX

Selector de rol en gestión de miembros debe incluir las 4 opciones, con `PLANNER` disponible para asignación manual. Mostrar rol actual de cada miembro en la lista.

## 11. Seguridad y autorización

Ningún endpoint debe confiar solo en el rol mostrado en UI (master-prompt sección 25). Este cambio de constraint es el punto de mayor riesgo de la microfase: un backfill incorrecto podría dejar una organización sin `OWNER` o con múltiples. Task dedicada de verificación post-backfill (T04).

## 12. i18n

Nuevas claves de rol (`OWNER`, `PLANNER`) en ES/EN.

## 13. Accesibilidad

Selector de rol accesible por teclado, con label asociado.

## 14. Responsive / temas

Selector de rol debe funcionar en light/dark y en los breakpoints ya soportados por `MembersModal.tsx`.

## 15. Observabilidad / errores

Error claro si se intenta asignar un rol inválido (defensa en profundidad además del CHECK constraint).

## 16. Migraciones

Nueva migración (siguiente número secuencial tras 0012): amplía CHECK constraint + backfill OWNER. Debe ser forward-safe e idempotente (re-ejecutar no debe reasignar OWNER si ya existe uno por organización).

## 17. Compatibilidad y datos existentes

Toda organización existente debe terminar con exactamente un `OWNER` tras el backfill. Verificación obligatoria post-migración (T04) antes de declarar Gate PASS.

## 18. Tasks

### T01 — Migración de esquema: ampliar CHECK constraint

Objetivo: Permitir los 4 valores de rol.
Archivos / módulos probables: `db/migrations/00XX_expand_membership_roles.sql`.
Cambios: DROP/ADD CONSTRAINT.
No hacer: No eliminar el constraint sin reemplazo (dejaría el campo sin validación).
Criterios de aceptación:
- [x] Migración aplica limpiamente sobre Neon de desarrollo.
- [x] Constraint rechaza valores fuera de los 4 permitidos.
Tests: test de migración (`db/**/*.test.mjs`) que intente insertar rol inválido y espere error.
Evidencia esperada: resultado de migración + test.

### T02 — Backfill OWNER

Objetivo: Asignar `OWNER` a la membership más antigua por organización.
Archivos / módulos probables: misma migración o script separado dentro de la migración.
Cambios: `UPDATE memberships` sobre la membership `ADMIN` mínima por `(created_at, user_id)` dentro de cada organización sin OWNER.
No hacer: No ejecutar contra producción sin aprobación explícita del usuario — solo Neon de desarrollo en esta microfase.
Criterios de aceptación:
- [x] Cada organización tiene exactamente un `OWNER` tras el backfill.
- [x] Ninguna membership `ADMIN` existente pierde acceso.
Tests: query de verificación post-migración.
Evidencia esperada: resultado de la query de verificación (conteo de OWNER por organización = 1 en todos los casos).

### T03 — Extender guard de rol en backend

Objetivo: Reconocer los 4 roles en `api/_lib/auth.js`.
Archivos / módulos probables: `api/_lib/auth.js:163-165`.
Cambios: Añadir `OWNER` y `PLANNER` a la lógica de comparación; `OWNER` hereda permisos de `ADMIN` por defecto.
No hacer: No implementar lógica de scope aquí (R2-M07).
Criterios de aceptación:
- [x] Endpoints que aceptaban `ADMIN` ahora también aceptan `OWNER`.
- [x] `PLANNER`/`EMPLOYEE` no obtienen acceso indebido a endpoints de administración.
Tests: test de autorización por rol para cada endpoint afectado.
Evidencia esperada: resultado de tests.

### T04 — Verificación post-backfill

Objetivo: Confirmar invariante "un OWNER por organización" antes de Gate.
Archivos / módulos probables: query de verificación dedicada.
Cambios: Ninguno de código; solo verificación.
No hacer: No declarar PASS sin esta verificación ejecutada.
Criterios de aceptación:
- [x] Query confirma invariante sobre datos de Neon de desarrollo.
Tests: N/A — verificación de datos.
Evidencia esperada: resultado de query adjunto como evidencia del Gate.

### T05 — UI: selector de rol con 4 opciones

Objetivo: Permitir asignar/ver los 4 roles en gestión de miembros.
Archivos / módulos probables: `MembersModal.tsx`.
Cambios: Ampliar selector, mostrar rol actual.
No hacer: No introducir editor de permisos personalizado.
Criterios de aceptación:
- [x] Los 4 roles son seleccionables donde corresponde.
- [x] Rol `OWNER` no puede autodegradarse a través de la UI si es el único OWNER de la organización (evitar organización sin OWNER).
Tests: test de componente.
Evidencia esperada: resultado de test.

### T06 — i18n de nuevas claves

Objetivo: Cerrar claves ES/EN para `OWNER`/`PLANNER`.
Archivos / módulos probables: `src/lib/i18n.ts`.
Cambios: Nuevas claves.
No hacer: No dejar claves huérfanas.
Criterios de aceptación:
- [x] `i18n-coverage.test.ts` pasa.
Tests: `i18n-coverage.test.ts`.
Evidencia esperada: resultado de test.

## 19. Tests obligatorios

migration test, unit (auth guard), integration (endpoints por rol), component (selector), i18n coverage.

## 20. Evidencias

Resultado de migración, query de verificación T04, resultados de tests T01/T03/T05/T06:

- Remediación previa aprobada y auditada: organización `Cadena Aurora Hoteles`, UUID `8535b597-58ff-4ed9-9e65-bac7603e9fb6`; antes del DELETE tenía 0 memberships, empleados, imports, shifts, áreas y format_profiles. El DELETE por UUID devolvió exactamente 1 fila; organizaciones 3 → 2; el UUID ya no existe y la cascada dejó 0 filas en las seis tablas tenant-scoped.
- `node --env-file=.env.development.local db/migrate.mjs` → `apply 0013_membership_roles_owner.sql (5 statements)` y `apply 0014_single_owner_per_organization.sql`, ambos `done`; `migrations up to date`.
- Constraint verificado en Neon dev: `memberships_role_check` permite exactamente `OWNER`, `ADMIN`, `PLANNER`, `EMPLOYEE`; intento de insertar `NOT_A_ROLE` rechazado y la transacción no persistió cambios.
- Backfill verificado en las 2 organizaciones restantes: cada una tiene exactamente 1 OWNER; distribución final: Anclora Group (1 OWNER, 1 ADMIN, 14 EMPLOYEE), Cadena Aurora Hoteles (1 OWNER, 0 ADMIN, 4 EMPLOYEE).
- `npx vitest run api/_lib/auth.test.js api/_lib/data.test.js db/migrations.test.mjs src/lib/bulk-import-csv.test.ts src/components/shift-dashboard/MembersModal.test.tsx` → **5 archivos, 177 tests PASS**.
- `npm test` → **97 archivos, 1001 tests PASS**.
- `npm run lint` → PASS.
- `npm run build` → PASS; warning no bloqueante ya conocido por chunks grandes de PDF/XLSX.
- `git diff --check` → PASS.

## 21. Gate

Gates requeridos: G2 (Database/migrations), G3 (Domain invariants), G4 (API/authorization).

G3 es especialmente crítico: el invariante "exactamente un OWNER por organización" debe verificarse explícitamente, no asumirse.

Resultado: **PASS**. La remediación de la organización vacía se ejecutó antes de la migración; constraint, backfill, autorización, UI, i18n y pruebas quedaron verificados.

## 22. Rollback / remediación

Rollback lógico: si el backfill produce una organización sin OWNER o con más de uno, no se hace commit — se corrige la query de backfill y se reejecuta sobre una base de datos de desarrollo limpia antes de reintentar el Gate. No se revierte el constraint (sería más disruptivo que corregir el backfill).

## 23. Criterio de DONE

Constraint ampliado, backfill ejecutado y verificado (invariante 1 OWNER/organización), guard de backend y UI actualizados, tests y i18n cerrados.
