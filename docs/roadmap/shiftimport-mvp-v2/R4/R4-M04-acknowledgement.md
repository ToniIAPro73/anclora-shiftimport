# R4-M04 — Acknowledgement

## 1. Objetivo

Permitir que el empleado marque un turno como "reconocido" (visto/enterado), modelado como recurso de estado independiente PENDING/ACKNOWLEDGED, sin alterar el ciclo de vida propio del turno (Shift).

## 2. Problema que resuelve

Hoy no hay forma de saber si un empleado ha visto su turno publicado. Acknowledgement da trazabilidad de "el empleado lo vio" sin acoplar ese hecho al estado operativo del turno.

## 3. Estado actual del repositorio

DONE — PASS en `development` (commit de implementación: `6b9cb70`). La migración y el flujo de reconocimiento están aplicados en Neon development.

## 4. Alcance IN

- Nueva entidad `shift_acknowledgements` independiente, con estados `PENDING`/`ACKNOWLEDGED`.
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

Modelo elegido: tabla `shift_acknowledgements` (un `shift_id` único, `employee_id`, `status`, `acknowledged_at`) en vez de columna directa sobre `shifts`. La fila se crea lazy en el primer reconocimiento; la ausencia de fila equivale a `PENDING`. Así los turnos existentes no requieren backfill y el turno permanece independiente de las acciones del empleado.

## 8. Modelo de datos afectado

Nueva tabla `shift_acknowledgements`: `id`, `shift_id` (FK, unique), `employee_id` (FK y parte de FK compuesta con `shifts`, debe coincidir con `shifts.employee_id`), `status` CHECK IN ('PENDING','ACKNOWLEDGED'), `acknowledged_at` (nullable), `created_at`. Se crea de forma diferida al primer reconocimiento.

## 9. API / Backend

`POST /api/me/shifts/:id/acknowledge` — verifica pertenencia del turno al empleado de sesión, transiciona `PENDING` → `ACKNOWLEDGED` mediante una única sentencia atómica y es idempotente (reconocer dos veces no falla ni crea otra fila). El detalle devuelve el estado de acknowledgement y su timestamp.

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

`0022_shift_acknowledgements.sql`: migración forward-safe y aditiva. Crea la tabla, índice único `shift_id`, FKs, índices de empleado/estado e índice compuesto de soporte para la FK `shift_id + employee_id`. Aplicada en Neon development y ejecutada de nuevo sin cambios: el runner la omitió como ya aplicada.

## 17. Compatibilidad y datos existentes

Turnos históricos/existentes no tienen fila de acknowledgement — se tratan como `PENDING` implícito hasta que el empleado interactúe (no requiere backfill masivo).

## 18. Tasks

### T01 — Migración `shift_acknowledgements`
Objetivo: crear la tabla con el modelo decidido en sección 7.
Archivos: `db/migrations/00XX_shift_acknowledgements.sql`.
Cambios: nueva tabla, FKs, índice único en `shift_id`.
No hacer: no añadir columna directa a `shifts`.
Criterios de aceptación:
- [x] Migración aplica limpia sobre datos existentes.
- [x] Segunda ejecución es idempotente.
Tests: `db/migrations.test.mjs`.
Evidencia esperada: `apply 0022...`, `done 0022...` y segunda ejecución `skip 0022...` en Neon development; counts posteriores: 14 shifts y 0 acknowledgements.

### T02 — Endpoint `POST /api/me/shifts/:id/acknowledge`
Objetivo: transición PENDING→ACKNOWLEDGED, idempotente.
Archivos: `api/me/shifts/[id]/acknowledge.js`, `api/_lib/data.js`.
Cambios: upsert de fila de acknowledgement, verificación de pertenencia.
No hacer: no permitir reconocer turno ajeno; no fallar en doble llamada.
Criterios de aceptación:
- [x] Llamada repetida no produce error ni fila duplicada.
- [x] EMPLOYEE sólo puede reconocer su propio turno; ADMIN no puede actuar en su nombre.
Tests: integration (doble llamada, turno ajeno/tenant ajeno, id inválido, anonymous, método y rol).
Evidencia esperada: `api/me/shifts/[id]/acknowledge.test.js` — 5 casos PASS.

### T03 — UI de reconocimiento en Shift Detail
Objetivo: botón + badge de estado.
Archivos: `src/components/employee-portal/ShiftDetail.tsx`.
Cambios: acción de reconocer, feedback visual inmediato (optimistic o post-confirmación).
No hacer: no bloquear la vista mientras se procesa.
Criterios de aceptación:
- [x] Estado se refleja sin recargar página.
- [x] Vista no se bloquea: sólo la acción en curso queda disabled y el error ofrece reintento implícito mediante nueva acción.
Tests: `ShiftDetail.test.tsx` — estado PENDING, transición a ACKNOWLEDGED y estados existentes.
Evidencia esperada: 5 tests dirigidos de R4-M04 PASS.

### T04 — Verificación explícita de que el estado del turno no cambia
Objetivo: test de regresión que confirme el invariante de la sección 7.
Archivos: test nuevo en `api/` o `src/ingestion`/`shifts` según ubicación del modelo de turno.
Cambios: ninguno de producción, solo test.
No hacer: N/A.
Criterios de aceptación:
- [x] Test falla si algún cambio futuro acopla el estado del turno al acknowledgement.
Tests: `acknowledge.test.js` verifica que la operación sólo usa `shift_acknowledgements` y no actualiza `shifts`.
Evidencia esperada: caso idempotente en verde con query `ON CONFLICT` y sin `UPDATE shifts`.

## 19. Tests obligatorios

Unit, Integration (idempotencia, aislamiento), Migration test, Regression (invariante de independencia de estados).

## 20. Evidencias

Log de migración, respuesta API repetida, consulta de esquema/counts en Neon development y resultado de tests. La UI queda cubierta por pruebas de interacción; no se añaden capturas binarias al repositorio.

### Resultado de validación

- Tests dirigidos: 5 archivos / 39 tests PASS.
- Suite completa: 118 archivos / 1.121 tests PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- Migración Neon development: PASS; rerun idempotente PASS.
- `git diff --check`: PASS.
- Warning no bloqueante: Vite informa chunks de producción >500 kB; no afecta al flujo de acknowledgement.

## 21. Gate

Gates obligatorios: G2 (Database/migrations), G3 (Domain invariants), G5 (Functional).

Resultado: **PASS**.

- G2: tabla, constraints, FKs, índices y aplicación real en Neon development verificados.
- G3: acknowledgement independiente del lifecycle de `shifts`; doble llamada conserva la semántica y no actualiza el turno.
- G5: autorización SELF, aislamiento tenant, transición UI y errores cubiertos.
- Commit: `6b9cb70 feat(employee-portal): add shift acknowledgement`.
G3 PASS explícitamente requiere el test de T04 en verde.

## 22. Rollback / remediación

Rollback lógico: la tabla `shift_acknowledgements` puede quedar vacía/no usada sin romper `shifts`; no se requiere rollback físico destructivo. Documentar en migración el rollback lógico (drop table es seguro porque no hay dependientes fuera de este dominio).

## 23. Criterio de DONE

Empleado reconoce su turno de forma idempotente y aislada; estado del turno no se ve afectado; Gate G2+G3+G5 PASS. Microfase cerrada en `6b9cb70`.
