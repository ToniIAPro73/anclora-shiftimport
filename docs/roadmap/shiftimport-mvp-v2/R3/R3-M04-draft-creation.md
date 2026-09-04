# R3-M04 — Draft Creation

STATUS: DONE — PASS

## 1. Objetivo
API para crear un `Schedule` (si no existe) y su primer `ScheduleVersion` en estado DRAFT para una organización/área/periodo.

## 2. Problema que resuelve
Primer punto de entrada operativo del dominio Scheduling: sin esto no hay forma de empezar a planificar.

## 3. Estado actual del repositorio
MISSING. Depende de R3-M01/M02/M03 (schema completo: migraciones `0017`–`0019`). El esquema y el router real usan UUID.

## 4. Alcance IN
- `POST /api/schedules` — crea (o reutiliza) `Schedule` para org+area+period y crea su `ScheduleVersion` DRAFT (version_number=1, o siguiente si ya hay versiones previas publicadas).
- Validación: rechaza crear un segundo DRAFT si ya existe uno activo para ese schedule (409, mensaje claro).

## 5. Alcance OUT
Edición de assignments (R3-M05). Publicación (R3-M10).

## 6. Dependencias
R3-M01, R3-M02, R3-M03, R2-M08 (API authorization enforcement) para el guard de rol.

## 7. Decisiones arquitectónicas
Sigue el patrón de rutas existente (`api/employees/index.js`, `api/imports/index.js`): archivo nuevo `api/schedules/index.js` con handler por método HTTP. Reutiliza `api/_lib/auth.js` para sesión + rol y el módulo nuevo `api/_lib/scheduling.js`, según la decisión de R0-M05 de mantener los dominios nuevos fuera de `data.js`.

## 8. Modelo de datos afectado
Ninguno nuevo — usa `schedules` y `schedule_versions` de R3-M01/M02.

## 9. API / Backend
`POST /api/schedules`
Body: `{ areaId?: string(UUID), periodStart: string(ISO date, lunes) }`
Respuesta 201: `{ scheduleId, scheduleVersionId, versionNumber: 1, status: 'DRAFT' }`
Respuesta 409: si ya existe DRAFT activo para ese schedule.
Guard: rol PLANNER o superior, scope ORGANIZATION o AREA coincidente con `areaId` si se especifica.

## 10. Frontend / UX
N/A en esta microfase — el planner UI es R3-M08.

## 11. Seguridad y autorización
Server-side: verificar membership activo, rol PLANNER+, y si `areaId` se pasa, verificar que el usuario tiene scope sobre esa área (no confiar en que el frontend solo muestre áreas permitidas — §25 del prompt maestro).

## 12. i18n
Los errores API llevan códigos estables (`SCHEDULE_DRAFT_EXISTS`, `SCOPE_FORBIDDEN`) para que la UI futura los traduzca mediante `src/lib/i18n.ts`; esta microfase no introduce UI ni copy visible.

## 13. Accesibilidad
N/A — sin UI en esta microfase.

## 14. Responsive / temas
N/A.

## 15. Observabilidad / errores
Respuestas de error estructuradas (código + mensaje), consistente con el resto de `api/*` (ver manejo de errores en `api/imports/index.js` como referencia de patrón).

## 16. Migraciones
N/A — sin cambios de schema en esta microfase.

## 17. Compatibilidad y datos existentes
N/A — funcionalidad nueva y aislada.

## 18. Tasks

### T01 — Handler `POST /api/schedules`
Objetivo: implementar creación de Schedule+DraftVersion con validación de DRAFT único.
Archivos / módulos probables: `api/schedules/index.js` (nuevo), `api/_lib/data.js` o `api/_lib/scheduling.js`.
Cambios: nuevo endpoint + función de datos con transacción (crear schedule si no existe + crear version en una sola transacción).
No hacer: no crear assignments en este endpoint (responsabilidad de R3-M05).
Criterios de aceptación:
- [x] Segunda llamada con mismo org+area+period reutiliza el `Schedule` existente.
- [x] Llamada mientras hay DRAFT activo devuelve 409 con mensaje claro.
- [x] Usuario sin rol PLANNER+ recibe 403.
Tests: test de integración API cubriendo creación, reutilización, conflicto de DRAFT duplicado, y rechazo por rol.
Evidencia esperada: resultados de test de integración adjuntos.

## 19. Tests obligatorios
`API`, `integration`.

## 20. Evidencias
- `npx vitest run api/schedules/index.test.js`: **1 file passed, 6 tests passed**.
- `npx playwright test --config playwright.local.config.ts specs-local/scheduling-draft.spec.ts` desde `qa/e2e-acceptance`: **2 passed (21.2s)** contra `vercel dev` + Neon dev; seed y teardown completados.
- `npm test`: **101 files passed, 1035 tests passed**.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- Respuesta 201: `{ scheduleId, scheduleVersionId, versionNumber: 1, status: 'DRAFT' }`.
- Respuesta 409: `{ error: 'A draft already exists for this schedule', code: 'SCHEDULE_DRAFT_EXISTS' }`.
- Scope AREA: un planner limitado al área no puede crear un schedule global; recibe 403 `SCOPE_FORBIDDEN`.
- Cleanup E2E: las organizaciones y usuarios de fixture se eliminaron; no se dejaron schedules/versiones de prueba.

## 21. Gate
Gates requeridos: **G4** (API/authorization), **G5** (Functional), **G10** (Unit/integration tests).

Resultado ejecutado: **PASS**.

- G4 API/authorization: PASS — sesión, rol PLANNER+ y scope ORGANIZATION/AREA se validan server-side.
- G5 Functional: PASS — creación, reutilización de Schedule y conflicto por DRAFT cubiertos en unit/integration y E2E real.
- G10 Unit/integration: PASS — suite específica y suite completa en verde.

## 22. Rollback / remediación
Si el Gate falla por bug de autorización: no exponer el endpoint sin fix — revertir el commit del endpoint antes que dejarlo accesible sin guard correcto.

## 23. Criterio de DONE
Endpoint operativo, guards verificados por test, Gate G4+G5+G10 PASS. Implementación: `4df1a5c`.
