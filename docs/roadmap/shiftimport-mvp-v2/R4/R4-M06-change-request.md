# R4-M06 — Change Request

## 1. Objetivo

Permitir que el empleado solicite un cambio sobre un turno publicado (p. ej. cambio de horario, cambio de persona), creando un recurso `ChangeRequest` con su propio ciclo de vida PENDING/APPROVED/REJECTED/CANCELLED. Esta microfase solo crea la solicitud; la aprobación es responsabilidad de R5.

## 2. Problema que resuelve

Hoy no existe ningún mecanismo formal para que un empleado pida un cambio de turno. Comments (R4-M05) es texto libre sin estructura ni flujo; Change Request es un recurso auditable con estado.

## 3. Estado actual del repositorio

No existe. Ninguna tabla `change_requests` en el esquema.

## 4. Alcance IN

- Nueva tabla `change_requests` con estado propio, independiente del estado del turno (mismo principio de aislamiento que Acknowledgement, master-prompt §17).
- Endpoint para crear una solicitud sobre un turno propio (tipo de cambio + motivo en texto).
- Cancelación de la propia solicitud por el empleado mientras esté `PENDING`.
- UI de creación desde Shift Detail.

## 5. Alcance OUT

- **Aprobación/rechazo** — pertenece íntegramente a R5 (Approval Lite). R4-M06 solo produce solicitudes en estado `PENDING`; ningún endpoint de esta microfase puede transicionar a `APPROVED`/`REJECTED`.
- Aplicación del cambio aprobado al turno — R5-M07.
- Enrutamiento a un aprobador — R5-M02.

## 6. Dependencias

R4-M04 (Acknowledgement, como precedente de patrón de recurso de estado independiente).

## 7. Decisiones arquitectónicas

`ChangeRequest` es un recurso independiente con su propio ciclo de vida (`PENDING`/`APPROVED`/`REJECTED`/`CANCELLED`, formalizado en R0-M04). Un turno `PUBLISHED` permanece `PUBLISHED` mientras existan solicitudes `PENDING` sobre él — el turno nunca adopta un estado derivado tipo "cambio solicitado". Esto es explícitamente el anti-patrón que el master prompt (§17) prohíbe.

En R4, `change_requests.status` solo puede ser creado como `PENDING` o transicionado a `CANCELLED` por el propio solicitante. Las transiciones a `APPROVED`/`REJECTED` quedan reservadas para el código de R5 — R4-M06 no debe implementar ni exponer ningún endpoint capaz de escribir esos valores.

## 8. Modelo de datos afectado

Nueva tabla `change_requests`: `id`, `shift_id` FK, `employee_id` FK, `organization_id`, `request_type` (enum simple, p. ej. `TIME_CHANGE`/`OTHER` — mantener mínimo en MVP), `reason` (text), `status` CHECK IN ('PENDING','APPROVED','REJECTED','CANCELLED'), `created_at`, `resolved_at` (nullable, escrito solo por R5), `resolved_by_user_id` (nullable, escrito solo por R5).

## 9. API / Backend

`POST /api/me/shifts/:id/change-requests` (crear, SELF-scoped), `POST /api/me/change-requests/:id/cancel` (cancelar propia solicitud si `PENDING`). Ningún endpoint de aprobación se crea en esta microfase.

## 10. Frontend / UX

Formulario de solicitud desde Shift Detail (tipo + motivo obligatorio); botón cancelar visible solo si `PENDING` y es del propio empleado.

## 11. Seguridad y autorización

Server-side: verificación de pertenencia del turno; verificación de que solo el creador puede cancelar; ningún camino de escritura hacia `APPROVED`/`REJECTED` expuesto en esta microfase (verificar explícitamente en Gate de seguridad).

## 12. i18n

Formulario, estados y mensajes en ES/EN.

## 13. Accesibilidad

Formulario con labels asociados y validación anunciada a lector de pantalla.

## 14. Responsive / temas

Formulario usable en mobile como caso principal.

## 15. Observabilidad / errores

Error claro si falla la creación; no perder el texto del motivo ya escrito.

## 16. Migraciones

Nueva migración aditiva `change_requests`, sin impacto en `shifts` existentes.

## 17. Compatibilidad y datos existentes

Turnos históricos no tienen solicitudes; no requiere backfill.

## 18. Tasks

### T01 — Migración `change_requests`
Objetivo: crear tabla con los 4 estados y campos de resolución reservados.
Archivos: `db/migrations/00XX_change_requests.sql`.
Cambios: tabla, CHECK constraint de estado, FKs.
No hacer: no añadir aún ninguna columna o lógica de enrutamiento a aprobador (R5).
Criterios de aceptación:
- [ ] Migración aplica limpia.
Tests: migration test.
Evidencia esperada: log de aplicación.

### T02 — Endpoint crear solicitud
Objetivo: `POST /api/me/shifts/:id/change-requests`.
Archivos: `api/me/shifts/[id]/change-requests.js`.
Cambios: validación de motivo no vacío, creación en estado `PENDING`.
No hacer: no exponer transición a `APPROVED`/`REJECTED`.
Criterios de aceptación:
- [ ] Solicitud creada siempre en `PENDING`.
Tests: integration.
Evidencia esperada: respuesta de creación.

### T03 — Endpoint cancelar solicitud propia
Objetivo: `POST /api/me/change-requests/:id/cancel`.
Archivos: `api/me/change-requests/[id]/cancel.js`.
Cambios: transición `PENDING`→`CANCELLED` solo por el creador.
No hacer: no permitir cancelar solicitud ya resuelta o ajena.
Criterios de aceptación:
- [ ] Cancelar solicitud ajena devuelve error de autorización.
Tests: integration (propia vs ajena, ya resuelta).
Evidencia esperada: respuestas de error para cada caso.

### T04 — UI de creación en Shift Detail
Objetivo: formulario de solicitud.
Archivos: `src/components/employee-portal/ChangeRequestForm.tsx`.
Cambios: formulario con validación cliente + servidor.
No hacer: no mostrar UI de aprobación (no existe aún).
Criterios de aceptación:
- [ ] Formulario no permite envío vacío.
Tests: unit de validación.
Evidencia esperada: captura de formulario con error de validación.

### T05 — Verificación explícita de que el turno no cambia de estado
Objetivo: test de regresión análogo a R4-M04-T04, específico para change requests.
Archivos: test nuevo junto al dominio de shifts/change-requests.
Cambios: ninguno de producción, solo test.
No hacer: N/A.
Criterios de aceptación:
- [ ] Test falla si un cambio futuro acopla el estado del turno al de la solicitud.
Tests: el propio test es la entrega.
Evidencia esperada: test en verde.

## 19. Tests obligatorios

Unit, Integration (creación, cancelación, aislamiento), Security (ningún camino de escritura a APPROVED/REJECTED), Regression (invariante de independencia de estados).

## 20. Evidencias

Log de migración, respuestas de API para cada caso, capturas de UI, resultado de tests.

## 21. Gate

Gates obligatorios: G2 (Database), G3 (Domain invariants), G5 (Functional).
G3 PASS explícitamente requiere: (a) el test de T05 en verde, (b) confirmación de que ningún endpoint de esta microfase escribe `APPROVED`/`REJECTED`.

## 22. Rollback / remediación

Rollback lógico: tabla puede quedar sin uso sin afectar `shifts`; drop table seguro, sin dependientes fuera de este dominio hasta que R5 la extienda.

## 23. Criterio de DONE

Empleado crea y cancela sus propias solicitudes de cambio; ningún camino de aprobación existe aún; estado del turno no se ve afectado; Gate G2+G3+G5 PASS.
