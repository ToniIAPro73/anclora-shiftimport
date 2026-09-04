# R0-M03 — Authorization Model Baseline

## 1. Objetivo

Diseñar y documentar el modelo RBAC objetivo (OWNER/ADMIN/PLANNER/EMPLOYEE × ORGANIZATION/AREA/SELF) como spec de migración desde el modelo actual de 2 roles (ADMIN/EMPLOYEE), incluyendo una regla de backfill de OWNER explícita y aprobada. Esta microfase es de **diseño y migración de esquema/datos**, no de implementación de UI de permisos (eso vive en R2-M06/M07/M08).

## 2. Problema que resuelve

`memberships.role` tiene hoy un CHECK constraint que solo permite `ADMIN`/`EMPLOYEE` (migración 0007, que ya eliminó `MANAGER`). El roadmap objetivo requiere 4 roles y 3 scopes. Pasar de 2 a 4 roles no es aditivo: cada membership `ADMIN` existente debe decidir si se convierte en `OWNER`, se queda `ADMIN`, o se convierte en `PLANNER` — y eso requiere una regla de backfill explícita, no una migración automática arbitraria.

## 3. Estado actual del repositorio

`api/_lib/auth.js:163-165` implementa el guard de rol con solo dos valores. `memberships` (migración 0001, alterada en 0007) es la tabla afectada. No existe columna de scope (`ORGANIZATION`/`AREA`/`SELF`) en ningún lado hoy — toda autorización actual es binaria admin-vs-empleado a nivel de organización completa.

## 4. Alcance IN

- Diseñar el nuevo CHECK constraint: `role IN ('OWNER','ADMIN','PLANNER','EMPLOYEE')`.
- Diseñar el modelo de scope: columna o tabla adicional que exprese `ORGANIZATION` (toda la org), `AREA` (limitado a áreas concretas), `SELF` (solo su propio registro de empleado) por membership.
- Definir y documentar la **regla de backfill de OWNER**: propuesta por defecto — la membership `ADMIN` con el `created_at` más antiguo dentro de cada organización se convierte en `OWNER`; el resto de `ADMIN` existentes permanecen `ADMIN`. Esta regla requiere sign-off de producto antes de ejecutarse en R2-M06 (aquí solo se documenta y se deja preparada, no se ejecuta la migración de datos todavía).
- Especificar semántica de cada rol: `OWNER` (control total, incluye borrar la organización), `ADMIN` (gestión operativa completa salvo las acciones reservadas a OWNER), `PLANNER` (gestión de turnos/importaciones dentro de su alcance, sin gestión de usuarios/organización), `EMPLOYEE` (solo su propio scope SELF).
- Escribir la migración SQL de esquema (constraint + columna/tabla de scope) como diseño listo para ejecutar en R2-M06, pero **no ejecutarla en esta microfase** (R0 es diseño, R2 es implementación).

## 5. Alcance OUT

- No implementar el guard de autorización en `api/_lib/auth.js` con los 4 roles (eso es R2-M08).
- No construir UI de gestión de roles (eso es R2-M06/M10).
- No ejecutar la migración SQL contra la base de datos real (solo se escribe y se revisa; ejecución en R2-M06).
- No introducir `TEAM` ni `WORK_CENTER` scope, ni editor de capabilities custom, ni delegación — explícitamente fuera del MVP según master prompt §13.

## 6. Dependencias

R0-M02 (glosario debe fijar el vocabulario Membership/Role/Scope antes de diseñar el modelo).

## 7. Decisiones arquitectónicas

- Scope se modela como columna(s) adicionales en `memberships` (p.ej. `scope_type CHECK IN ('ORGANIZATION','AREA','SELF')` + `scope_area_id` nullable cuando `scope_type='AREA'`) en vez de una tabla de permisos separada — evita over-engineering para un MVP de 4 roles × 3 scopes fijos, sin editor custom.
- Regla de backfill de OWNER: **la membership ADMIN con `created_at` mínimo por organización se convierte en OWNER**. Justificación: es la aproximación más segura a "quien creó/fundó la organización" sin necesitar un campo `founder` que no existe hoy. Requiere confirmación de producto antes de ejecutarse (bloqueante para R2-M06, no para esta microfase de diseño).
- Si una organización no tiene ningún ADMIN (caso borde), no se autogenera OWNER — se marca como excepción para revisión manual antes de ejecutar la migración de datos en R2-M06.

## 8. Modelo de datos afectado

`memberships`: alterar CHECK constraint de `role`; añadir columna(s) de scope. Diseño de migración SQL incluido en este documento (T05), pero **no ejecutado** hasta R2-M06.

