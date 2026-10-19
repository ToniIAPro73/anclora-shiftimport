# Effective Calendar, Annual Targets and Provenance Contract

**Estado**: vigente · actualizado 2026-10-19 · migración `0041_effective_calendar_and_annual_targets.sql`

Sustituye las antiguas estadísticas paralelas «Propios» / «Empresa» (que sumaban según `origin`) por
un cálculo único sobre el **calendario efectivo**. `origin` sigue existiendo como procedencia; ya no
decide qué se cuenta.

```
PLAN EMPRESA → CAMBIOS / INCIDENCIAS → CALENDARIO EFECTIVO → CÓMPUTO HORARIO → OBJETIVO ANUAL
                                    ↘ HISTORIAL / AUDITORÍA (nada se borra)
```

## User-facing terminology (INTERNAL DOMAIN LANGUAGE != USER-FACING LANGUAGE)

User-facing terminology intentionally differs from internal domain terminology. The internal names stay in code, DB, API,
contracts, tests and technical logs; the UI shows the simplified model **Calendario · Planificación · Importar · Diferencias ·
Historial**. This section is the single canonical mapping; the other product contracts only reference it.

| Internal | Visible (ES / EN) |
| --- | --- |
| `company_plan_revisions`, Plan Empresa | **No visible.** Detalle interno/legacy del cuadrante de empresa (PDF); no es un concepto de usuario. El usuario ve Planificación / Planning |
| first revision (baseline) | **No visible.** Se crea, si procede, dentro de la confirmación ordinaria de un cuadrante de empresa; no hay tarjeta ni CTA de «referencia inicial» |
| revision N | Nunca se muestra como dato principal ni como «Actualización N» |
| effective calendar | Calendario · Calendario actual / Calendar · Current calendar |
| reconciliation, `REQUIRES_REVIEW` | Diferencias · Diferencia pendiente / Differences · Pending difference |
| before / now / effective | Información anterior · Nueva información · Calendario actual (neutral: no se afirma que proceda de la empresa; el rótulo de fuente solo se muestra si es fiable) |
| `KEPT_LOCAL` | «Se mantiene el cambio que ya existe en el calendario» |
| `COMPANY_ADOPTED_LOCAL` | «La empresa ha comunicado ahora el mismo turno que ya tienes en el calendario» |
| `TEAM_SCHEDULE_EXPORT` | Cuadrante de empresa |
| `PUBLISHED_CALENDAR_EXPORT` | Mensual publicado (instantánea básica del calendario individual) |
| `EMPLOYEE_CALENDAR_EXPORT` | Calendario del empleado (instantánea enriquecida: DCF, bajas, observaciones) |
| Schedule / ScheduleVersion | Planificación (Borrador · Publicada · Bloqueada · Completada) |

Guard: `src/lib/visible-model-copy.test.ts` fails if an internal term appears in any visible i18n string.

## 1. Modelo de datos (EXTEND_EXISTING)

`shifts` conserva cada fila histórica y añade:

| Columna | Valores | Significado |
| --- | --- | --- |
| `layer` | `COMPANY_PLAN`, `CHANGE` | plan comunicado por la empresa vs. cambio/incidencia |
| `provenance` | `COMPANY_IMPORT`, `MANUAL_ADMIN_CHANGE`, `EMPLOYEE_REQUEST`, `SCHEDULE_PUBLICATION`, `MIGRATION`, `SYSTEM` | cómo entró el hecho |
| `legacy_origin` | `PDF`, `MAN` | procedencia original recuperada de GroundSync |
| `duty_role` | `shift_lead` | función (antes `JT`), nunca horas |
| `effective_state` | `EFFECTIVE`, `SUPERSEDED`, `ABSORBED`, `METADATA_ONLY`, `REQUIRES_REVIEW` | estado de resolución; `REQUIRES_REVIEW` puede tener un baseline provisional contable sin dejar de ser incidencia |
| `plan_revision` | entero ≥ 1 | revisión del plan de empresa que representa |
| `superseded_at`, `change_id` | | trazabilidad |

