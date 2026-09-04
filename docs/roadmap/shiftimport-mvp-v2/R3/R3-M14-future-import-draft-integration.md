# R3-M14 — Future Import → Draft Integration

STATUS: DONE — PASS

## 1. Objetivo

Integrar la confirmación de imports con fechas futuras en Scheduling: los
turnos futuros alimentan versiones `DRAFT` semanales y nunca se publican de
forma silenciosa.

## 2. Problema que resuelve

Safe Import estaba diseñado para histórico y escribía en `shifts` tras la
confirmación. Con Scheduling operativo, un archivo FUTURE o MIXED debe pasar
por planificación, con autorización server-side y rollback total.

## 3. Estado actual del repositorio

IMPLEMENTED. Histórico puro mantiene `/api/imports` + `/api/shifts`. FUTURE y
MIXED usan `POST /api/imports/confirm-split`.

## 4. Alcance IN

- Clasificación server-side por fecha de confirmación: `HISTORICAL`, `FUTURE`,
  `MIXED`.
- Endpoint único transaccional para FUTURE/MIXED.
- Persistencia histórica y futura atómica en mixed.
- Creación/reutilización de drafts por semana y área.
- Provenance persistente `shift_assignments.import_id`.
- Idempotencia por import + assignments + drafts.
- Capability efectiva de planificación mediante el guard canónico R2
  `requireRole(ctx, 'PLANNER')`, que conserva el mapping OWNER/ADMIN/PLANNER
  vigente en R2.
- Fail closed para tenant, scope AREA y capability insuficiente.
- Resumen Compare Stage con históricos confirmados y futuros en borrador.

## 5. Alcance OUT

- Publicar automáticamente un draft.
- Reescribir imports históricos existentes.
- Workflow de aprobación.
- Tabla de asociación Import↔ScheduleVersion.

## 6. Dependencias

R1-M16, R3-M04, R3-M05, R3-M13 y migraciones R3-M01..M03.

## 7. Decisiones arquitectónicas

### Cardinalidad de provenance

No se introduce `imports.schedule_version_id`. Un Import puede alimentar varias
semanas y, por tanto, varias `ScheduleVersions`; la relación elegida es
`shift_assignments.import_id`, que permite consultar todos los assignments
futuros originados por un Import sin falsear la cardinalidad ni añadir una
tabla de asociación sin necesidad demostrada.

### Atomicidad

`confirmFutureImport` valida clasificación, employees, áreas, capability y
scope antes de escribir. Después ejecuta en una única `sql.transaction` la
creación/reutilización del Import, schedules/drafts, histórico, assignments,
borrados históricos y contadores. Cualquier excepción SQL revierte todo.

### Autorización

No se usa `role === 'PLANNER'`. La capability se resuelve con el guard R2
`requireRole(ctx, 'PLANNER')`; no se añade una excepción específica para ADMIN.
La comprobación se ejecuta antes de abrir la transacción y se repite el scope
por cada employee/assignment futuro.

## 8. Modelo de datos afectado

`db/migrations/0021_shift_assignments_import_id.sql` añade la FK nullable:

```text
shift_assignments.import_id → imports.id ON DELETE SET NULL
```

Se añade `shift_assignments_import_idx`. No se modifica `imports` con una FK
singular a ScheduleVersion.

## 9. API / Backend

`POST /api/imports/confirm-split` acepta metadata del import, `shifts`,
`employeeId`, `areaId` y `deleteIds`. Devuelve clasificación, Import, drafts,
counts de histórico/futuro e indicador de deduplicación.

- Histórico puro: el endpoint devuelve `HISTORICAL_IMPORT_USE_SAFE_PATH`; el
  flujo anterior permanece como contrato compatible.
- FUTURE/MIXED sin planning capability: `403` con
  `FUTURE_IMPORT_REQUIRES_PLANNING`, cero writes.
- Fuera de tenant/scope: `403`, cero writes, sin import parcial.

## 10. Frontend / UX

`ImportModal` muestra antes de confirmar los conteos de históricos confirmados
y futuros que irán a borrador no publicado. `App` enruta FUTURE/MIXED al
endpoint transaccional y no crea el historial por adelantado. El team import
también agrupa cualquier archivo con futuro en una sola llamada atómica.

## 11. Seguridad y autorización

La API obtiene organización y rol desde la sesión. Comprueba capability,
pertenencia de cada employee, estado activo, área y scope antes de persistir.
No se permite partial authorization: un MIXED no autorizado se rechaza entero.

## 12. i18n

Se añadieron mensajes ES/EN para conteos temporales, confirmación de drafts y
rechazo de planificación futura.

## 13. Accesibilidad

El resumen usa texto semántico visible dentro del Compare Stage y no depende de
color ni animación. Se conservan los controles existentes de teclado/focus.

## 14. Responsive / temas

Se reutiliza el layout responsive existente de ImportModal; los nuevos conteos
se envuelven en el contenedor flexible y funcionan en light/dark.

