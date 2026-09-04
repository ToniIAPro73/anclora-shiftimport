# R2-M11 — Cross-Tenant Isolation E2E

STATUS: DONE — PASS

## 1. Objetivo

Construir una suite E2E dedicada que demuestre, con dos organizaciones reales (Org A / Org B), que ningún dato ni acción de una es visible o mutable desde la otra bajo ningún rol.

## 2. Problema que resuelve

El scoping por `organization_id` existe a nivel de esquema y de queries individuales, pero nunca se ha verificado de extremo a extremo (browser → API → DB → respuesta) que no exista una fuga cross-tenant en ningún endpoint.

## 3. Estado actual del repositorio

`qa/e2e-acceptance/` contiene specs E2E existentes, centrados en ingestión. Se añadió un spec dedicado a aislamiento cross-tenant y una fixture sintética con dos organizaciones, cuatro roles, áreas y recursos tenant-scoped.

## 4. Alcance IN

- Fixture de dos organizaciones (Org A, Org B) con usuarios en cada rol (OWNER/ADMIN/PLANNER/EMPLOYEE) tras R2-M06/M07.
- Para cada combinación relevante, intentar leer/escribir datos de la organización ajena vía API directamente (no solo vía UI) y confirmar rechazo (401/403, nunca 200 con datos ajenos).
- Cobertura mínima: empleados, áreas, imports, shifts, miembros, auditoría (R2-M09).

## 5. Alcance OUT

No cubre dominios aún no construidos (scheduling, portal, approval) — se extenderá en R3-M13, R4, R5-M09 respectivamente cuando existan.

## 6. Dependencias

R2-M08.

## 7. Decisiones arquitectónicas

La suite ataca la API directamente (no solo el flujo de UI) porque el master-prompt exige que la UI nunca sea la única barrera — un intento de fuga vía API directa es la prueba real de que el backend, no solo el frontend, aplica el aislamiento.

## 8. Modelo de datos afectado

N/A — motivo: microfase de test, no modifica esquema; usa fixtures de datos de prueba sin PII real.

## 9. API / Backend

N/A — motivo: no se modifican endpoints en esta microfase; cualquier fuga encontrada se deriva como bug bloqueante a corregir antes de declarar Gate PASS.

## 10. Frontend / UX

N/A — motivo: la suite opera principalmente contra la API; opcionalmente se añade un caso UI de confirmación (login como Org B, confirmar que no aparece dato de Org A en ninguna vista).

## 11. Seguridad y autorización

Núcleo de la microfase — ver Alcance IN.

## 12. i18n

N/A — motivo: sin cambios de UI.

## 13. Accesibilidad

N/A — motivo: sin cambios de UI.

## 14. Responsive / temas

N/A — motivo: sin cambios de UI.

## 15. Observabilidad / errores

Confirmar que los rechazos por aislamiento son 403 (autorización) o 404 (no encontrado, si se prefiere no revelar existencia del recurso) de forma consistente, nunca 200 con datos ajenos ni 500.

## 16. Migraciones

N/A — motivo: ninguna migración nueva.

## 17. Compatibilidad y datos existentes

N/A — motivo: suite de test sobre fixtures dedicadas, no sobre datos de producción.

## 18. Tasks

### T01 — Fixture de dos organizaciones con los 4 roles

Objetivo: Datos de prueba reutilizables para toda la suite.
Archivos / módulos probables: `qa/e2e-acceptance/fixtures/` o equivalente.
Cambios: Nuevo fixture, sin PII real.
No hacer: No reutilizar datos de organizaciones reales.
Criterios de aceptación:
- [x] Fixture crea Org A y Org B con usuarios en los 4 roles, áreas y recursos sintéticos separados.
Tests: N/A — es el fixture en sí.
Evidencia esperada: fixture versionado.

### T02 — Matriz de intentos de fuga API-directa

Objetivo: Para cada rol de Org A, intentar acceder a cada tipo de recurso de Org B.
Archivos / módulos probables: nuevo spec en `qa/e2e-acceptance/specs-local/cross-tenant-isolation.spec.ts`.
Cambios: Nuevo spec E2E.
No hacer: No limitarse a probar solo el rol ADMIN — cubrir los 4 roles.
Criterios de aceptación:
- [x] Ningún intento devuelve datos de la organización ajena.
- [x] Todos los rechazos son 401/403/404, nunca 200 con datos cruzados.
Tests: el propio spec E2E.
Evidencia esperada: resultado de ejecución del spec.

### T03 — Caso UI de confirmación

Objetivo: Confirmar visualmente que un login en Org B no muestra datos de Org A.
Archivos / módulos probables: mismo spec o uno complementario, usando agent-browser o Playwright según convención existente en `qa/e2e-acceptance/`.
Cambios: Caso adicional.
No hacer: No sustituir la verificación de API por esta — es complementaria.
Criterios de aceptación:
- [x] La comprobación UI confirma que la vista de Org A no muestra datos de Org B.
Tests: el propio spec.
Evidencia esperada: captura de pantalla + resultado de spec.

## 19. Tests obligatorios

E2E dedicado (T02, T03).

## 20. Evidencias

Resultado de ejecución: `npx playwright test --config playwright.local.config.ts cross-tenant-isolation.spec.ts` → `5 passed (1.1m)`. El ciclo real de Neon dev informó `[e2e] fixtures seeded` y `[e2e] fixtures removed`. T03 generó screenshot en el output de Playwright (`org-a-isolation.png`).

## 21. Gate

Gates requeridos: G11 (E2E), G12 (Security), G13 (Regression).

- G11 — PASS: 5/5 pruebas E2E del spec dedicado.
- G12 — PASS: no hubo respuestas 200 con datos cross-tenant; las mutaciones ajenas fueron rechazadas.
- G13 — PASS: seed/teardown y ejecución completa terminaron sin errores.
- Gate final — PASS.

## 22. Rollback / remediación

Cualquier fuga encontrada es bloqueante — no se declara Gate PASS ni PASS_WITH_WARNINGS (afecta seguridad, prohibido por master-prompt sección 9). La ejecución verde no requirió remediación de endpoints; los dos fallos iniciales pertenecían a expectativas incorrectas del test y fueron corregidos tras confirmar el comportamiento del backend.

## 23. Criterio de DONE

DONE: fixture y suite ejecutados contra `vercel dev` autenticado; G11/G12/G13 PASS. Commit: `d532de3`.
