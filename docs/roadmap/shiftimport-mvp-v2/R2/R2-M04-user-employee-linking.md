# R2-M04 — User ↔ Employee Linking

STATUS: DONE (verification spec)

## 1. Objetivo

Confirmar que la vinculación usuario↔empleado (individual y masiva) es correcta y consistente tras el fix `3d866e0`.

## 2. Problema que resuelve

`employees.user_id` es opcional (empleado puede existir solo como roster). El acto de vincular debe ser idempotente, correcto en ambos caminos, y no dejar estados inconsistentes.

## 3. Estado actual del repositorio

`employees.user_id` nullable, `api/_lib/data.js` contiene la lógica de vinculación. Bug corregido en `3d866e0`: bulk-link no transicionaba a `active`. Depende de R2-M02 (mismo mecanismo de estado).

## 4. Alcance IN

Verificación de idempotencia (vincular dos veces no duplica ni rompe), de unicidad (un `user_id` no puede vincularse a dos empleados de la misma organización), y de reversibilidad (desvincular, si existe esa operación).

## 5. Alcance OUT

No se rediseña el mecanismo; solo se verifica y se cierra cualquier gap encontrado.

## 6. Dependencias

R2-M02.

## 7. Decisiones arquitectónicas

N/A — motivo: sin decisiones nuevas, se ratifica el diseño actual.

## 8. Modelo de datos afectado

N/A — motivo: sin cambios de esquema.

## 9. API / Backend

Confirmar endpoint(s) de vinculación individual y masiva comparten la misma función de transición de estado en `api/_lib/data.js`.

## 10. Frontend / UX

N/A — motivo: sin cambios de UI en esta microfase.

## 11. Seguridad y autorización

Confirmar que solo ADMIN puede vincular usuarios a empleados (verificado formalmente en R2-M08).

## 12. i18n

N/A — motivo: sin nuevos textos.

## 13. Accesibilidad

N/A — motivo: sin cambios de UI.

## 14. Responsive / temas

N/A — motivo: sin cambios de UI.

## 15. Observabilidad / errores

Confirmar mensaje de error claro si se intenta vincular un `user_id` ya vinculado a otro empleado de la misma organización.

## 16. Migraciones

N/A — motivo: ninguna migración nueva.

## 17. Compatibilidad y datos existentes

Confirmar no existen vinculaciones duplicadas en datos actuales de desarrollo (query de verificación, no corrección automática).

## 18. Tasks

### T01 — Test de idempotencia y unicidad de vinculación

Objetivo: Cubrir explícitamente doble vinculación y vinculación cruzada inválida.
Archivos / módulos probables: `api/_lib/data.js`, tests en `api/**/*.test.js`.
Cambios: Añadir casos de test si faltan.
No hacer: No modificar el mecanismo de vinculación salvo defecto confirmado.
Criterios de aceptación:
- [ ] Vincular dos veces el mismo par no duplica ni lanza error inesperado.
- [ ] Vincular un `user_id` ya vinculado a otro empleado de la misma organización devuelve error claro.
Tests: suite existente + nuevos casos.
Evidencia esperada: resultado de tests.

## 19. Tests obligatorios

unit/integration sobre `data.js`.

## 20. Evidencias

Resultado de tests T01, query de verificación de duplicados.

## 21. Gate

Gates requeridos: G3 (Domain invariants), G10 (Unit/integration tests).

## 22. Rollback / remediación

N/A — motivo: microfase de verificación; cualquier defecto encontrado se corrige dentro de esta misma microfase antes de Gate.

## 23. Criterio de DONE

Idempotencia y unicidad de vinculación verificadas con test explícito; sin duplicados en datos existentes.
