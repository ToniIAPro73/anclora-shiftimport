# Future Import and Company Plan Contract

> Terminología visible: esta documentación usa el lenguaje interno del dominio; la UI usa otro a propósito. Mapeo canónico en [`EFFECTIVE_CALENDAR_CONTRACT.md`](EFFECTIVE_CALENDAR_CONTRACT.md#user-facing-terminology-internal-domain-language--user-facing-language).

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
| `EMPLOYEE_CALENDAR_EXPORT` | hoja `Leyenda` con `Calendario = Empleado` | **instantánea enriquecida** del calendario individual (clase `EMPLOYEE_CALENDAR_SNAPSHOT`): se compara solo con el calendario actual; puede aportar DCF/bajas/observaciones; nunca crea revisión de plan |
| `PUBLISHED_CALENDAR_EXPORT` | `Calendario = Publicado` | **instantánea básica** del mismo calendario individual (clase `EMPLOYEE_CALENDAR_SNAPSHOT`); ya no es fuente de Plan Empresa ni de línea base |
| `TEAM_SCHEDULE_EXPORT` | estructura de equipo (PDF/XLSX multiempleado con nómina) | clase `TEAM_PLANNING`: pasado = evidencia del calendario, futuro = Planificación como BORRADOR (nunca se publica solo); usa `company_plan_revisions` como detalle interno/legacy |

**Regla temporal canónica (2026-10-18).** Las fechas históricas importadas alimentan el Calendario. Para OWNER, ADMIN y PLANNER
autorizados (capacidad `PLANNER`, dentro de su ámbito), las fechas futuras de **cualquiera de los tres formatos** pueden añadirse
opcionalmente a Planificación como borrador (`futureConsent = 'historical-and-plan'`; sin decisión → 0 escrituras futuras,
`FUTURE_IMPORT_CONSENT_REQUIRED`). Importar nunca publica. EMPLOYEE solo importa datos históricos propios: el servidor rechaza
cualquier intento de planificación futura (`SELF_IMPORT_FUTURE_FORBIDDEN`) aunque se fuerce la decisión; la UI solo informa
(«Solo se importarán los turnos anteriores a hoy»). El **tipo de documento** (clase de negocio) y el **destino de una fecha**
(ruteo temporal) son dimensiones independientes: que una fila futura de un XLSX vaya a Planificación no convierte el XLSX en
Plan Empresa ni crea `company_plan_revisions`. El Calendario muestra los borradores del mes del empleado como filas de solo
lectura marcadas «Borrador» (nunca como turnos publicados); se revisan y publican desde Planificación.
Prueba dirigida: `scripts/qa/future-routing-e2e.mjs`.

La clasificación vive en un único lugar: `api/_lib/source-class.js` (`getSourceBusinessClass`). Las dos instantáneas se tratan como el mismo modelo de calendario: si coinciden → sin cambios (no duplica); si una solo añade DCF/observaciones → enriquece el día; si hay diferencia real de turno/estado → política segura existente (`EVIDENCE_APPLIED` solo sobre días de plan puro, si no `REQUIRES_REVIEW`); un día ausente en una instantánea nunca se interpreta como orden de borrado. Las filas futuras de una instantánea, si las hay, entran como borrador de Planificación (no existe otra vía de escritura futura al calendario) y no crean revisión.

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

## Registro interno inicial sobre datos existentes (bootstrap; detalle legacy, no visible)

> Desde 2026-10-18 la interfaz ya no ofrece «crear referencia inicial»: no hay tarjeta ni CTA. El `planBaseline` de `plan-preview` se conserva por compatibilidad de API y solo puede ser `canCreate` para `TEAM_SCHEDULE_EXPORT`.

Si el documento es un cuadrante de empresa (`TEAM_SCHEDULE_EXPORT`), el calendario ya contiene
total o parcialmente sus turnos y no existe baseline versionado para el ámbito, `plan-preview` devuelve
`planBaseline = { status: MISSING, canCreate: true, existingEquivalentRows, newRows, modifiedRows, reviewRows }` y la UI ofrece
«Crear Plan Empresa inicial» (OWNER/ADMIN/PLANNER en su ámbito; EMPLOYEE no, también en servidor).

- El plan es el documento **completo**: el cliente envía también las filas ya existentes; el servidor las reconoce
  (`UNCHANGED`), no las duplica, y solo crea borradores para las `NEW`. Las discrepantes siguen la regla de primera importación
  (pasado → `KEPT_LOCAL`, futuro → `REQUIRES_REVIEW`).
- El calendario efectivo no se modifica y las reconciliaciones pendientes no se resuelven.
- Una instantánea de calendario individual (`EMPLOYEE_CALENDAR_EXPORT`, `PUBLISHED_CALENDAR_EXPORT`) nunca puede establecer el baseline.
- La revisión guarda autor, import, cobertura, huellas y, en `summary`, `sourceKind` e `initialBaseline` (auditoría).
- Reimportar el mismo documento/plan es `DUPLICATE_FILE` / `DUPLICATE_DOCUMENT` / `DUPLICATE_PLAN`; dos confirmaciones
  simultáneas crean exactamente una revisión. El historial lo muestra como «Plan Empresa inicial».

### Identidad canónica vs alias de origen (XLSX individuales TRYP)

Dos identidades que no se mezclan: la **canónica de ShiftImport** (nombre + `employees.external_employee_id`, p. ej. 84881) y el
**alias de la fuente** (código de nómina de la hoja `Leyenda`, p. ej. 6888, en `employee_source_identifiers`, sistema
`TRYP_EMPLOYEE_CALENDAR`, compartido por «Calendario empleado» y «Calendario publicado»). El alias nunca sustituye al ID
canónico ni se muestra como ID del empleado.

- El empleado seleccionado en el calendario es el destino inicial: el modal muestra su nombre y su ID canónico (solo lectura).
- Resolución (servidor, determinista): alias asociado → ID canónico → nombre exacto único (normalizado: mayúsculas, acentos,
  puntuación, espacios; sin fuzzy). En el QA Mirror se ignora únicamente el sufijo « — QA» propio del mirror.
- Nombre único sin alias: se **propone** el empleado y se pide «Asociar y continuar»; solo tras persistir y releer la
  asociación se abre la importación. Varios candidatos o ninguno → selección manual. Alias asociado a A pero nombre de B →
  bloqueo (`MISMATCH`).
- EMPLOYEE: auto-asociación solo de su propio registro (XLSX individual validado, nombre que lo identifica sin ambigüedad);
  nunca a otro empleado; solo importa histórico (el futuro se excluye, sin escrituras de planificación).

## Reversión de importaciones

Eliminar una importación **ya no es** un rollback lógico. Revertir una importación (una o varias, orden calculado por el servidor, atómico,
auditable) está definido en [IMPORT_REVERSION_CONTRACT.md](IMPORT_REVERSION_CONTRACT.md).