Tablas nuevas (únicas entidades realmente nuevas; no hay dominio equivalente):

- `calendar_changes`: quién (`actor_user_id`, `actor_role`), cuándo, por qué (`reason`), `before_state`
  / `after_state` (instantáneas del día), `self_change`, `source`, `approval_status`, referencia a
  `approval_requests`, `change_requests` y al shift original.
- `employee_annual_targets`: **por empleado y por año** (`UNIQUE (organization_id, employee_id,
  year)`), en **minutos**. El margen no se almacena: `maximum − minimum`.

Reutilizados sin duplicar: `change_requests`, `approval_requests`, `organization_audit_events`
(nuevos tipos `EMPLOYEE_ANNUAL_TARGET_SET/UPDATED`, `CALENDAR_CHANGE_APPLIED`,
`CALENDAR_DAY_RECONCILED`), `imports` (procedencia de cada revisión de empresa).

## 2. Calendario efectivo y tipos

Las filas `EFFECTIVE` cuentan como definitivas. Un día pendiente de revisión sigue siendo
`REQUIRES_REVIEW` y aparece en Diferencias. Si el calendario actual puede determinarse de forma
inequívoca mediante el conjunto `EFFECTIVE` vigente o la selección local que la reconciliación
muestra frente al plan de empresa actual, ese único conjunto cuenta provisionalmente. Las filas
alternativas no se suman. Si no se puede distinguir el estado actual, el día permanece sin computar.
Al resolverlo, el resultado elegido pasa a ser definitivo y sustituye el cómputo provisional.

Tipos canónicos: `Regular` y `Extras` (computan trabajo, con intervalo), `Ausencia` (intervalo, no
computa), `Libre`, `Vacaciones`, `Baja` (día completo, exclusivos, no computan).

Intervalos `[inicio, fin)`; un fin ≤ inicio cruza medianoche y se atribuye al día de inicio. El
solape con el día siguiente también se comprueba.

Matriz (sobre el calendario **efectivo**, nunca sobre plan + cambios): válidos `Regular`, `Extras`,
`Ausencia`, día completo, `Regular+Extras` sin solape, `Regular+Ausencia` segmentados; inválidos
solapes, día completo + trabajo, dos días completos distintos, duplicados semánticos. Un duplicado
exacto no suma dos veces. Un día con inconsistencia bloqueante **no aporta minutos** y se lista como
pendiente (nunca se infla ni se oculta).

## 3. JT = Jefe de Turno (legado)

`JT_COUNTS_AS_ADDITIONAL_WORK=false`. `JT` es una función, no trabajo adicional: se migra a
`duty_role='shift_lead'` y la fila queda `METADATA_ONLY`. El motor ignora `JT` por tipo aunque la
fila no esté migrada. Un día cuya única fila es `JT` se marca pendiente de reconciliación (no se
inventan horas). Los imports nuevos no deben crear un `Shift` horario solo por detectar `JT`.

## 4. Plan de empresa, cambios y conflictos

- Una nueva importación de empresa crea una **revisión** (`plan_revision + 1`); las anteriores quedan
  `SUPERSEDED`.
- Un cambio administrativo (`POST /api/calendar/changes`) registra el cambio, marca como
  `SUPERSEDED` lo reemplazado e inserta filas `layer='CHANGE'`. Si el día resultante fuese
  inconsistente se rechaza (422).
- Si una nueva revisión de empresa choca con un cambio efectivo existente, **no** se sobrescribe:
  `COMPANY_UPDATE_CONFLICTS_WITH_EFFECTIVE_OVERRIDE`, resolución administrativa explícita.
- Un día `REQUIRES_REVIEW` se resuelve con `POST /api/calendar/changes {action:'RECONCILE',
  keepShiftIds, reason}`; la decisión queda registrada (`RECONCILIATION`).

