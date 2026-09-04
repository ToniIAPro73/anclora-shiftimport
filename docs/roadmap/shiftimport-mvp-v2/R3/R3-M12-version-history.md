# R3-M12 — Version History

STATUS: DONE — PASS

## 1. Objetivo
API + UI de solo lectura para ver todas las `ScheduleVersion` de un `Schedule` (histórico de drafts/publicaciones) con quién publicó y cuándo.

## 2. Problema que resuelve
Da trazabilidad ("qué se planificó y cuándo cambió") equivalente al Import History ya existente (migración 0010) pero para el dominio Scheduling.

## 3. Estado actual del repositorio
IMPLEMENTED. El backend lista todas las versiones tenant-scoped con metadata de creación/publicación y la UI permite abrir cualquier versión en modo solo lectura.

## 4. Alcance IN
- `GET /api/schedules/:scheduleId/versions` — lista todas las versiones (número, estado, creador, fecha creación, publicador, fecha publicación).
- Vista de UI simple (tabla, no grid) listando el histórico, con link para ver assignments de una versión concreta en modo solo lectura.

## 5. Alcance OUT
Diff visual entre versiones (comparar qué cambió assignment a assignment) — no requerido para MVP, se puede añadir post-piloto si hay demanda real.

## 6. Dependencias
R3-M11.

## 7. Decisiones arquitectónicas
Reutiliza el patrón visual de import history ya existente en el producto en lugar de inventar uno nuevo (consistencia de UX, §22 del prompt maestro).

## 8. Modelo de datos afectado
Ninguno — solo lectura de `schedule_versions` existente.

## 9. API / Backend
`GET /api/schedules/:scheduleId/versions` → 200 `[{ id, scheduleId, versionNumber, status, createdByUserId, createdAt, publishedByUserId, publishedAt }]`.

## 10. Frontend / UX
Tabla de historial accesible desde `WeeklyPlanner`, estado empty si solo existe la versión actual.

## 11. Seguridad y autorización
Mismo scope que lectura de assignments — PLANNER+ del área/organización; EMPLOYEE no tiene acceso a este endpoint (no es su dato, §SELF scope).

## 12. i18n
Textos nuevos en ES/EN.

## 13. Accesibilidad
Tabla semántica, mismo estándar que R3-M09.

## 14. Responsive / temas
Verificado dark/light.

## 15. Observabilidad / errores
N/A adicional — endpoint de solo lectura, errores estándar (403/404).

## 16. Migraciones
N/A.

## 17. Compatibilidad y datos existentes
N/A.

## 18. Tasks

### T01 — Endpoint de listado de versiones
Objetivo: implementar `GET .../versions`.
Archivos / módulos probables: `api/schedules/[scheduleId]/versions/index.js`.
Cambios: nuevo handler de lectura.
No hacer: no incluir los assignments completos en el listado (solo metadata de versión, para mantener el payload ligero — el detalle de assignments se pide aparte, ya existe desde R3-M08 T01).
Criterios de aceptación:
- [x] Devuelve todas las versiones ordenadas por version_number descendente.
Tests: integración.
Evidencia esperada: resultado de test.

### T02 — UI de historial
Objetivo: tabla de versiones accesible desde `WeeklyPlanner`.
Archivos / módulos probables: `src/components/scheduling/ScheduleVersionHistory.tsx` (nuevo).
Cambios: componente nuevo.
No hacer: no implementar diff entre versiones en esta microfase.
Criterios de aceptación:
- [x] Lista visible con estado empty correcto para schedules con una sola versión.
Tests: component test.
Evidencia esperada: test en PASS.

## 19. Tests obligatorios
`API`, `integration`, `unit/component`.

## 20. Evidencias
Implementación:
- `api/_lib/scheduling.js` + `api/schedules/[scheduleId]/versions/index.js`: listado completo ordenado por `version_number DESC`, con creador/publicador y autorización PLANNER+ tenant/area scoped.
- `src/components/scheduling/ScheduleVersionHistory.tsx`: tabla semántica con estado, timestamps y acción de consulta.
- `src/components/scheduling/WeeklyPlanner.tsx`: modal de historial y carga de una versión concreta en modo solo lectura, con retorno a la versión actual.
- `src/lib/remote.ts` + `src/lib/i18n.ts` + `src/index.css`: cliente, ES/EN y responsive horizontal para la tabla.

Validación:
- `api/schedules/history.test.js`: 3 tests PASS, incluyendo orden/metadata, aislamiento por área y validación UUID.
- `api/schedules/assignments.test.js`, `api/schedules/new-draft.test.js`: regresión de locking/fork PASS.
- `src/components/scheduling/WeeklyPlanner.test.tsx`: historial abre, muestra metadata y carga versión anterior en modo solo lectura.
- `npm test`: 107 archivos PASS, 1.069 tests PASS (19,18 s).
- `npm run lint`, `npm run build`, `git diff --check`: PASS; permanece el warning conocido de chunks >500 kB.

## 21. Gate
Gates requeridos: **G2**, **G10**.

Resultado ejecutado: **PASS**.

- G2 — PASS: reutiliza tablas existentes, sin migración nueva; endpoint retorna metadata completa y ordenada.
- G10 — PASS: API, componente, regresión, lint, build y diff check PASS.

## 22. Rollback / remediación
Bajo riesgo — funcionalidad de solo lectura, remediación trivial en caso de fallo.

## 23. Criterio de DONE
Endpoint y UI de historial operativos, Gate G2+G10 PASS. Commit pendiente de registro.
