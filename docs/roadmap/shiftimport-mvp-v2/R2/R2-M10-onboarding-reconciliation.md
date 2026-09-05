# R2-M10 — Onboarding Reconciliation

STATUS: DONE — PASS (complementado por `R2-M10-owner-employee-separation-remediation.md`)

## 1. Objetivo

Verificar y ajustar el flujo de onboarding (`api/onboarding.js`) para que asigne correctamente el rol `OWNER` al creador de una nueva organización tras R2-M06 y mantenga separado el registro `Employee` salvo opt-in explícito.

## 2. Problema que resuelve

Antes de R2-M06, el onboarding probablemente asignaba `ADMIN` al creador (único rol "alto" disponible). Tras ampliar a 4 roles, el creador de una organización nueva debe recibir `OWNER`, no `ADMIN`.

## 3. Estado actual del repositorio

`api/onboarding/onboarding.js` crea la organización inicial y su primera membership dentro de una transacción. Antes de esta microfase insertaba `role = 'ADMIN'`; tras R2-M06 el rol correcto para el creador es `OWNER`. La remediación posterior documentada en el anexo separa `OWNER` de `Employee`: sólo `ownerIsEmployee: true` crea el Employee vinculado.

## 4. Alcance IN

- Auditar `api/onboarding.js` para confirmar qué rol asigna hoy.
- Actualizar para asignar `OWNER` al creador tras R2-M06.
- Evitar que `adminName` o `employeeName` creen un Employee sin intención explícita.
- Test de regresión del flujo completo signup → organización creada → membership OWNER.

## 5. Alcance OUT

No se rediseña el flujo de onboarding más allá de la corrección de rol y la decisión explícita OWNER→Employee.

## 6. Dependencias

R2-M01, R2-M06.

## 7. Decisiones arquitectónicas

N/A — motivo: ejecuta la decisión ya tomada en R2-M06, no introduce ninguna nueva.

## 8. Modelo de datos afectado

N/A — motivo: sin cambio de esquema, solo de lógica de asignación en `api/onboarding.js`.

## 9. API / Backend

`api/onboarding.js` — ajustar valor de rol asignado en el `INSERT` de membership inicial.

## 10. Frontend / UX

El onboarding muestra un opt-in accesible y no seleccionado por defecto para indicar si el OWNER también trabajará como Employee.

## 11. Seguridad y autorización

N/A — motivo: cambio de valor por defecto, no de lógica de autorización.

## 12. i18n

Se añadieron las claves ES/EN del opt-in OWNER→Employee.

## 13. Accesibilidad

N/A — motivo: sin cambios de UI.

## 14. Responsive / temas

N/A — motivo: sin cambios de UI.

## 15. Observabilidad / errores

N/A — motivo: cambio de lógica interna sin nueva superficie de error.

## 16. Migraciones

N/A — motivo: no requiere migración de esquema, solo cambio de valor por defecto en código de aplicación.

## 17. Compatibilidad y datos existentes

No afecta organizaciones ya creadas (cubiertas por el backfill de R2-M06); solo afecta a organizaciones creadas después de este cambio.

## 18. Tasks

### T01 — Auditar rol asignado hoy en onboarding

Objetivo: Confirmar comportamiento actual.
Archivos / módulos probables: `api/onboarding.js`.
Cambios: Ninguno; documentar.
No hacer: No asumir sin leer el código.
Criterios de aceptación:
- [x] Confirmado el comportamiento previo: el INSERT inicial usaba el literal SQL `'ADMIN'`.
Tests: N/A — auditoría.
Evidencia esperada: extracto de código citado.

### T02 — Ajustar a OWNER

Objetivo: Asignar OWNER al creador de organización nueva.
Archivos / módulos probables: `api/onboarding.js`.
Cambios: Cambiar valor de rol en el INSERT de membership inicial.
No hacer: No modificar otras partes del flujo de onboarding.
Criterios de aceptación:
- [x] Nueva organización creada vía onboarding tiene su membership inicial en OWNER.
Tests: `api/onboarding/onboarding.test.js` cubre owner-only, opt-in explícito, compatibilidad `adminName`, legacy sin opt-in y rechazo de repetición.
Evidencia esperada: resultado de test.

## 19. Tests obligatorios

integration test del flujo de onboarding completo.

## 20. Evidencias

Resultados de T01, T02:

- Auditoría de código: `api/onboarding/onboarding.js` mantiene la transacción existente, inserta `VALUES (..., 'OWNER')` y sólo añade Employee con `ownerIsEmployee === true`.
- Test dirigido: onboarding y UI de elección OWNER→Employee — PASS.
- Suite completa: `137 passed (137)`, `1220 passed (1220)`.
- `npm run lint`: PASS.
- `npm run build`: PASS; permanece el warning conocido de chunks >500 kB.
- `git diff --check`: PASS.

La remediación de datos y la validación real de `ownerIsEmployee=false/true` están documentadas en `R2-M10-owner-employee-separation-remediation.md`.

## 21. Gate

Gates requeridos: G10 (Unit/integration tests). G6: N/A, no hay cambios de UI.

- G10 — PASS: test dirigido de onboarding y suite completa sin regresiones.
- Gate final — PASS.

## 22. Rollback / remediación

Cambio aislado y de bajo riesgo; revertir el valor de rol si el test de regresión falla.

## 23. Criterio de DONE

DONE: onboarding asigna OWNER al creador de una organización nueva, conserva atomicidad/idempotencia y queda verificado por tests de integración del handler. Commit: `8ba502d`.
