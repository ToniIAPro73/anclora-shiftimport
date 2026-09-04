# R2-M09 — Organization Audit Events

STATUS: MISSING

## 1. Objetivo

Registrar un log mínimo de eventos organizativos sensibles (cambios de rol, alta/baja de miembro, cambios de área) para trazabilidad, sin construir un sistema de event-sourcing genérico.

## 2. Problema que resuelve

Sin auditoría, un cambio de rol indebido (p.ej. degradar al único OWNER) o una desactivación de empleado incorrecta no deja rastro para diagnóstico o disputa.

## 3. Estado actual del repositorio

No existe tabla ni mecanismo de auditoría hoy. `imports` tiene columnas de auditoría propias (`deleted_by_user_id`, etc.) que sirven de precedente de patrón simple (columna de autor + timestamp), no de tabla de eventos separada.

## 4. Alcance IN

- Tabla `organization_audit_events` mínima: `id`, `organization_id`, `actor_user_id`, `event_type`, `target_type`, `target_id`, `metadata` (jsonb, sin PII innecesaria), `created_at`.
- Emisión de eventos desde: cambio de rol (R2-M06/M07), alta/baja de miembro, creación/desactivación de área, vinculación usuario↔empleado.
- Endpoint de lectura de auditoría restringido a OWNER/ADMIN con scope ORGANIZATION.

## 5. Alcance OUT

No se construye UI de timeline visual en esta microfase (solo endpoint + almacenamiento); no se audita cada lectura, solo mutaciones sensibles.

## 6. Dependencias

R2-M08.

## 7. Decisiones arquitectónicas

Tabla de eventos append-only, sin actualización ni borrado (excepto política de retención futura, fuera de alcance MVP). No se usa un bus de eventos ni cola — inserción síncrona en la misma transacción que la mutación auditada.

## 8. Modelo de datos afectado

Nueva tabla `organization_audit_events` (ver Alcance IN). Índice en `(organization_id, created_at)` para lectura eficiente por organización y rango de fechas.

## 9. API / Backend

Nuevo endpoint `GET /api/organizations/audit-events` (paginado, filtrable por tipo/fecha), restringido a OWNER/ADMIN. Función helper `recordAuditEvent(...)` en `api/_lib/data.js` invocada desde cada mutación sensible.

## 10. Frontend / UX

N/A — motivo: sin UI de visualización en esta microfase (Alcance OUT); el endpoint queda listo para consumo futuro.

## 11. Seguridad y autorización

Solo OWNER/ADMIN con scope ORGANIZATION puede leer el log. `metadata` jsonb no debe incluir contraseñas, tokens ni PII más allá de lo estrictamente necesario para el registro (p.ej. nombre de empleado sí, no datos de contacto sensibles).

## 12. i18n

N/A — motivo: sin UI en esta microfase.

## 13. Accesibilidad

N/A — motivo: sin UI en esta microfase.

## 14. Responsive / temas

N/A — motivo: sin UI en esta microfase.

## 15. Observabilidad / errores

Fallo al escribir un evento de auditoría no debe abortar la mutación de negocio (evento es best-effort dentro de la misma transacción, pero si la inserción de auditoría falla por motivo ajeno a la mutación, se prioriza no bloquear al usuario — decisión a documentar explícitamente y registrar en logs de servidor).

## 16. Migraciones

Nueva migración: crea `organization_audit_events` con índice.

## 17. Compatibilidad y datos existentes

Ninguna migración de datos existentes — tabla nueva, vacía al desplegar.

## 18. Tasks

### T01 — Migración: tabla organization_audit_events

Objetivo: Crear tabla append-only.
Archivos / módulos probables: `db/migrations/00XX_add_audit_events.sql`.
Cambios: CREATE TABLE + índice.
No hacer: No añadir UPDATE/DELETE permitido a nivel de aplicación.
Criterios de aceptación:
- [ ] Migración aplica limpiamente.
Tests: migration test.
Evidencia esperada: resultado de migración.

### T02 — Helper recordAuditEvent + integración en mutaciones sensibles

Objetivo: Emitir evento desde cada mutación relevante.
Archivos / módulos probables: `api/_lib/data.js`.
Cambios: Nueva función + llamadas desde cambio de rol, alta/baja miembro, área, vinculación.
No hacer: No auditar lecturas.
Criterios de aceptación:
- [ ] Cada mutación sensible listada en Alcance IN genera exactamente un evento.
Tests: integration test por tipo de evento.
Evidencia esperada: resultado de tests.

### T03 — Endpoint de lectura de auditoría

Objetivo: Exponer el log a OWNER/ADMIN.
Archivos / módulos probables: nuevo `api/organizations/audit-events.js`.
Cambios: Endpoint paginado con filtro por tipo/fecha, usando guard central de R2-M08.
No hacer: No exponer a roles distintos de OWNER/ADMIN.
Criterios de aceptación:
- [ ] PLANNER/EMPLOYEE reciben 403.
- [ ] Paginación funciona con datasets grandes.
Tests: integration test.
Evidencia esperada: resultado de tests.

## 19. Tests obligatorios

migration test, integration (emisión de eventos y endpoint de lectura).

## 20. Evidencias

Resultados de T01-T03.

## 21. Gate

Gates requeridos: G2 (Database/migrations), G10 (Unit/integration tests).

## 22. Rollback / remediación

Si la emisión de auditoría bloquea accidentalmente una mutación de negocio, es bloqueante — corregir para que el fallo de auditoría no impida la operación principal, y reintentar Gate.

## 23. Criterio de DONE

Tabla creada, eventos emitidos desde todas las mutaciones sensibles listadas, endpoint de lectura restringido y funcional.
