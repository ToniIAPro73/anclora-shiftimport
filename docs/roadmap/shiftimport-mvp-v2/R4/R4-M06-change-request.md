# R4-M06 — Change Request

## 1. Objetivo

Permitir que el empleado solicite un cambio sobre un turno publicado (p. ej. cambio de horario, cambio de persona), creando un recurso `ChangeRequest` con su propio ciclo de vida PENDING/APPROVED/REJECTED/CANCELLED. Esta microfase solo crea la solicitud; la aprobación es responsabilidad de R5.

## 2. Problema que resuelve

Hoy no existe ningún mecanismo formal para que un empleado pida un cambio de turno. Comments (R4-M05) es texto libre sin estructura ni flujo; Change Request es un recurso auditable con estado.

## 3. Estado actual del repositorio

Implementado en `development` y cerrado con Gate PASS el 2026-09-05. La
capacidad no existía antes de esta microfase.

## 4. Alcance IN

- Nueva tabla `change_requests` con estado propio, independiente del estado del turno (mismo principio de aislamiento que Acknowledgement, master-prompt §17).
- Endpoint para crear una solicitud sobre un turno propio (tipo de cambio + motivo en texto); `TIME_CHANGE` incluye horas solicitadas estructuradas para R5-M07.
- Cancelación de la propia solicitud por el empleado mientras esté `PENDING`.
- UI de creación desde Shift Detail.

## 5. Alcance OUT

- **Aprobación/rechazo** — pertenece íntegramente a R5 (Approval Lite). R4-M06 solo produce solicitudes en estado `PENDING`; ningún endpoint de esta microfase puede transicionar a `APPROVED`/`REJECTED`.
- Aplicación del cambio aprobado al turno — R5-M07.
- Enrutamiento a un aprobador — R5-M02.

## 6. Dependencias

R4-M04 (Acknowledgement, como precedente de patrón de recurso de estado independiente).

## 7. Decisiones arquitectónicas

`ChangeRequest` es un recurso independiente con su propio ciclo de vida
(`PENDING`/`APPROVED`/`REJECTED`/`CANCELLED`, formalizado en R0-M04). Un turno
`PUBLISHED` permanece `PUBLISHED` mientras existan solicitudes `PENDING` sobre
él — el turno nunca adopta un estado derivado tipo "cambio solicitado". Esto
es explícitamente el anti-patrón que el master prompt (§17) prohíbe.

En R4, `change_requests.status` solo puede ser creado como `PENDING` o
transicionado a `CANCELLED` por el propio solicitante. Las transiciones a
`APPROVED`/`REJECTED` quedan reservadas para el código de R5 — R4-M06 no
implementa ni expone ningún endpoint capaz de escribir esos valores. La UI
muestra la solicitud recién creada y su cancelación; la consulta histórica de
solicitudes se reserva a R4-M07.

## 8. Modelo de datos afectado

Nueva tabla `change_requests`: `id`, `shift_id` FK, `employee_id` FK,
`organization_id`, `request_type` CHECK IN (`TIME_CHANGE`, `OTHER`), `reason`
TEXT no vacío de máximo 2000 caracteres, `status` CHECK IN
(`PENDING`,`APPROVED`,`REJECTED`,`CANCELLED`), `created_at`, `resolved_at`
(nullable, escrito por cancelación/R5), `resolved_by_user_id` (nullable,
reservado para R5), y `requested_start_time`/`requested_end_time` (nullable
para `OTHER`, obligatorias para nuevos `TIME_CHANGE`). La FK compuesta
`(shift_id, employee_id)` impide asociar la solicitud a un turno de otro
empleado.

## 9. API / Backend

`POST /api/me/shifts/:id/change-requests` (crear, SELF-scoped),
`POST /api/me/change-requests/:id/cancel` (cancelar propia solicitud si
`PENDING`). Ambos requieren EMPLOYEE con empleado activo vinculado y
organización activa; turno/solicitud ajenos responden 404 uniforme. Ningún
endpoint de aprobación se crea en esta microfase.

## 10. Frontend / UX

Formulario de solicitud desde Shift Detail (tipo + horas solicitadas para
`TIME_CHANGE` + motivo obligatorio); botón
cancelar visible solo tras crear una solicitud propia en estado `PENDING`.
Tras cancelar, la tarjeta conserva el estado `CANCELLED` y oculta la acción.

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

Nueva migración aditiva `0024_change_requests.sql`, sin modificar `shifts` ni
hacer backfill.

## 17. Compatibilidad y datos existentes

Turnos históricos no tienen solicitudes; no requiere backfill.

## 18. Tasks