## 9. API / Backend

N/A en esta microfase — el guard de `api/_lib/auth.js` se actualiza en R2-M08. Aquí solo se documenta el contrato que ese guard deberá implementar.

## 10. Frontend / UX

N/A en esta microfase — UI de gestión de roles es R2-M06/M10.

## 11. Seguridad y autorización

Este es el propio objeto de la microfase: diseñar el modelo de autorización. Regla dura a preservar en R2-M08: la UI nunca es la única barrera — todo endpoint debe validar rol+scope en backend.

## 12. i18n

N/A — motivo: microfase de diseño de esquema, sin strings de usuario todavía (los labels de rol se traducen en R2-M06).

## 13. Accesibilidad

N/A — motivo: no hay UI en esta microfase.

## 14. Responsive / temas

N/A — motivo: no hay UI en esta microfase.

## 15. Observabilidad / errores

N/A — motivo: sin código ejecutable en esta microfase; observabilidad de autorización se define en R2-M08/M09.

## 16. Migraciones

Migración SQL de esquema **diseñada aquí, ejecutada en R2-M06**: nuevo CHECK constraint en `memberships.role` + columnas de scope. Debe ser forward-safe: los valores actuales `ADMIN`/`EMPLOYEE` siguen siendo válidos bajo el nuevo constraint (superset), por lo que la migración de esquema es no destructiva por sí sola; el riesgo está en el backfill de datos (decidir quién pasa a OWNER), que se ejecuta como paso de datos separado y documentado, no como parte del DDL.

## 17. Compatibilidad y datos existentes

Todo membership `ADMIN`/`EMPLOYEE` existente sigue siendo válido tras el nuevo constraint sin cambios (no rompe nada por defecto). El backfill de OWNER es un UPDATE explícito y auditable, ejecutado en R2-M06 con evidencia de antes/después.

## 18. Tasks

### T01 — Documentar semántica de los 4 roles y 3 scopes

Objetivo: Definir con precisión qué puede hacer cada rol en cada scope.

Archivos / módulos probables: nuevo documento `docs/roadmap/shiftimport-mvp-v2/R0/RBAC-MODEL.md`.

Cambios: Documento nuevo con matriz rol×scope×acción.

No hacer: No incluir TEAM/WORK_CENTER scope ni roles custom.

Criterios de aceptación:
- [ ] Matriz completa OWNER/ADMIN/PLANNER/EMPLOYEE × ORGANIZATION/AREA/SELF con acciones permitidas.

Tests: N/A.

Evidencia esperada: `RBAC-MODEL.md`.

### T02 — Diseñar regla de backfill de OWNER

Objetivo: Regla determinista y auditable para asignar OWNER a memberships existentes.

Archivos / módulos probables: `RBAC-MODEL.md`, referencia a `memberships.created_at`.

Cambios: Sección "OWNER backfill rule" con regla, casos borde (org sin ADMIN) y marca de "requiere sign-off de producto".

No hacer: No ejecutar el UPDATE contra la base de datos en esta microfase.

Criterios de aceptación:
- [ ] Regla documentada: ADMIN con `created_at` mínimo por organización → OWNER.
- [ ] Caso borde "organización sin ADMIN" documentado como excepción manual.
- [ ] Marca explícita de pendiente de sign-off de producto antes de R2-M06.

Tests: N/A.

Evidencia esperada: Sección "OWNER backfill rule" en `RBAC-MODEL.md`.

### T03 — Diseñar modelo de columnas de scope

Objetivo: Especificar `scope_type` y `scope_area_id` (o equivalente) en `memberships`.

Archivos / módulos probables: `RBAC-MODEL.md`, referencia a `db/migrations/`.

Cambios: Diseño de columnas, constraints, índices.

No hacer: No crear el archivo de migración SQL ejecutable todavía (eso es T05, como diseño de referencia, no ejecución).

Criterios de aceptación:
- [ ] Columnas y constraints especificados con tipos y reglas de nulidad.

Tests: N/A.

Evidencia esperada: Sección "Scope model" en `RBAC-MODEL.md`.

### T04 — Especificar contrato del guard de autorización futuro

Objetivo: Documentar la firma/contrato que `api/_lib/auth.js` deberá implementar en R2-M08 (sin implementarlo aquí).

Archivos / módulos probables: `RBAC-MODEL.md`.

Cambios: Pseudocódigo de contrato (rol mínimo requerido + scope requerido por endpoint).

No hacer: No tocar `api/_lib/auth.js` en esta microfase.