## 15. Observabilidad / errores

Los fallos transaccionales se registran por la capa API sin exponer detalles
SQL al usuario. Los errores de capability/scope tienen códigos estables para
feedback localizado. La respuesta expone `deduplicated` y counts reales.

## 16. Migraciones

Aplicada en Neon desarrollo:

```text
0021_shift_assignments_import_id.sql — applied
```

La migración es forward-safe, aditiva, idempotente y no altera imports ni
shifts históricos.

## 17. Compatibilidad y datos existentes

Los imports históricos siguen usando sus endpoints y semántica anteriores.
`shift_assignments.import_id` es nullable; assignments y shifts previos quedan
válidos sin backfill ni reescritura.

## 18. Tasks

### T01 — Decisión de provenance y capability

Estado: `[x]` `shift_assignments.import_id`; sin `imports.schedule_version_id`;
capability R2 mediante `requireRole(ctx, 'PLANNER')`.

### T02 — Clasificación temporal y Compare Stage

Estado: `[x]` clasificación server-side HISTORICAL/FUTURE/MIXED y desglose
visible antes de confirmar; histórico puro conserva su ruta.

### T03 — Confirmación transaccional

Estado: `[x]` endpoint único, drafts semanales, histórico mixed, provenance,
contadores e idempotencia dentro de una transacción.

### T04 — Integración frontend individual/team

Estado: `[x]` rutas FUTURE/MIXED desde `App`, `ImportModal` y
`TeamImportModal`; error localizado y no recuperación parcial.

### T05 — Gate de regresión

Estado: `[x]` tests unitarios, contratos de migración, E2E M14 y regresión E2E
local de los flujos afectados.

## 19. Tests obligatorios

- Unit/domain: clasificación temporal, capability sin transaction y fallo
  intermedio del wrapper transaccional.
- Database contract: migración 0021.
- Integration/API: import, drafts, assignments y provenance.
- E2E/security: scope AREA, tenant cruzado, rechazo sin capability e
  idempotencia.
- Regression: Vitest completa y batería local Playwright.

## 20. Evidencias

Gate específico M14:

- `api/imports/confirm-split.test.js`: 3 tests PASS.
- `db/migrations.test.mjs`: 19 tests PASS.
- Vitest completa: 109 archivos, 1084 tests PASS.
- E2E M14: 3 tests PASS.
- E2E de compatibilidad focalizada: 18 tests PASS.
- E2E de aislamiento cross-tenant aislada: 5 tests PASS.
- E2E de integridad de importación con PDF real: 1 test PASS.
- E2E real de rollback H: colisión `shifts_pkey` provocada después de iniciar
  la creación del draft; respuesta 500 y conteos de imports/schedules sin
  cambios.
- Verificación Neon desarrollo: columna `import_id` UUID nullable, índice
  `shift_assignments_import_idx` y migration 0021 aplicada.

Casos A–L:

| Caso | Resultado |
| --- | --- |
| A histórico puro autorizado | PASS — endpoints Safe Import existentes |
| B futuro con capability | PASS |
| C futuro sin capability | PASS — 403, cero writes |
| D mixed con capability | PASS atómico |
| E mixed sin capability | PASS — rechazo total, cero writes |
| F futuro multiweek | PASS — múltiples drafts |
| G mismo import repetido | PASS — mismo Import/drafts, assignments existentes |
| H fallo intermedio | PASS — rollback total |
| I AREA dentro de scope | PASS |
| J fuera de AREA | PASS — 403, cero writes |
| K tenant cruzado | PASS — 403, cero writes |
| L provenance `import_id` | PASS — visible en snapshot |

## 21. Gate

Gates requeridos: **G3**, **G4**, **G5**, **G10**, **G12**, **G13**, **G15**.

Resultado: **PASS**.

Commit de implementación: `a1dec5a` — `feat(import): complete R3-M14 future draft integration`.

- G3 — PASS: clasificación, drafts por semana, estados y provenance correctos.
- G4/G12 — PASS: capability, scope AREA y tenant enforced en backend.
- G5 — PASS: FUTURE/MIXED funcional y UX pre-confirmación clara.
- G10 — PASS: unit, migration contract y suite Vitest.
- G13 — PASS: histórico compatible; E2E M14 y regresión E2E focalizada de los
  flujos afectados.
- G15 — PASS: lint y build.

## 22. Rollback / remediación

No hubo remediación de datos. La única corrección durante validación fue
separar la creación de schedule y draft en dos queries de la misma transacción,
porque un CTE modificador no hacía visible el schedule recién insertado dentro
de la misma sentencia. La colisión inducida verificó posteriormente el rollback
total real.

## 23. Criterio de DONE

Split temporal operativo, autorización por capability/scope, operación FUTURE y
MIXED atómica, idempotencia, provenance persistente, compatibilidad histórica,
casos A–L y Gates G3/G4/G5/G10/G12/G13/G15 en PASS.
