# R1-M10 — Safe Delete / Logical Rollback

## 1. Objetivo
Documentar y verificar el borrado seguro (lógico) de importaciones.

## 2. Problema que resuelve
Deshacer una importación errónea sin destruir el historial de auditoría ni dejar datos huérfanos.

## 3. Estado actual del repositorio
STATUS: DONE. Migración 0010: soft-delete en `imports` (`deleted_at`, `deleted_by_user_id`); los `shifts` asociados se borran físicamente por `import_id` (documentado en comentario de la migración).

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
- [ ] Los tres invariantes confirmados con cita de código y/o test.
Tests: Test de integración: borrar import A no afecta shifts manuales ni shifts de import B.
Evidencia esperada: Test en verde.

### T02 — Verificar autorización y confirmación UX
Objetivo: Confirmar que solo ADMIN de la organización puede borrar, y que la UI exige confirmación explícita reutilizando `ModalShell`.
Archivos / módulos probables: componente de confirmación de borrado, endpoint de borrado.
Cambios: Ninguno si correcto; si falta guard de rol, añadirlo.
No hacer: No introducir un modal de confirmación paralelo al design system.
Criterios de aceptación:
- [ ] Guard de rol/organización confirmado en backend (no solo frontend).
- [ ] Confirmación UI usa `ModalShell` o primitive equivalente ya existente.
Tests: Test de autorización (usuario EMPLOYEE no puede borrar; usuario de otra organización no puede borrar).
Evidencia esperada: Test en verde.

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