Criterios de aceptación:
- [ ] Contrato de guard documentado como referencia para R2-M08.

Tests: N/A.

Evidencia esperada: Sección "Future guard contract" en `RBAC-MODEL.md`.

### T05 — Redactar migración SQL de diseño (no ejecutada)

Objetivo: Dejar lista la migración de esquema (constraint + columnas de scope) como borrador para R2-M06.

Archivos / módulos probables: borrador en `RBAC-MODEL.md` (no en `db/migrations/` todavía — evita numeración prematura de migración real).

Cambios: SQL de referencia, marcado explícitamente "DRAFT — to be executed in R2-M06".

No hacer: No añadir el archivo a `db/migrations/` ni ejecutarlo contra Neon.

Criterios de aceptación:
- [ ] SQL de constraint + columnas de scope, forward-safe, incluido como draft.

Tests: N/A.

Evidencia esperada: Bloque SQL en `RBAC-MODEL.md`.

### T06 — Validar impacto sobre `api/_lib/data.js`

Objetivo: Identificar qué funciones de `data.js` (1524 líneas) tocan `memberships.role` hoy, para que R2-M08 sepa qué actualizar.

Archivos / módulos probables: `api/_lib/data.js`.

Cambios: Ninguno — solo listado de funciones afectadas.

No hacer: No modificar `data.js` en esta microfase.

Criterios de aceptación:
- [ ] Lista de funciones que leen/escriben `memberships.role` con file:line.

Tests: N/A.

Evidencia esperada: Lista en `RBAC-MODEL.md`, sección "Impacted call sites".

### T07 — Revisión de coherencia con R0-M02 (glosario)

Objetivo: Confirmar que los términos Role/Scope usados coinciden con el glosario.

Archivos / módulos probables: `RBAC-MODEL.md`, `DOMAIN-GLOSSARY.md`.

Cambios: Ajustes de término si hace falta.

No hacer: No redefinir el glosario aquí.

Criterios de aceptación:
- [ ] Sin discrepancias terminológicas.

Tests: N/A.

Evidencia esperada: Confirmación en resumen.

### T08 — Checklist de sign-off pendiente

Objetivo: Dejar explícito qué decisión requiere aprobación humana antes de que R2-M06 pueda ejecutar el backfill.

Archivos / módulos probables: `RBAC-MODEL.md`.

Cambios: Sección final "Pending sign-off before R2-M06 execution".

No hacer: No marcar como aprobado sin confirmación real del usuario/producto.

Criterios de aceptación:
- [ ] Sección de sign-off pendiente presente y clara.

Tests: N/A.

Evidencia esperada: Sección visible en `RBAC-MODEL.md`.

## 19. Tests obligatorios

N/A — motivo: microfase de diseño de esquema, no hay código ejecutable ni migración aplicada todavía.

## 20. Evidencias

`RBAC-MODEL.md` completo (matriz de roles, regla de backfill, modelo de scope, contrato de guard futuro, SQL draft, lista de call-sites impactados, sign-off pendiente).

## 21. Gate

Gates requeridos: **G1 (Architecture)**, **G2 (Database/migrations — como diseño, no ejecución)**, **G3 (Domain invariants)**, **G4 (API/authorization — como contrato, no implementación)**.

- G1: PASS si el modelo de 4 roles × 3 scopes está completamente especificado sin ambigüedad.
- G2: PASS si el SQL draft es forward-safe y no se ejecutó contra ninguna base de datos real en esta microfase.
- G3: PASS si la regla de backfill de OWNER es determinista y cubre el caso borde de organización sin ADMIN.
- G4: PASS si el contrato de guard futuro está documentado de forma implementable sin ambigüedad para R2-M08.

PASS_WITH_WARNINGS permitido únicamente si el sign-off de producto sobre la regla de OWNER sigue pendiente al cierre — el warning queda documentado en T08 y no bloquea porque R2-M06 (que sí ejecuta el backfill) explícitamente lo absorbe como su propio prerequisito de Gate.

## 22. Rollback / remediación

N/A para ejecución (nada se ejecuta). Si el diseño resulta incorrecto tras revisión, se corrige el documento y se repite el Gate — sin impacto en datos reales.

## 23. Criterio de DONE

`RBAC-MODEL.md` existe con: matriz de roles/scopes, regla de backfill de OWNER (con sign-off marcado pendiente o confirmado), modelo de columnas de scope, contrato de guard futuro, SQL draft no ejecutado, lista de call-sites impactados en `data.js`. R2-M06 puede empezar a implementar directamente desde este documento sin re-diseñar nada.
