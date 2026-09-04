# R2-M07 — Scopes: ORGANIZATION / AREA / SELF

STATUS: DONE — PASS

## 1. Objetivo

Definir e implementar los tres scopes de acceso (ORGANIZATION, AREA, SELF) que, combinados con los roles de R2-M06, determinan qué datos puede ver o modificar cada usuario.

## 2. Problema que resuelve

El rol por sí solo no basta: un `PLANNER` de un área no debe poder editar datos de otra área; un `EMPLOYEE` solo debe ver/modificar sus propios datos (`SELF`).

## 3. Estado actual del repositorio

No existe ningún mecanismo de scope hoy — la autorización actual es binaria por rol (`ADMIN`/`EMPLOYEE`) sin filtrado adicional por área. `employees.area_id` (migración 0008) y `imports.area_id`/`scope_type` (migración 0008/0010) ya proveen los datos necesarios para filtrar por área.

## 4. Alcance IN

- Definición exacta de cada scope:
  - `ORGANIZATION`: acceso a todos los datos de la organización (típico de OWNER/ADMIN).
  - `AREA`: acceso limitado a empleados/imports/shifts cuyo `area_id` coincide con el área asignada al usuario (típico de PLANNER cuando se le asigna un área).
  - `SELF`: acceso limitado a los propios datos del usuario vía su `employee_id` vinculado (típico de EMPLOYEE).
- Mecanismo de asignación de área a un `PLANNER` (nueva columna o tabla de asociación).
- Filtrado de scope aplicado en las consultas de `api/_lib/data.js` para los endpoints de empleados, imports y shifts.

## 5. Alcance OUT

No se implementa `TEAM` scope ni jerarquías adicionales (prohibido hasta R9).

## 6. Dependencias

R2-M06.

## 7. Decisiones arquitectónicas

Un `PLANNER` puede tener scope `ORGANIZATION` (planificador general) o `AREA` (planificador de un área específica) — se decide con una columna nullable `memberships.scoped_area_id`: NULL significa scope `ORGANIZATION` para ese rol; no-NULL significa scope `AREA` limitado a esa área. `OWNER`/`ADMIN` siempre son `ORGANIZATION` (columna ignorada/NULL forzado). `EMPLOYEE` siempre es `SELF` vía `employees.user_id`, no requiere columna adicional.

## 8. Modelo de datos afectado

`memberships.scoped_area_id` (nueva columna nullable, FK a `areas.id`, con CHECK/trigger o validación en aplicación de que solo aplica cuando `role = 'PLANNER'`).

## 9. API / Backend

Nueva función central de resolución de scope en `api/_lib/auth.js` (p.ej. `resolveAccessScope(membership)`) que devuelve el filtro aplicable (`{type: 'ORGANIZATION'}` | `{type: 'AREA', areaId}` | `{type: 'SELF', employeeId}`). Cada endpoint de lectura/escritura de empleados/imports/shifts debe consumir este filtro, nunca reimplementarlo localmente.

## 10. Frontend / UX

Al asignar rol `PLANNER`, mostrar selector opcional de área (vacío = organización completa).

## 11. Seguridad y autorización

Este es el núcleo de seguridad de la microfase: todo endpoint mutante debe aplicar el filtro de scope en la query, no solo en la UI (master-prompt sección 25). Ningún endpoint puede devolver o modificar datos fuera del scope resuelto del usuario autenticado.

## 12. i18n

Textos del selector de área en asignación de rol.

## 13. Accesibilidad

Selector de área accesible por teclado.

## 14. Responsive / temas

Selector debe integrarse en `MembersModal.tsx` existente, respetando light/dark.

## 15. Observabilidad / errores

403 explícito y distinguible (no genérico) cuando una petición cae fuera de scope, para facilitar diagnóstico en R2-M11 (E2E de aislamiento).

## 16. Migraciones

Nueva migración: añade `memberships.scoped_area_id`.

## 17. Compatibilidad y datos existentes

Memberships existentes (`ADMIN`/`EMPLOYEE` previas al backfill de R2-M06) no tienen `scoped_area_id` — por defecto NULL, comportamiento equivalente a `ORGANIZATION`/`SELF` según su rol resultante, sin regresión.

## 18. Tasks

### T01 — Migración: columna scoped_area_id

