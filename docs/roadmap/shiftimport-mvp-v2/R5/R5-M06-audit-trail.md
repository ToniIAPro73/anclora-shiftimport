# R5-M06 — Audit Trail

## 1. Objetivo

Registrar de forma inmutable quién aprobó/rechazó qué, cuándo y con qué motivo (si aplica), reutilizando el mecanismo de auditoría ya definido en R2-M09.

## 2. Problema que resuelve

Sin auditoría dedicada, una organización no puede demostrar (a efectos operativos o legales) cómo se gobernaron los cambios de turno.

## 3. Estado actual del repositorio

IMPLEMENTED — Gate PASS. R2-M09 ya dispone de `organization_audit_events`,
`recordAuditEvent` y endpoint de consulta; M06 amplía ese mecanismo para
Approval Lite.

## 4. Alcance IN

- Emitir un evento de auditoría en cada transición de `approval_requests` (creada, aprobada, rechazada).
- Reutilizar la tabla/mecanismo genérico de eventos de auditoría de R2-M09 — no crear una segunda tabla de auditoría específica de aprobaciones.

## 5. Alcance OUT

- UI de exploración de auditoría (puede ya existir o construirse en R2-M09; aquí solo se garantiza que los eventos de aprobación se emiten con el esquema correcto).

## 6. Dependencias

R2-M09, R5-M02, R5-M04, R5-M05.

## 7. Decisiones arquitectónicas

**Decisión de reutilización:** se usa el mismo mecanismo de
`organization_audit_events` en lugar de una tabla `approval_audit_log`
separada. Los eventos usan `event_type IN
('approval_request.created','approval_request.approved','approval_request.rejected')`
y `metadata` JSONB con `changeRequestId`, `policySnapshot` y `reason` si aplica.

## 8. Modelo de datos afectado

No hay tabla nueva propia. La migración `0031_approval_audit_event_types.sql`
amplía el constraint de la tabla existente.

## 9. API / Backend

N/A — no hay endpoint propio; la emisión ocurre como efecto colateral de R5-M02/M04/M05.

## 10. Frontend / UX

N/A — reutiliza la UI de auditoría de R2-M09 si existe; si R2-M09 no incluye UI, se documenta como gap heredado, no de este microfase.

## 11. Seguridad y autorización

Los eventos de auditoría son append-only e inmutables — ningún endpoint permite editarlos ni borrarlos.

## 12. i18n

N/A — reutiliza formato de eventos de R2-M09.

## 13. Accesibilidad

N/A — sin UI propia.

## 14. Responsive / temas

N/A — sin UI propia.

## 15. Observabilidad / errores

Si la emisión del evento de auditoría falla, la transición de estado de
`approval_requests` NO hace rollback solo por eso: `recordAuditEvent` captura y
loguea el fallo como error operativo, sin bloquear la operación de negocio.

## 16. Migraciones

`0031_approval_audit_event_types.sql` amplía de forma forward-safe el constraint
existente, conservando todos los eventos organizativos previos.

## 17. Compatibilidad y datos existentes

N/A — no hay eventos previos de aprobación.

## 18. Tasks

### T01 — Emitir evento en creación de ApprovalRequest

Objetivo: instrumentar R5-M02 para emitir `approval_request.created`.
Archivos: módulo de routing de R5-M02.
Cambios: llamada al emisor de eventos de R2-M09.
No hacer: no bloquear la transacción de negocio si la emisión falla (loguear y continuar).
Criterios de aceptación:
- [x] Evento contiene change_request_id, organization_id, policy_snapshot.
Tests: verificar inserción del evento en test de integración.
Evidencia esperada: fila de evento en test DB.

### T02 — Emitir evento en aprobación y rechazo

Objetivo: instrumentar R5-M04/M05.
Archivos: módulos de approve/reject.
Cambios: emisión de `approval_request.approved` / `approval_request.rejected` (con reason en el segundo caso).
No hacer: no incluir el reason en el evento de aprobación (no aplica).
Criterios de aceptación:
- [x] Evento de rechazo incluye el motivo exacto persistido.
Tests: integración cubriendo ambos caminos.
Evidencia esperada: filas de evento verificadas.

## 19. Tests obligatorios

Integración (emisión correcta en los 3 puntos de transición).

## 20. Evidencias

Resultados de test mostrando eventos insertados con metadata correcta y
verificación de la constraint en Neon dev.

## 21. Gate

Gates requeridos: G2 (DB/migrations — verifica reutilización, no tabla duplicada), G10 (unit/integration tests).
PASS si no se crea ninguna tabla de auditoría paralela y los 3 eventos se
emiten correctamente.

## 22. Rollback / remediación

N/A — auditoría es append-only, no requiere rollback salvo purga administrativa fuera de alcance de este microfase.

## 23. Criterio de DONE

Toda transición de `approval_requests` queda registrada en el mecanismo de
auditoría único de la organización, sin sistema paralelo.

## 24. Resultado de ejecución

- Gate: PASS.
- Tests focalizados de creación/aprobación/rechazo/auditoría/migraciones: 54/54.
- Suite completa: 136 archivos, 1210 tests PASS.
- Lint: PASS.
- Build: PASS (warning no bloqueante de chunks grandes preexistente).
- Migración Neon dev: aplicada; constraint existente verificada con los tres
  eventos Approval Lite.
- Commit de implementación: pendiente de registrar tras el commit.