**Revisiones de plan por importación (2026-10-16).** El Plan Empresa futuro se versiona en
`company_plan_revisions` (baseline `B`); la reconciliación a tres bandas `B/N/E` está en
`FUTURE_IMPORT_DRAFT_CONTRACT.md`. Una discrepancia genera filas `layer='COMPANY_PLAN'`,
`effective_state='REQUIRES_REVIEW'`, `plan_revision` = revisión vigente, que aparecen en la reconciliación
sin tocar el calendario efectivo. Las horas planificadas (borradores) no se suman como realizadas.

## 5. Permisos

| Acción | OWNER | ADMIN | PLANNER | EMPLOYEE |
| --- | --- | --- | --- | --- |
| Configurar objetivo anual | sí | sí | no (solo lectura en su scope) | no |
| Leer objetivo anual | sí | sí | en scope | solo el propio |
| Cambio administrativo directo | sí | sí | en scope | no (usa solicitudes) |
| Reconciliar un día | sí | sí | en scope | no |

La autorización procede de la **membresía/rol**, no del perfil de empleado. Un ADMIN con perfil de
empleado conserva una sola identidad: cuando cambia su propio calendario se registra
`actor_user_id` = su usuario, `actor_role='ADMIN'`, `self_change=true`, motivo y antes/después.
**Acción administrativa directa ≠ solicitud aprobada por el mismo usuario**: la política
anti-autoaprobación de `approval_requests` no cambia; el cambio directo es una acción auditable, no
una aprobación.

## 6. Estadísticas

Calculadas sobre el calendario efectivo y, cuando es inequívoco, sobre el único baseline provisional
de días pendientes, en minutos enteros
(`src/lib/effective-calendar.js`, compartido por API y cliente):

- Mes y año: horas efectivas, Regular, Extras, Ausencias, días trabajados, Libre, Vacaciones, Baja.
- Las métricas identifican cuántos días pendientes y minutos están incluidos provisionalmente, y
  cuántos días pendientes no se computan por ambigüedad o conflicto.
- **Realizado** (`date < hoy operativo`) separado de **planificado futuro** (`date ≥ hoy`); lo
  futuro nunca se etiqueta como efectivo.
- Contrato por empleado/año: `UNCONFIGURED`, `BELOW_MINIMUM`, `WITHIN_RANGE`, `ABOVE_MAXIMUM`; margen
  usado `min(margen, max(0, efectivas − mínimo))`, restante `max(0, máximo − max(efectivas, mínimo))`.
  Información operativa, no una conclusión legal ni de nómina.
- Sin objetivo configurado: «Objetivo anual no configurado» y botón **Configurar** (OWNER/ADMIN); las
  estadísticas efectivas se calculan igualmente. No se copian objetivos entre años.

API: `GET|PUT /api/calendar/annual-targets`, `GET /api/calendar/stats`,
`GET|POST /api/calendar/changes`.

## 7. Reconciliación de datos legados

`scripts/reconciliation/reconcile-employee-calendar.mjs` (dry-run por defecto, un empleado, un año):
contrasta calendario actual de la empresa (Excel), filas de ShiftImport y GroundSync (solo lectura,
recupera `PDF`/`MAN`). Confianza `HIGH` (se aplica), `MEDIUM` (requiere regla) y `LOW`
(`REQUIRES_REVIEW`). Solo se aplica `HIGH`; el resto se marca `REQUIRES_REVIEW` y nunca se decide
automáticamente. Un baseline actual inequívoco puede contarse provisionalmente hasta que el usuario
resuelva la diferencia. `--apply` exige copia verificada, una sola transacción y demuestra que ningún otro
empleado cambió; `--rollback` restaura el estado previo. Los días futuros que solo existen en el
Excel no se escriben desde aquí: pertenecen al flujo de importación/publicación.

## 8. Anotaciones y explicación de reconciliación

- El calendario muestra solo la capa efectiva; **DCF** y **observaciones** aparecen como indicadores discretos. Un DCF sin horas
  muestra «Horario no especificado» en el detalle del día y no altera horas efectivas ni estadísticas.
- El modal de reconciliación muestra por día **Empresa antes / Empresa ahora / Calendario efectivo** y el motivo en lenguaje
  natural (sin UUID ni huellas). En días pendientes, «efectivo» es lo que el calendario tenía localmente frente al plan.
