# R3-M10 — Publication

STATUS: DONE — PASS

## 1. Objetivo
API para publicar un `ScheduleVersion` en DRAFT: pasa a `PUBLISHED` y materializa cada `ShiftAssignment` como una fila en `shifts`.

## 2. Problema que resuelve
Cierra el ciclo de valor de Scheduling: convierte planificación editable en turnos reales visibles en el resto del producto (dashboard, futura vista de empleado en R4).

## 3. Estado actual del repositorio
IMPLEMENTED. La publicación revalida el draft dentro de una única sentencia transaccional, actualiza la versión y materializa los assignments activos como turnos con procedencia `schedule`.

## 4. Alcance IN
- `POST /api/schedules/:scheduleId/versions/:versionId/publish`.
- Valida: la versión está en DRAFT, todos los assignments pasan overlap (R3-M06) y rest-rule (R3-M07) — revalidación server-side en el momento de publicar, no solo en el momento de crear cada assignment (los datos pudieron cambiar, p.ej. un empleado desactivado entretanto).
- Transacción atómica: cambia `status` a `PUBLISHED`, setea `published_at`/`published_by_user_id`, e inserta en `shifts` una fila por cada `shift_assignment` con `origin='schedule'` y `schedule_version_id` de referencia. Todo o nada.

## 5. Alcance OUT
Bloqueo de edición tras publicar (R3-M11, aunque el cambio de `status` ya lo implica a nivel de dato — R3-M11 formaliza el guard explícito en los endpoints de R3-M05 para versiones no-DRAFT, que ya existe desde esa microfase; aquí solo se documenta la transición). Historial de versiones (R3-M12).

## 6. Dependencias
R3-M01..M07.

## 7. Decisiones arquitectónicas
La materialización en `shifts` requiere añadir `schedule_version_id` (nullable, FK) mediante la migración `0020_shifts_schedule_version.sql`. La columna `origin` es texto sin CHECK en el esquema vigente, por lo que se conserva el valor de procedencia `'schedule'` sin otra migración. Publicar es atómico: si la materialización falla a mitad, toda la transacción revierte y la versión permanece en DRAFT (§3, §24 del prompt maestro: mutación atómica real, no parcial).

## 8. Modelo de datos afectado
```sql
ALTER TABLE shifts ADD COLUMN schedule_version_id UUID REFERENCES schedule_versions(id) ON DELETE SET NULL;
-- origin es TEXT sin CHECK; la publicación usa el valor de procedencia 'schedule'
```

## 9. API / Backend
`POST /api/schedules/:scheduleId/versions/:versionId/publish` → 200 `{ status: 'PUBLISHED', publishedAt, createdShiftCount, excludedAssignments, excludedAssignmentCount }`. 409 si no está en DRAFT. 422 si la revalidación de overlap/rest-rule encuentra un conflicto sobreviniente (p.ej. empleado desactivado deja huérfano un assignment — decisión: assignments de empleados inactivos se excluyen de la materialización con una advertencia en la respuesta, no bloquean toda la publicación — documentar este comportamiento explícitamente).

## 10. Frontend / UX
Botón "Publicar" en `WeeklyPlanner` (R3-M08), con confirmación explícita (acción irreversible en el sentido de que crea turnos reales) y resumen previo tipo Safe Import (§14 del prompt maestro: patrón analyze→review→confirm ya validado en el producto, reutilizar la misma filosofía aquí).

## 11. Seguridad y autorización
Solo PLANNER+ con scope sobre el área/organización del schedule puede publicar — server-side.

## 12. i18n
Textos de confirmación y resumen en ES/EN.

## 13. Accesibilidad
Modal/confirmación de publicación sigue el mismo estándar que R3-M09 (navegable por teclado, focus visible).

## 14. Responsive / temas
Verificado dark/light.

## 15. Observabilidad / errores
Respuesta incluye conteo de turnos creados y, si aplica, lista de assignments excluidos por empleado inactivo — trazabilidad clara de qué pasó exactamente al publicar.

## 16. Migraciones
`db/migrations/0020_shifts_schedule_version.sql` — aditiva, `schedule_version_id` nullable no rompe filas existentes.

## 17. Compatibilidad y datos existentes
Turnos ya existentes (importados/manuales) no se ven afectados — `schedule_version_id` queda NULL para ellos, consistente con `import_id` ya siendo nullable para turnos manuales.

## 18. Tasks

### T01 — Migración `0020_shifts_schedule_version.sql`
Objetivo: añadir la columna de procedencia de versión publicada y su índice.
Archivos / módulos probables: `db/migrations/0020_shifts_schedule_version.sql`, `db/migrations.test.mjs`.
Cambios: ALTER TABLE aditivo.
No hacer: no tocar filas existentes.
Criterios de aceptación:
- [x] Migración aplica limpio sin afectar filas existentes.
Tests: test de migración.
Evidencia esperada: output de migración.

