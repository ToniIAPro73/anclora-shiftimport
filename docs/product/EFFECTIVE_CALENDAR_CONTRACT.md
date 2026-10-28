# Current Calendar, Differences and Annual Statistics Contract

**Estado**: vigente · actualizado 2026-10-19

Este contrato sustituye como modelo operacional las referencias anteriores a Plan Empresa, revisiones y baseline. El estado `CURRENT` del calendario es la única base que cuenta. Una importación distinta crea una `PROPOSED` alternativa; mientras siga pendiente, no reemplaza ni suma al estado actual.

```text
CURRENT → Calendar → Statistics → Annual target
PROPOSED → Differences → user decision
CURRENT + accepted PROPOSED → History
```

## 1. Modelo vigente

- **CURRENT**: conjunto de turnos y estados que el calendario considera vigentes. Puede incluir varias filas coherentes, por ejemplo Regular + Extras o Regular + Ausencia.
- **PROPOSED**: información importada que difiere de CURRENT y espera decisión.
- **PENDING_DIFFERENCE**: CURRENT sigue vigente; PROPOSED no cuenta.
- **HISTORY**: trazabilidad de qué cambió, cuándo y por qué.
- **Planning**: borradores futuros gestionados mediante schedules, schedule versions y shift assignments. Nunca se publican automáticamente.

La importación histórica idéntica a CURRENT es un noop. Si difiere, conserva CURRENT y registra PROPOSED como `REQUIRES_REVIEW`. Al mantener CURRENT, las estadísticas no cambian. Al usar PROPOSED, el estado anterior queda superseded, la propuesta pasa a `EFFECTIVE` y todos los totales se recalculan.

Calendar, Statistics, Differences, proyección anual y detalle del día usan `src/lib/effective-calendar.js` como resolver compartido. Calendar muestra CURRENT como turno activo; la existencia de una propuesta solo aparece como indicador y en el detalle/Differences.

## 2. Resolución de CURRENT para datos pendientes legacy

El resolver usa la siguiente precedencia:

1. Conjunto válido de filas `EFFECTIVE` de negocio (`CURRENT_EFFECTIVE`).
2. Estado `after_state` de auditoría anterior a la primera propuesta, cuando identifica sus filas sin ambigüedad (`AUDIT_CURRENT`).
3. Intervalo JT legacy válido, si no hay CURRENT de negocio (`LEGACY_JT_AS_REGULAR`). El intervalo se contabiliza provisionalmente como Regular; JT coincidente no duplica horas.
4. Conjunto legacy coherente más antiguo por `created_at` (`LEGACY_OLDEST_FALLBACK`). Se agrupa por `change_id`, `import_id + created_at` o timestamp compartido y se valida con el motor de calendario.

No se usa `updated_at`, orden lexical de UUID ni `company_plan_revisions` para determinar CURRENT. Empates exactos sin evidencia de lineage quedan pendientes (`AMBIGUOUS_TIMESTAMP_TIE`). La falta de `created_at` también queda sin computar. El resolver no muta filas legacy.

Las estadísticas incluyen CURRENT resuelto y CURRENT provisional, nunca PROPOSED. Mantienen `realized = date < today` y `planned = date >= today`. La respuesta incluye los contadores de días revisados, días provisionales, minutos provisionales y días sin computar, además del desglose por fuente de resolución.

## 3. JT legacy

JT continúa siendo metadata de duty, no trabajo adicional cuando ya existe un turno de negocio. Si un JT legacy con intervalo válido es la única evidencia de CURRENT en un día pendiente, se contabiliza ese intervalo provisionalmente como Regular.

- Regular 8 h + JT coincidente 8 h = 8 h.
- JT legacy único 17:00–01:00 pendiente = 8 h Regular provisional.
- JT sin intervalo utilizable no inventa horas.

Los imports nuevos no deben crear un Shift horario solo por detectar JT; el rol se conserva como metadata cuando la fuente lo permite.

## 4. Validación de un día y estadísticas

Tipos canónicos: Regular y Extras (intervalo de trabajo), Ausencia (intervalo no computable), Libre, Vacaciones y Baja (estado de día completo). Los intervalos son `[inicio, fin)`; un fin ≤ inicio cruza medianoche y se atribuye al día de inicio.

Un duplicado exacto no suma dos veces. Solapes entre intervalos y dos estados de día completo incompatibles bloquean el cómputo del conjunto seleccionado. Un usuario OWNER, ADMIN o PLANNER puede confirmar la incorporación manual de un intervalo horario cuando ya existe un estado de día completo; el servidor marca esa fila con `MANUAL_CONFIRMED_WHOLE_DAY_OVERRIDE`. Solo esa marca permite contabilizar juntas ambas entradas. Una combinación sin la marca sigue siendo inconsistente. La unión de intervalos evita duplicar JT.

## 5. Datos y compatibilidad histórica

`shifts.effective_state` mantiene los estados existentes (`EFFECTIVE`, `SUPERSEDED`, `ABSORBED`, `METADATA_ONLY`, `REQUIRES_REVIEW`). `created_at`, `import_id` y `change_id` soportan el fallback legacy.

`layer='COMPANY_PLAN'` y `plan_revision` se conservan como `LEGACY_STORAGE_METADATA`; no identifican CURRENT ni otorgan autoridad. No se borran filas históricas ni se elimina `company_plan_revisions`. El runtime activo de calendario, estadísticas y diferencias no consulta esa tabla. Solo la compatibilidad de auditoría/reversión de importaciones antiguas puede leerla.

Las tablas `calendar_changes` y `employee_annual_targets` mantienen su función de auditoría y objetivos por empleado/año en minutos. No se requiere migración de esquema para este modelo.

## 6. Terminología visible

| Español | English |
| --- | --- |
| Calendario actual | Current calendar |
| Propuesta detectada | Detected proposal |
| Mantener actual | Keep current |
| Usar propuesta | Use proposal |
| Diferencia pendiente | Pending difference |

La interfaz no muestra nombres internos de estados, `COMPANY_PLAN`, huellas, revisiones ni UUIDs. El disclosure estadístico identifica cuántos días pendientes se cuentan provisionalmente con el calendario actual y aclara que las horas se actualizarán al resolverlos.
