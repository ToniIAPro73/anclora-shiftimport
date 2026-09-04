# R4-M04 — Acknowledgement

## 1. Objetivo

Permitir que el empleado marque un turno como "reconocido" (visto/enterado), modelado como recurso de estado independiente PENDING/ACKNOWLEDGED, sin alterar el ciclo de vida propio del turno (Shift).

## 2. Problema que resuelve

Hoy no hay forma de saber si un empleado ha visto su turno publicado. Acknowledgement da trazabilidad de "el empleado lo vio" sin acoplar ese hecho al estado operativo del turno.

## 3. Estado actual del repositorio

No existe tabla ni endpoint de acknowledgement. `shifts` no tiene columna de reconocimiento.

## 4. Alcance IN

- Nueva entidad `shift_acknowledgements` (o columna dedicada, a decidir en task de diseño) con estados `PENDING`/`ACKNOWLEDGED`.
- Endpoint para que el empleado marque su propio turno como reconocido.
- Indicador visual en Shift Detail (y opcionalmente Today/My Week) del estado de reconocimiento.

## 5. Alcance OUT

- Recordatorios automáticos de reconocimiento pendiente (post-MVP, ligado a R4-M08 solo si se decide explícitamente).
- Cualquier consecuencia de negocio del no-reconocimiento (bloqueos, escalado) — fuera de alcance MVP.
- Fichaje/attendance.

## 6. Dependencias

R4-M03 (Shift Detail como punto de entrada).

## 7. Decisiones arquitectónicas

**Decisión crítica (anti-patrón a evitar, master-prompt §17):** Acknowledgement es un recurso de estado independiente del turno. Un turno permanece `PUBLISHED` (su propio ciclo de vida, formalizado en R0-M04) independientemente de si su acknowledgement está `PENDING` o `ACKNOWLEDGED`. Nunca se añade un estado de turno como "vista_pendiente" ni se sobreescribe el estado del turno al reconocer.

Modelo de datos propuesto: tabla `shift_acknowledgements` (shift_id FK único, employee_id, status, acknowledged_at) en vez de columna directa sobre `shifts`, para mantener el turno como entidad inmutable respecto a acciones del empleado y permitir extensión futura (p. ej. historial) sin migrar `shifts`.

## 8. Modelo de datos afectado

Nueva tabla `shift_acknowledgements`: `id`, `shift_id` (FK, unique), `employee_id` (FK, debe coincidir con `shifts.employee_id`), `status` CHECK IN ('PENDING','ACKNOWLEDGED'), `acknowledged_at` (nullable), `created_at`. Row creada de forma diferida (lazy) al primer acceso al detalle, o pre-creada al publicar el turno — decisión de implementación en T01, documentar la elegida.

## 9. API / Backend

`POST /api/me/shifts/:id/acknowledge` — verifica pertenencia del turno al empleado de sesión, transiciona `PENDING` → `ACKNOWLEDGED`, idempotente (reconocer dos veces no falla, no duplica).

## 10. Frontend / UX

Botón "Marcar como visto" en Shift Detail, deshabilitado/oculto si ya `ACKNOWLEDGED`; badge de estado visible.

## 11. Seguridad y autorización

Server-side: solo el propio empleado puede reconocer su turno; un ADMIN no puede reconocer en nombre de otro (fuera de alcance MVP, explícitamente no soportado).

## 12. i18n

Labels de estado y botón en ES/EN.

## 13. Accesibilidad

Botón de acción con label claro para lector de pantalla ("Marcar turno del [fecha] como visto"), no solo un icono.

## 14. Responsive / temas

Badge/botón visibles y con contraste correcto en mobile, dark/light.

## 15. Observabilidad / errores

Error claro si el reconocimiento falla (reintento manual); log server-side de intentos de reconocer turno ajeno (rechazados).

## 16. Migraciones

Nueva migración: `CREATE TABLE shift_acknowledgements` con FK a `shifts` e índice único en `shift_id`. Forward-safe, aditiva, sin impacto en filas existentes de `shifts`.

## 17. Compatibilidad y datos existentes

Turnos históricos/existentes no tienen fila de acknowledgement — se tratan como `PENDING` implícito hasta que el empleado interactúe (no requiere backfill masivo).

## 18. Tasks

### T01 — Migración `shift_acknowledgements`
Objetivo: crear la tabla con el modelo decidido en sección 7.
Archivos: `db/migrations/00XX_shift_acknowledgements.sql`.
Cambios: nueva tabla, FKs, índice único en `shift_id`.
No hacer: no añadir columna directa a `shifts`.
Criterios de aceptación:
- [ ] Migración aplica limpia sobre datos existentes.
Tests: test de migración (`db/**/*.test.mjs`).
Evidencia esperada: log de migración aplicada en dev DB.

### T02 — Endpoint `POST /api/me/shifts/:id/acknowledge`
Objetivo: transición PENDING→ACKNOWLEDGED, idempotente.
Archivos: `api/me/shifts/[id]/acknowledge.js`, `api/_lib/data.js`.
Cambios: upsert de fila de acknowledgement, verificación de pertenencia.
No hacer: no permitir reconocer turno ajeno; no fallar en doble llamada.
Criterios de aceptación:
- [ ] Llamada repetida no produce error ni fila duplicada.
Tests: integration (doble llamada, turno ajeno).
Evidencia esperada: respuesta idéntica en llamadas repetidas.

### T03 — UI de reconocimiento en Shift Detail
Objetivo: botón + badge de estado.
Archivos: `src/components/employee-portal/ShiftDetail.tsx`.
Cambios: acción de reconocer, feedback visual inmediato (optimistic o post-confirmación).
No hacer: no bloquear la vista mientras se procesa.
Criterios de aceptación:
- [ ] Estado se refleja sin recargar página.
Tests: unit de interacción.
Evidencia esperada: captura antes/después de reconocer.

### T04 — Verificación explícita de que el estado del turno no cambia
Objetivo: test de regresión que confirme el invariante de la sección 7.
Archivos: test nuevo en `api/` o `src/ingestion`/`shifts` según ubicación del modelo de turno.
Cambios: ninguno de producción, solo test.
No hacer: N/A.
Criterios de aceptación:
- [ ] Test falla si algún cambio futuro acopla el estado del turno al acknowledgement.
Tests: el propio test es la entrega.
Evidencia esperada: test en verde, nombrado explícitamente para dejar constancia del invariante.

## 19. Tests obligatorios

Unit, Integration (idempotencia, aislamiento), Migration test, Regression (invariante de independencia de estados).

## 20. Evidencias

Log de migración, respuestas de API en llamadas repetidas, capturas de UI, resultado de tests.

## 21. Gate

Gates obligatorios: G2 (Database/migrations), G3 (Domain invariants), G5 (Functional).
G3 PASS explícitamente requiere el test de T04 en verde.

## 22. Rollback / remediación

Rollback lógico: la tabla `shift_acknowledgements` puede quedar vacía/no usada sin romper `shifts`; no se requiere rollback físico destructivo. Documentar en migración el rollback lógico (drop table es seguro porque no hay dependientes fuera de este dominio).

## 23. Criterio de DONE

Empleado reconoce su turno de forma idempotente y aislada; estado del turno no se ve afectado; Gate G2+G3+G5 PASS.
