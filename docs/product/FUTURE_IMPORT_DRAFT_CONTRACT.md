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

## Semántica por origen del documento (SOURCE_KIND)

Tres dimensiones independientes: **SOURCE_KIND** (qué documento es, por estructura, nunca por el nombre del
fichero), **clase temporal** (fechas que contiene) y **clase de negocio** (qué efecto tiene).

| SOURCE_KIND | Evidencia estructural | Efecto |
|---|---|---|
| `EMPLOYEE_CALENDAR_EXPORT` | hoja `Leyenda` con `Calendario = Empleado` | pasado = evidencia del calendario efectivo e incidencias; futuro = candidato de planificación (solo con `historical-and-plan`) |
| `PUBLISHED_CALENDAR_EXPORT` | `Calendario = Publicado` | Plan Empresa (línea base / actualización); nunca se publica solo ni sobrescribe el efectivo histórico |
| `TEAM_SCHEDULE_EXPORT` | estructura de equipo (PDF/XLSX multiempleado con nómina) | Plan Empresa multiempleado |

- La evidencia de un calendario de empleado **no** cambia el `PLAN_FINGERPRINT` ni crea revisión; solo las filas de plan lo hacen.
- Día con plan publicado 14:00–22:00 y evidencia de empleado «Baja»: el plan se conserva (revisión + fila sustituida como
  historial), el efectivo pasa a Baja (`EVIDENCE_APPLIED`, cambio `REPLACE_DAY` con procedencia `SYSTEM`). Si el día ya tenía una
  decisión humana distinta o estaba pendiente, nunca se resuelve en silencio (`REQUIRES_REVIEW`).
- Un cambio de plan existe solo si algún día de PLAN difiere de la línea base; los días pendientes no hacen que un reimport
  idéntico cree revisiones (idempotencia).

### Anotaciones (`calendar_annotations`)

- **DCF** («Descanso Compensación Formación»): su existencia se importa **sin inventar horas** (`HOURS_UNKNOWN`); es informativo
  (`DCF_ALTERS_EFFECTIVE_HOURS=false`) y no crea alerta de reconciliación. OWNER/ADMIN/PLANNER pueden completar el intervalo
  (`HOURS_KNOWN`); EMPLEADO no. Un reimport nunca degrada horas ya completadas.
- **Observaciones** (`[texto]`): se guardan como anotaciones de origen `IMPORT`, distintas de los comentarios escritos por usuarios.
  Cambian el `DOCUMENT_FINGERPRINT`, nunca el `PLAN_FINGERPRINT`.

### Identidad por sistema de origen (`employee_source_identifiers`)

La misma persona tiene números distintos por sistema (`TRYP_EMPLOYEE_CALENDAR`/6888, `TRYP_TEAM_SCHEDULE`/84881). Orden de
resolución: mapeo explícito por organización → identificador canónico → ambigüedad (bloqueo). Nunca por nombre ni por
semejanza. El mapeo lo crea solo un ADMIN+ de forma explícita; un EMPLEADO solo puede importar si el número está asociado a su
propio empleado. El servidor lo exige (`409 SOURCE_IDENTIFIER_MISMATCH` / `SOURCE_IDENTIFIER_UNMAPPED`).

## Plan Empresa inicial sobre datos existentes (bootstrap)

Si el documento es una fuente de Plan Empresa (`PUBLISHED_CALENDAR_EXPORT` o `TEAM_SCHEDULE_EXPORT`), el calendario ya contiene
total o parcialmente sus turnos y no existe baseline versionado para el ámbito, `plan-preview` devuelve
`planBaseline = { status: MISSING, canCreate: true, existingEquivalentRows, newRows, modifiedRows, reviewRows }` y la UI ofrece
«Crear Plan Empresa inicial» (OWNER/ADMIN/PLANNER en su ámbito; EMPLOYEE no, también en servidor).

- El plan es el documento **completo**: el cliente envía también las filas ya existentes; el servidor las reconoce
  (`UNCHANGED`), no las duplica, y solo crea borradores para las `NEW`. Las discrepantes siguen la regla de primera importación
  (pasado → `KEPT_LOCAL`, futuro → `REQUIRES_REVIEW`).
- El calendario efectivo no se modifica y las reconciliaciones pendientes no se resuelven.
- Un `EMPLOYEE_CALENDAR_EXPORT` nunca puede establecer el baseline.
- La revisión guarda autor, import, cobertura, huellas y, en `summary`, `sourceKind` e `initialBaseline` (auditoría).
- Reimportar el mismo documento/plan es `DUPLICATE_FILE` / `DUPLICATE_DOCUMENT` / `DUPLICATE_PLAN`; dos confirmaciones
  simultáneas crean exactamente una revisión. El historial lo muestra como «Plan Empresa inicial».
