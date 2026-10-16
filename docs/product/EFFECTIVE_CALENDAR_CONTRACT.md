# Effective Calendar, Annual Targets and Provenance Contract

**Estado**: vigente · 2026-10-16 · migración `0041_effective_calendar_and_annual_targets.sql`

Sustituye las antiguas estadísticas paralelas «Propios» / «Empresa» (que sumaban según `origin`) por
un cálculo único sobre el **calendario efectivo**. `origin` sigue existiendo como procedencia; ya no
decide qué se cuenta.

```
PLAN EMPRESA → CAMBIOS / INCIDENCIAS → CALENDARIO EFECTIVO → CÓMPUTO HORARIO → OBJETIVO ANUAL
                                    ↘ HISTORIAL / AUDITORÍA (nada se borra)
```

## 1. Modelo de datos (EXTEND_EXISTING)

`shifts` conserva cada fila histórica y añade:

| Columna | Valores | Significado |
| --- | --- | --- |
| `layer` | `COMPANY_PLAN`, `CHANGE` | plan comunicado por la empresa vs. cambio/incidencia |
| `provenance` | `COMPANY_IMPORT`, `MANUAL_ADMIN_CHANGE`, `EMPLOYEE_REQUEST`, `SCHEDULE_PUBLICATION`, `MIGRATION`, `SYSTEM` | cómo entró el hecho |
| `legacy_origin` | `PDF`, `MAN` | procedencia original recuperada de GroundSync |
| `duty_role` | `shift_lead` | función (antes `JT`), nunca horas |
| `effective_state` | `EFFECTIVE`, `SUPERSEDED`, `ABSORBED`, `METADATA_ONLY`, `REQUIRES_REVIEW` | pertenece o no al calendario efectivo |
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

Solo cuentan las filas `EFFECTIVE`. Tipos canónicos: `Regular` y `Extras` (computan trabajo, con
intervalo), `Ausencia` (intervalo, no computa), `Libre`, `Vacaciones`, `Baja` (día completo,
exclusivos, no computan).

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

Calculadas únicamente sobre el calendario efectivo, en minutos enteros
(`src/lib/effective-calendar.js`, compartido por API y cliente):

- Mes y año: horas efectivas, Regular, Extras, Ausencias, días trabajados, Libre, Vacaciones, Baja.
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
(`REQUIRES_REVIEW`). Solo se aplica `HIGH`; el resto se marca `REQUIRES_REVIEW` para no contar horas
sin decisión. `--apply` exige copia verificada, una sola transacción y demuestra que ningún otro
empleado cambió; `--rollback` restaura el estado previo. Los días futuros que solo existen en el
Excel no se escriben desde aquí: pertenecen al flujo de importación/publicación.