### T02 — Endpoint de publicación con revalidación y materialización atómica
Objetivo: implementar `POST .../publish` con transacción todo-o-nada.
Archivos / módulos probables: `api/schedules/[scheduleId]/versions/[versionId]/publish.js` (nuevo).
Cambios: nuevo handler + función de datos transaccional.
No hacer: no publicar parcialmente si falla la materialización de un solo assignment.
Criterios de aceptación:
- [x] Publicación exitosa crea N filas en `shifts` y cambia status a PUBLISHED en una sola transacción.
- [x] Fallo a mitad de la transacción no deja `shifts` parciales ni status inconsistente.
- [x] Empleado inactivo entre creación del assignment y publicación se excluye con advertencia, no bloquea el resto.
Tests: integración cubriendo publicación exitosa, fallo simulado (rollback verificado), y caso de empleado inactivo.
Evidencia esperada: resultados de test + verificación directa en Neon de desarrollo (conteo de filas antes/después).

### T03 — UI de confirmación de publicación
Objetivo: botón + modal de confirmación con resumen previo en `WeeklyPlanner`.
Archivos / módulos probables: `src/components/scheduling/WeeklyPlanner.tsx`.
Cambios: nueva acción + modal reutilizando `ModalShell`.
No hacer: no crear un modal paralelo si `ModalShell` cubre el caso.
Criterios de aceptación:
- [x] Confirmación explícita antes de publicar, resumen de assignments a materializar.
Tests: component test del flujo de confirmación.
Evidencia esperada: test en PASS + captura del modal.

## 19. Tests obligatorios
`db`, `API`, `integration`, `unit/component`.

## 20. Evidencias
Implementación:
- `db/migrations/0020_shifts_schedule_version.sql`: FK nullable `shifts.schedule_version_id` con `ON DELETE SET NULL` e índice idempotente.
- `api/_lib/scheduling.js`: publicación autenticada/scoped con revalidación SQL de solapamientos y descanso mínimo, exclusión explícita de empleados inactivos y materialización atómica.
- `api/schedules/[scheduleId]/versions/[versionId]/publish.js`: handler `POST` con `Allow: POST`.
- `src/lib/remote.ts` + `src/components/scheduling/WeeklyPlanner.tsx`: publicación remota y confirmación con resumen mediante `ModalShell`.
- `src/components/ui/ModalShell.tsx`: título de diálogo semántico `h2` e icono de cierre decorativo oculto para lector de pantalla.

Validación:
- `node --env-file=.env.development.local db/migrate.mjs`: `0020` aplicada correctamente; verificación Neon dev: columna UUID nullable, índice presente, 14 turnos existentes sin vínculo antes de publicar.
- `api/schedules/publish.test.js`: 4 tests PASS, incluida transacción única, mapeo de conflictos y fallo simulado.
- `db/migrations.test.mjs`: contrato de migración PASS.
- `src/components/scheduling/WeeklyPlanner.test.tsx`: confirmación explícita y resumen cubiertos.
- `qa/e2e-acceptance/specs-local/scheduling-draft.spec.ts`: 6/6 E2E PASS; publicación real creó 1 turno, excluyó 1 empleado inactivo y el segundo publish devolvió 409.
- `npm test`: 105 archivos PASS, 1.057 tests PASS (26,54 s).
- `npm run lint`, `npm run build`, `git diff --check`: PASS; warning conocido de chunks >500 kB.
- `agent-browser`: modal real verificado con captura `r3m10-publish-modal-final.png`; axe 4.12.1 con 0 violations.

## 21. Gate
Gates requeridos: **G2**, **G3**, **G4**, **G5**, **G10**.

Resultado ejecutado: **PASS**.

- G2 — PASS: migración aditiva aplicada en Neon development, FK/index verificados, filas preexistentes intactas.
- G3 — PASS: solo DRAFT publica; solapamiento/descanso se revalidan; empleados inactivos se excluyen con trazabilidad.
- G4 — PASS: autenticación, membership, rol PLANNER+ y scope AREA/ORGANIZATION se aplican server-side.
- G5 — PASS: transición y materialización real verificadas por E2E; respuesta incluye conteos y exclusiones.
- G10 — PASS: 105 archivos/1.057 tests unitarios, API, migración y componente; E2E, lint, build y diff check PASS.

## 22. Rollback / remediación
Si la atomicidad falla en test: no commitear — este es el punto de mayor riesgo de integridad de datos de todo R3 (crea filas reales en `shifts`, tabla ya consumida por el resto del producto).

## 23. Criterio de DONE
Migración aplicada, publicación atómica verificada por test (incluyendo fallo simulado), UI de confirmación operativa, Gate G2+G3+G4+G5+G10 PASS. Commit de implementación pendiente de registro.
