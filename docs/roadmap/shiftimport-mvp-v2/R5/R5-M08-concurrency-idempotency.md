# R5-M08 — Concurrency / Idempotency

## 1. Objetivo

Garantizar que aprobar/rechazar la misma `ApprovalRequest` dos veces, o de forma concurrente, no produce doble aplicación ni estado corrupto.

## 2. Problema que resuelve

Dos aprobadores elegibles (p. ej. dos ADMIN bajo política `ORGANIZATION_ADMIN`) podrían intentar decidir la misma solicitud casi simultáneamente — sin control, ambas peticiones podrían "ganar" y crear dos versiones draft, o una aprobar mientras la otra rechaza.

## 3. Estado actual del repositorio

IMPLEMENTED — depende de R5-M04/M05/M07. Gate PASS.

## 4. Alcance IN

- Control de concurrencia optimista o bloqueo a nivel de fila sobre `approval_requests.status`.
- Garantía de que solo la primera transición desde `PENDING` tiene efecto; la segunda recibe 409 explícito.

## 5. Alcance OUT

- Colas distribuidas o locks externos — una transacción DB con `SELECT ... FOR UPDATE` o CAS (compare-and-swap) sobre `status` es suficiente para el volumen esperado en MVP piloto.

## 6. Dependencias

R5-M04, R5-M05, R5-M07.

## 7. Decisiones arquitectónicas

Se usa una transacción SQL con `SELECT ... FOR UPDATE OF approval_requests` sobre la fila candidata y una segunda condición `target.status = 'PENDING'` en la actualización (CAS defensivo). La primera petición elegible serializa la decisión y sus efectos; las siguientes encuentran el estado resuelto y reciben 409 sin aplicar cambios. En aprobaciones `TIME_CHANGE`, el bloqueo cubre también la creación del draft y la copia de assignments, evitando drafts duplicados.

## 8. Modelo de datos afectado

Ninguna columna nueva — reutiliza `approval_requests.status` con la semántica CAS descrita.

## 9. API / Backend

Los endpoints de R5-M04 (approve) y R5-M05 (reject) implementan la transacción de bloqueo + CAS descrita arriba. Los 409 incluyen, cuando está disponible, el nombre y la fecha de la decisión anterior; el backend registra el conflicto a nivel `info`.

## 10. Frontend / UX

Ante un 409, la UI debe refrescar el estado real de la solicitud y mostrar "esta solicitud ya fue decidida por [nombre] el [fecha]" en vez de un error genérico.

## 11. Seguridad y autorización

N/A adicional — reutiliza las verificaciones de R5-M04/M05.

## 12. i18n

Mensaje de conflicto ("ya decidida por otro aprobador") en ES/EN.

## 13. Accesibilidad

N/A adicional.

## 14. Responsive / temas

N/A adicional.

## 15. Observabilidad / errores

Todo 409 de este tipo debe loguearse (nivel info, no error — es un caso esperado en organizaciones con múltiples ADMIN) para poder medir con qué frecuencia ocurre en piloto.

## 16. Migraciones

N/A — sin cambios de esquema.

## 17. Compatibilidad y datos existentes

N/A.

## 18. Tasks

### T01 — Reescribir approve/reject con bloqueo y CAS atómico

Objetivo: eliminar condición de carrera SELECT-then-UPDATE.
Archivos: endpoints de R5-M04 y R5-M05.
Cambios: `SELECT ... FOR UPDATE` de la fila elegible dentro de la transacción, seguido de `UPDATE ... WHERE status = 'PENDING'` y resolución explícita del conflicto.
No hacer: no dejar ningún camino que haga SELECT y UPDATE en pasos separados sin transacción/lock.
Criterios de aceptación:
- [ ] Dos peticiones concurrentes de aprobación sobre la misma request: exactamente una tiene efecto, la otra recibe 409.
- [ ] Aprobar + rechazar concurrentes: exactamente una gana, nunca ambas.
Tests: test de concurrencia simulando dos peticiones paralelas contra la misma fila.
Evidencia esperada: resultado de test de concurrencia (logs de las dos respuestas).

### T02 — UI manejo de 409 con refresco de estado real

Objetivo: evitar mensaje de error genérico ante conflicto esperado.
Archivos: componente de detalle de la bandeja (R5-M03/M04/M05).
Cambios: al recibir 409, recargar el estado de la request y mostrar quién decidió y cuándo.
No hacer: no mostrar un error crudo de red al usuario.
Criterios de aceptación:
- [ ] 409 simulado en test de componente muestra el mensaje correcto, no un error genérico.
Tests: componente con mock de 409.
Evidencia esperada: captura del mensaje.

## 19. Tests obligatorios

Test de concurrencia real (dos peticiones paralelas contra la misma fila de DB, no simulado a nivel de función aislada), componente (manejo de 409).

## 20. Evidencias

- Tests focalizados: `13/13 PASS` (approve, reject, ApprovalInbox) antes de ampliar la aserción de metadatos; tras la ampliación se ejecuta la suite completa.
- Concurrencia real contra Neon development, dos sesiones de aprobadores:
  - `approve` + `approve`: `[200, 409]`, una aprobación, un cambio `APPROVED`, un evento de auditoría y un solo draft/efecto para `TIME_CHANGE`.
  - `approve` + `reject`: `[200, 409]`, estado final único y un evento de auditoría.
- Los escenarios fueron sintéticos, tenant-scoped y limpiados al finalizar.

## 21. Gate

Gates requeridos: G3 (domain invariants), G10 (unit/integration tests).
PASS solo si el test de concurrencia real demuestra, de forma reproducible, que nunca hay doble efecto.

## 22. Rollback / remediación

N/A — el propio mecanismo CAS previene el estado a corregir; no se requiere rollback si el Gate pasa.

## 23. Criterio de DONE

Test de concurrencia real demuestra de forma reproducible que la doble decisión sobre una misma solicitud es imposible. PASS registrado en commit de implementación.