### T01 — Migración `change_requests`
Objetivo: crear tabla con los 4 estados y campos de resolución reservados.
Archivos: `db/migrations/00XX_change_requests.sql`.
Cambios: tabla, CHECK constraint de estado, FKs.
No hacer: no añadir aún ninguna columna o lógica de enrutamiento a aprobador (R5).
Criterios de aceptación:
- [x] Migración aplica limpia.
- [x] Segunda ejecución idempotente.
- [x] Lifecycle, FKs e índices presentes en Neon dev.
Tests: migration test.
Evidencia esperada: `apply 0024_change_requests.sql (6 statements)` seguido
de `skip 0024_change_requests.sql (already applied)`.

### T02 — Endpoint crear solicitud
Objetivo: `POST /api/me/shifts/:id/change-requests`.
Archivos: `api/me/shifts/[id]/change-requests.js`.
Cambios: validación de motivo no vacío, creación en estado `PENDING`.
No hacer: no exponer transición a `APPROVED`/`REJECTED`.
Criterios de aceptación:
- [x] Solicitud válida creada siempre en `PENDING`.
- [x] Motivo vacío, demasiado largo y tipo desconocido rechazados con 400.
- [x] Turno ajeno/tenant cruzado no es observable y devuelve 404.
- [x] Rol no EMPLOYEE recibe 403.
Tests: integration.
Evidencia esperada: `api/me/shifts/[id]/change-requests.test.js` PASS.

### T03 — Endpoint cancelar solicitud propia
Objetivo: `POST /api/me/change-requests/:id/cancel`.
Archivos: `api/me/change-requests/[id]/cancel.js`.
Cambios: transición `PENDING`→`CANCELLED` solo por el creador.
No hacer: no permitir cancelar solicitud ya resuelta o ajena.
Criterios de aceptación:
- [x] Cancelación propia `PENDING` → `CANCELLED`.
- [x] Solicitud ajena devuelve 404 uniforme.
- [x] Solicitud no pendiente devuelve 409.
- [x] Rol no EMPLOYEE recibe 403.
Tests: integration (propia vs ajena, ya resuelta).
Evidencia esperada: `api/me/change-requests/[id]/cancel.test.js` PASS.

### T04 — UI de creación en Shift Detail
Objetivo: formulario de solicitud.
Archivos: `src/components/employee-portal/ChangeRequestForm.tsx`.
Cambios: formulario con validación cliente + servidor.
No hacer: no mostrar UI de aprobación (no existe aún).
Criterios de aceptación:
- [x] Formulario no permite envío vacío ni whitespace.
- [x] Tipo y motivo tienen labels asociados y contador.
- [x] El motivo se conserva si falla el servidor.
- [x] La UI muestra la solicitud pendiente y permite cancelarla.
Tests: unit de validación e interacción.
Evidencia esperada: `ChangeRequestForm.test.tsx` PASS.

### T05 — Verificación explícita de que el turno no cambia de estado
Objetivo: test de regresión análogo a R4-M04-T04, específico para change requests.
Archivos: test nuevo junto al dominio de shifts/change-requests.
Cambios: ninguno de producción, solo test.
No hacer: N/A.
Criterios de aceptación:
- [x] Test verifica estado `PENDING` y ausencia de `UPDATE shifts`.
- [x] Test verifica que las rutas de R4 no escriben `APPROVED`/`REJECTED`.
Tests: el propio test es la entrega.
Evidencia esperada: test en verde.

## 19. Tests obligatorios

Unit, integration, migration, security y regresión de independencia de estados
PASS.

Validación ejecutada:

- suite dirigida: 6 archivos, 45 tests PASS;
- suite completa: 123 archivos, 1.147 tests PASS;
- `npm run lint`: PASS;
- `npm run build`: PASS;
- `git diff --check`: PASS.

## 20. Evidencias

Log de migración y reejecución idempotente en Neon dev; consulta de esquema:
10 columnas, 4 índices operativos, constraints CHECK/FK presentes, migración
registrada y 0 solicitudes iniciales sobre 14 shifts. Tests de API y UI cubren
creación, cancelación, aislamiento, estados y borrador. No se añadió captura
estática como sustituto de tests de interacción.

## 21. Gate

Gates obligatorios: G2 (Database), G3 (Domain invariants), G5 (Functional).
G3 PASS explícitamente confirma: (a) el test de T05 en verde, (b) ningún
endpoint de esta microfase escribe `APPROVED`/`REJECTED`, y (c) el turno no es
actualizado al crear o cancelar una solicitud.

Resultado: **PASS**.

Commit de implementación: `70335f6`
(`feat(employee-portal): add change requests`).

## 22. Rollback / remediación

Rollback lógico: detener el consumo de solicitudes sin afectar `shifts`.
La migración es aditiva; no se ejecuta `DROP TABLE` sobre datos reales como
parte de la microfase. Cualquier retirada futura deberá ser explícita y
auditada.

## 23. Criterio de DONE

Empleado crea y cancela sus propias solicitudes de cambio; ningún camino de
aprobación existe aún; el estado del turno no se ve afectado; Gate G2 + G3 +
G5 PASS. Microfase completada el 2026-09-05.
