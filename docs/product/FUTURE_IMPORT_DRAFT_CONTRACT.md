# Future Import and Company Plan Contract

**Estado**: vigente; 2026-10-16. Supersede la decisión «auto-publicación» del 2026-10-15: importar
**crea o actualiza la planificación (borradores); nunca publica**.

Dominio canónico: `Shift` → `Schedule` → `ScheduleVersion` → `ShiftAssignment`, más el **Plan Empresa**
versionado (`company_plan_revisions`). Capas: Plan Empresa → Cambios/incidencias → Calendario efectivo →
Estadísticas → Auditoría.

## Clasificación (después del parse, independiente del formato)

- Temporal: `HISTORICAL | FUTURE | MIXED` con el helper canónico `getOperationalDate()` (`date < today` es
  histórico). Lógica compartida: `src/lib/company-plan.js`.
- Documento (propuesta con evidencia, corregible por rol autorizado cuando es ambigua):
  `COMPANY_PLAN | COMPANY_PLAN_UPDATE | HISTORICAL_CALENDAR | UNDETERMINED`.

## Decisión del usuario y roles

- Valores: `historical-only` (por defecto, seguro) y `historical-and-plan`. El valor legado `publish`
  se acepta en el cable como `historical-and-plan`; **nunca significó** «publicar automáticamente».
- OWNER/ADMIN/PLANNER (scope efectivo) deciden sobre las filas futuras. En `MIXED` eligen entre solo
  históricos o históricos + planificación; en `FUTURE` solo pueden crear/actualizar la planificación.
- EMPLOYEE: sin opción de planificación (validado en servidor). En `MIXED` solo importa su histórico
  autorizado y se le informa de las filas futuras excluidas; en `FUTURE` no se escribe nada.
- `POST /api/imports/plan-preview` (solo lectura, mismo permiso) devuelve clasificación y reconciliación
  contra el Plan Empresa sin escribir.

## Plan Empresa versionado

- Cada importación que cambia el plan crea la revisión `N+1` (`company_plan_revisions`: documento, fecha,
  autor, cobertura, filas normalizadas por clave de negocio, resumen de cambios). Las revisiones
  anteriores **nunca** se reescriben ni se borran.
- Baseline `B` de una fecha = la revisión más nueva que cubre ese empleado/día.
- `UNIQUE(org, scope, revision_number)`: dos confirmaciones concurrentes desde el mismo baseline no pueden
  crear dos revisiones; la perdedora reevalúa y queda como duplicado.

## Reconciliación a tres bandas (empleado + fecha)

`B` baseline anterior · `N` plan nuevo · `E` calendario efectivo (borrador del planner o turnos efectivos).
`B=N,E=B` sin cambios · `B=N,E≠B` se conserva el cambio local · `B≠N,E=B` (futuro) se actualiza el plan ·
`B≠N,E=N` la empresa adoptó el cambio local (auto-resuelto) · `B≠N,E≠B,E≠N` discrepancia →
`REQUIRES_REVIEW` · cambio retrospectivo que contradice el histórico efectivo → `REQUIRES_REVIEW`.
Primera importación (sin `B`): día igual a `E` = sin cambios; distinto = revisión. Un día ya pendiente de
reconciliación no se resuelve por importación. Cada día se evalúa de forma independiente: una discrepancia
no bloquea el resto del documento. La comparación ignora el reparto Regular/Extras (unión de intervalos).

## Planificación (borradores) e idempotencia del EFECTO

El backend valida tenant, rol y scope, agrupa por semana/área y crea/actualiza el `DRAFT` (un borrador
existente se actualiza in situ; el plan anterior queda en su revisión). Nunca modifica versiones
`PUBLISHED`, nunca publica y no envía notificaciones de publicación. Todo es una transacción.

Fingerprints (ninguno depende de UUIDs de tenant): **FILE** (bytes), **DOCUMENT** (parse normalizado +
contexto), **PLAN** (contenido de negocio por `external_employee_id`). Resultado: `DUPLICATE_FILE`
(mismo fichero con el plan ya aplicado), `DUPLICATE_DOCUMENT` (bytes distintos, documento equivalente),
`DUPLICATE_PLAN` (plan semánticamente igual) → sin nueva revisión. Reimportar el mismo fichero con otra
decisión **no** queda bloqueado: se procesa lo pendiente.

La decisión P5.5 `Import ≠ Publish` se restablece sin excepciones.
