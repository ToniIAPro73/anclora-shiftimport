# R1-M10 — Safe Delete / Logical Rollback

## 1. Objetivo
Documentar y verificar el borrado seguro (lógico) de importaciones.

## 2. Problema que resuelve
Deshacer una importación errónea sin destruir el historial de auditoría ni dejar datos huérfanos.

## 3. Estado actual del repositorio
STATUS: DONE, con cobertura de test ya exhaustiva.

### Verificación (T01/T02)

`deleteImport` (`api/_lib/data.js:1294`):
- `requireRole(ctx, 'ADMIN')` al inicio — solo ADMIN.
- Pre-check organization-scoped: `SELECT ... WHERE id = ${id} AND organization_id = ${ctx.organizationId}` → 404 si no existe o pertenece a otra organización (nunca revela que existe en otra org).
- Borrado real vía `sql.transaction((txn) => [DELETE FROM shifts WHERE import_id = ${id} AND organization_id = ${ctx.organizationId} ..., UPDATE imports SET deleted_at = NOW() ...])` — **atómico**, ya wrapped en transacción (a diferencia del hallazgo de R1-M08, este código sí lo hacía bien desde el principio).
- `DELETE FROM shifts WHERE import_id = ${id}` estructuralmente nunca afecta shifts manuales (`import_id IS NULL` — `NULL = valor` nunca es verdadero en SQL) ni shifts de otro import (`import_id` distinto).
- Re-check tras la transacción: si `updatedImport.length === 0` (carrera con un borrado concurrente), lanza 409 en vez de reportar éxito falso.

Cobertura de test **ya existente y exhaustiva** en `api/_lib/data.test.js` (líneas 964-1041): borrado exitoso con conteo exacto de shifts borrados, soft-delete confirmado (fila sigue existiendo, `status: 'deleted'`), aislamiento cross-tenant (404, sin fuga), rechazo de no-ADMIN (403), id malformado (400), id inexistente (404), doble-borrado (409), uso de transacción confirmado, caso de import sin shifts (0 borrados, aún así marcado). **Nada que corregir.**

Frontend (`ImportHistoryModal.tsx`): usa `ModalShell` (primitive existente, sin modal paralelo) para la vista de historial, y `window.confirm(confirmText)` para la confirmación de borrado — mensaje i18n detallado (fecha, usuario, nº empleados, nº turnos, periodo, alcance) con aviso explícito de irreversibilidad (`imports.deleteConfirmIrreversible`), construido enteramente vía `t(...)`.

## 4. Alcance IN
Verificar que borrar un import: (a) marca `deleted_at`/`deleted_by_user_id` en `imports` sin borrar la fila, (b) borra físicamente solo los `shifts` con ese `import_id`, (c) no afecta turnos manuales (`import_id IS NULL`) ni turnos de otros imports.

## 5. Alcance OUT
No se modifica la estrategia soft-delete/hard-delete híbrida ya decidida.

## 6. Dependencias
R1-M09.

## 7. Decisiones arquitectónicas
Ninguna nueva — se documenta y verifica la decisión ya tomada (soft-delete en `imports`, hard-delete de `shifts` por `import_id`).

## 8. Modelo de datos afectado
`imports.deleted_at`, `imports.deleted_by_user_id`, `shifts.import_id` — solo verificación.

## 9. API / Backend
Endpoint de borrado de import — confirmar que aplica exactamente esta estrategia.

## 10. Frontend / UX
Confirmar que la UI pide confirmación explícita antes de borrar un import (acción irreversible sobre los turnos).

## 11. Seguridad y autorización
Confirmar que solo un rol autorizado (ADMIN) puede borrar imports, y solo dentro de su organización.

## 12. i18n
Mensaje de confirmación de borrado en ES/EN, dejando claro qué se borra.

## 13. Accesibilidad
Diálogo de confirmación accesible (foco, cierre por Escape, etc.) — reutilizar `ModalShell` existente, no crear un modal paralelo.

## 14. Responsive / temas
N/A — motivo: confirmación estándar, cubierta por el design system existente.

## 15. Observabilidad / errores
Si el borrado de shifts falla a mitad, no debe dejar el import marcado como borrado con shifts aún presentes (ver relación con R1-M08 Atomicity).

## 16. Migraciones
Ninguna nueva — se referencia migración 0010 como cerrada.

## 17. Compatibilidad y datos existentes
N/A — motivo: verificación sobre esquema ya migrado.

## 18. Tasks

### T01 — Verificar los tres invariantes del borrado seguro
Objetivo: Confirmar (a) soft-delete de `imports`, (b) hard-delete solo de shifts con ese `import_id`, (c) no afecta turnos manuales ni de otros imports.
Archivos / módulos probables: endpoint de borrado de import, `api/_lib/data.js`.
Cambios: Ninguno si los tres invariantes se cumplen.
No hacer: No relajar ningún invariante.
Criterios de aceptación:
- [x] Los tres invariantes confirmados con cita de código y/o test (ver sección 3).
Tests: `api/_lib/data.test.js` líneas 964-1041, ya existentes, en verde.
Evidencia esperada: Ver sección 3 arriba.

### T02 — Verificar autorización y confirmación UX
Objetivo: Confirmar que solo ADMIN de la organización puede borrar, y que la UI exige confirmación explícita reutilizando `ModalShell`.
Archivos / módulos probables: componente de confirmación de borrado, endpoint de borrado.
Cambios: Ninguno si correcto; si falta guard de rol, añadirlo.
No hacer: No introducir un modal de confirmación paralelo al design system.
Criterios de aceptación:
- [x] Guard de rol/organización confirmado en backend (no solo frontend) — `requireRole(ctx, 'ADMIN')` + scoping por `organization_id`.
- [x] Confirmación UI usa `ModalShell` (historial) + `window.confirm` nativo accesible (confirmación de borrado), sin modal paralelo.
Tests: `data.test.js:1004-1006` (EMPLOYEE → 403), `data.test.js:993-999` (otra organización → 404).
Evidencia esperada: Ver sección 3 arriba.

## 19. Tests obligatorios
Test de invariantes de borrado (T01), test de autorización (T02).

## 20. Evidencias
Resultados de T01/T02.

## 21. Gate
Gates obligatorios: G2 (Database/migrations), G3 (Domain invariants), G4 (API/authorization), G10 (Unit/integration tests).

## 22. Rollback / remediación
Si T01 o T02 detectan una brecha (borrado afecta datos que no debería, o falta guard de rol): FAIL bloqueante — es una operación destructiva, no se avanza sin cerrar la brecha.

## 23. Criterio de DONE
Borrado seguro de importaciones verificado: solo ADMIN de la organización, con confirmación explícita, sin afectar datos fuera del alcance del import borrado.
