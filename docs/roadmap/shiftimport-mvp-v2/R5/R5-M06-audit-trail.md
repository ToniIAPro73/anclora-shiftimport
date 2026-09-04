# R5-M06 — Audit Trail

## 1. Objetivo

Registrar de forma inmutable quién aprobó/rechazó qué, cuándo y con qué motivo (si aplica), reutilizando el mecanismo de auditoría ya definido en R2-M09.

## 2. Problema que resuelve

Sin auditoría dedicada, una organización no puede demostrar (a efectos operativos o legales) cómo se gobernaron los cambios de turno.

## 3. Estado actual del repositorio

MISSING — y R2-M09 (Organization Audit Events, la base que se reutiliza aquí) también está MISSING en el baseline actual.

## 4. Alcance IN

- Emitir un evento de auditoría en cada transición de `approval_requests` (creada, aprobada, rechazada).
- Reutilizar la tabla/mecanismo genérico de eventos de auditoría de R2-M09 — no crear una segunda tabla de auditoría específica de aprobaciones.

## 5. Alcance OUT

- UI de exploración de auditoría (puede ya existir o construirse en R2-M09; aquí solo se garantiza que los eventos de aprobación se emiten con el esquema correcto).

## 6. Dependencias

R2-M09, R5-M02, R5-M04, R5-M05.

## 7. Decisiones arquitectónicas

**Decisión de reutilización:** se usa el mismo mecanismo de `organization_audit_events` (o el nombre que defina R2-M09) en lugar de una tabla `approval_audit_log` separada. Razón: evita dos sistemas de auditoría paralelos que un futuro auditor tendría que correlacionar manualmente; el dominio Approval simplemente emite eventos con `event_type IN ('approval_request.created','approval_request.approved','approval_request.rejected')` y `payload` jsonb con los detalles (change_request_id, policy_snapshot, reason si aplica).

## 8. Modelo de datos afectado

Ninguna tabla nueva propia — inserciones en la tabla de R2-M09 con el `event_type` descrito arriba.

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

Si la emisión del evento de auditoría falla, la transición de estado de `approval_requests` NO debe hacer rollback solo por eso (la auditoría es best-effort loggeada pero no debe bloquear la operación de negocio) — pero el fallo de emisión sí debe loguearse como error operativo de alta prioridad.

## 16. Migraciones

N/A — depende del esquema ya creado por R2-M09.

## 17. Compatibilidad y datos existentes

N/A — no hay eventos previos de aprobación.

## 18. Tasks

### T01 — Emitir evento en creación de ApprovalRequest

Objetivo: instrumentar R5-M02 para emitir `approval_request.created`.
Archivos: módulo de routing de R5-M02.
Cambios: llamada al emisor de eventos de R2-M09.
No hacer: no bloquear la transacción de negocio si la emisión falla (loguear y continuar).
Criterios de aceptación:
- [ ] Evento contiene change_request_id, organization_id, policy_snapshot.
Tests: verificar inserción del evento en test de integración.
Evidencia esperada: fila de evento en test DB.

### T02 — Emitir evento en aprobación y rechazo

Objetivo: instrumentar R5-M04/M05.
Archivos: módulos de approve/reject.
Cambios: emisión de `approval_request.approved` / `approval_request.rejected` (con reason en el segundo caso).
No hacer: no incluir el reason en el evento de aprobación (no aplica).
Criterios de aceptación:
- [ ] Evento de rechazo incluye el motivo exacto persistido.
Tests: integración cubriendo ambos caminos.
Evidencia esperada: filas de evento verificadas.

## 19. Tests obligatorios

Integración (emisión correcta en los 3 puntos de transición).

## 20. Evidencias

Resultados de test mostrando eventos insertados con payload correcto.

## 21. Gate

Gates requeridos: G2 (DB/migrations — verifica reutilización, no tabla duplicada), G10 (unit/integration tests).
PASS si no se crea ninguna tabla de auditoría paralela y los 3 eventos se emiten correctamente.

## 22. Rollback / remediación

N/A — auditoría es append-only, no requiere rollback salvo purga administrativa fuera de alcance de este microfase.

## 23. Criterio de DONE

Toda transición de `approval_requests` queda registrada en el mecanismo de auditoría único de la organización, sin sistema paralelo.