Objetivo: Soportar scope AREA para PLANNER.
Archivos / módulos probables: `db/migrations/0015_membership_scoped_area.sql`.
Cambios: `ALTER TABLE memberships ADD COLUMN scoped_area_id ...`.
No hacer: No hacer la columna NOT NULL.
Criterios de aceptación:
- [x] Migración aplica limpiamente.
- [x] FK a `areas.id` válida, nullable.
Tests: migration test.
Evidencia esperada: resultado de migración.

### T02 — Función central resolveAccessScope

Objetivo: Único punto de resolución de scope.
Archivos / módulos probables: `api/_lib/auth.js`.
Cambios: Nueva función pura, sin efectos secundarios, testeable de forma aislada.
No hacer: No duplicar lógica de scope en cada endpoint.
Criterios de aceptación:
- [x] Devuelve el filtro correcto para cada combinación rol/scoped_area_id.
Tests: unit test exhaustivo de la función (todas las combinaciones rol × scope).
Evidencia esperada: resultado de tests.

### T03 — Aplicar scope en endpoints de empleados/imports/shifts

Objetivo: Filtrar resultados y validar mutaciones según scope resuelto.
Archivos / módulos probables: `api/employees/*`, `api/imports/*`, `api/_lib/data.js`.
Cambios: Cada query relevante incorpora el filtro de `resolveAccessScope`.
No hacer: No confiar en filtrado solo en frontend.
Criterios de aceptación:
- [x] PLANNER con scope AREA no puede leer ni escribir datos de otra área.
- [x] EMPLOYEE con scope SELF no puede leer ni escribir datos de otro empleado.
Tests: integration test por endpoint y por combinación de scope.
Evidencia esperada: resultado de tests.

### T04 — UI de asignación de área a PLANNER

Objetivo: Permitir asignar/editar `scoped_area_id` desde gestión de miembros.
Archivos / módulos probables: `MembersModal.tsx`.
Cambios: Selector opcional de área al asignar rol PLANNER.
No hacer: No mostrar el selector para roles distintos de PLANNER.
Criterios de aceptación:
- [x] Selector visible solo para PLANNER.
- [x] Guardar sin selección deja scope ORGANIZATION.
Tests: test de componente.
Evidencia esperada: resultado de test.

## 19. Tests obligatorios

unit (resolveAccessScope), integration (endpoints por scope), component (UI selector).

## 20. Evidencias

Resultados de tests T01-T04 y validación de datos de Neon dev:

- `node --env-file=.env.development.local db/migrate.mjs` → `apply 0015_membership_scoped_area.sql (6 statements)`, `done`, `migrations up to date`.
- Neon dev confirma `memberships.scoped_area_id` como `UUID NULL`, el constraint `memberships_scoped_area_role_check`, el índice `memberships_scoped_area_idx` y cero scopes huérfanos o asignados a roles distintos de `PLANNER`.
- `resolveAccessScope` cubre OWNER/ADMIN, PLANNER organization/area y EMPLOYEE self; los casos inválidos fallan cerrado con `403 SCOPE_UNAVAILABLE`.
- `npx vitest run api/_lib/auth.test.js api/_lib/data.test.js api/_lib/scope.test.js db/migrations.test.mjs src/components/shift-dashboard/MembersModal.test.tsx` → **5 archivos, 167 tests PASS**.
- `npm test` → **98 archivos, 1011 tests PASS**.
- `npm run lint` → PASS.
- `npm run build` → PASS; warning no bloqueante ya conocido por chunks grandes de PDF/XLSX.
- `git diff --check` → PASS.

## 21. Gate

Gates requeridos: G3 (Domain invariants), G4 (API/authorization).

Resultado: **PASS**. No se observaron fugas de área ni de empleado en los recursos cubiertos; los errores de scope son explícitos y no dependen de la UI.

## 22. Rollback / remediación

Si algún endpoint no aplica el filtro correctamente, es bloqueante para Gate — no se permite PASS_WITH_WARNINGS en fugas de scope (afecta seguridad, prohibido por master-prompt sección 9).

## 23. Criterio de DONE

`resolveAccessScope` implementada y testeada exhaustivamente; todos los endpoints de empleados/imports/shifts aplican el filtro; UI de asignación de área funcional.
