# R2-M03 — Areas

STATUS: DONE (verification spec)

## 1. Objetivo

Confirmar que el soporte de áreas opcionales (0..N por organización) está completo y cumple el requisito explícito del master prompt de no forzar áreas.

## 2. Problema que resuelve

Evitar que R3 (scheduling) o R5 (approval) asuman erróneamente que toda organización tiene áreas, o que un empleado siempre pertenece a una.

## 3. Estado actual del repositorio

- Tabla `areas` (migración 0008): `id`, `organization_id`, `name`, `code`, `active`.
- `employees.area_id` nullable (migración 0008).
- `api/areas/index.js` gestiona CRUD de áreas.
- `docs/product/APPLICATION_STRUCTURE_AREAS_OPTIONAL.md` documenta el diseño y está vigente.
- `imports.area_id`, `imports.scope_type ('global','area')`, `imports.area_name_snapshot` — las importaciones ya soportan ámbito global o por área.

## 4. Alcance IN

Verificación de CRUD de áreas, de que `area_id` es opcional en `employees` y `imports`, y de que la UI no obliga a crear un área.

## 5. Alcance OUT

No se introduce jerarquía WorkCenter/Team (prohibido explícitamente hasta R9).

## 6. Dependencias

R2-M00.

## 7. Decisiones arquitectónicas

Se ratifica: `Organization` 1—0..N `Areas`; `Employee` 0..1 `Area`. Ninguna entidad de negocio requiere área para existir.

## 8. Modelo de datos afectado

N/A — motivo: sin cambios de esquema, solo verificación.

## 9. API / Backend

Confirmar `api/areas/index.js` cubre create/list/update/deactivate con scoping por `organization_id`.

## 10. Frontend / UX

Confirmar que el flujo de creación de empleado/importación no exige seleccionar área.

## 11. Seguridad y autorización

Confirmar que gestión de áreas está restringida a ADMIN (verificado formalmente en R2-M08).

## 12. i18n

N/A — motivo: sin nuevos textos; verificar cobertura existente vía `i18n-coverage.test.ts`.

## 13. Accesibilidad

N/A — motivo: sin cambios de UI en esta microfase.

## 14. Responsive / temas

N/A — motivo: sin cambios de UI.

## 15. Observabilidad / errores

N/A — motivo: verificación.

## 16. Migraciones

N/A — motivo: ninguna migración nueva.

## 17. Compatibilidad y datos existentes

Confirmar que organizaciones sin áreas siguen operando sin fricción (import global, empleados sin `area_id`).

## 18. Tasks

### T01 — Verificar CRUD y opcionalidad de áreas

Objetivo: Confirmar cobertura funcional completa.
Archivos / módulos probables: `api/areas/index.js`, `api/_lib/data.js`.
Cambios: Ninguno salvo gap encontrado.
No hacer: No añadir jerarquía adicional.
Criterios de aceptación:
- [ ] Create/list/update/deactivate de área funcionan y están scoped por organización.
- [ ] Organización sin áreas opera sin error en import/empleado.
Tests: suite existente de `api/areas`.
Evidencia esperada: resultado de tests.

## 19. Tests obligatorios

unit/integration sobre `api/areas`.

## 20. Evidencias

Resultado de tests T01.

## 21. Gate

Gates requeridos: G2 (Database/migrations), G10 (Unit/integration tests).

## 22. Rollback / remediación

N/A — motivo: microfase de verificación.

## 23. Criterio de DONE

CRUD de áreas verificado, opcionalidad confirmada end-to-end.
