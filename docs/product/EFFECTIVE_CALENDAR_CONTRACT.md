# Current Calendar, Differences and Annual Statistics Contract

**Estado**: vigente · actualizado 2026-10-19

Este contrato sustituye como modelo operacional las referencias anteriores a Plan Empresa, revisiones y baseline. El estado `CURRENT` del calendario es la única base que cuenta. Una importación distinta crea una `PROPOSED` alternativa; mientras siga pendiente, no reemplaza ni suma al estado actual.

```text
CURRENT → Calendar → Worktime → Counting policy → Target evaluation → Balance
PROPOSED → Differences → user decision
Planning → future worktime projection
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

`calendar_changes` conserva la auditoría del calendario. `employee_annual_targets` queda como compatibilidad histórica; la autoridad activa pasa a `employee_worktime_targets`, cuyas filas son versiones inmutables.

## 6. Objetivos de jornada y saldo

- Cada versión guarda su tipo (`CONTRACTUAL` u `OPERATIONAL`), periodo (`ANNUAL`, `WEEKLY`, `MONTHLY` o `CUSTOM`), fechas explícitas, mínimo, objetivo central opcional, máximo, `effective_from`, revisión, procedencia, notas y categorías de trabajo computables.
- Editar crea una revisión nueva. La revisión anterior permanece consultable y las versiones futuras no se activan antes de `effective_from`.
- Las series del mismo tipo no pueden solaparse con fechas distintas para el mismo empleado. Un objetivo operativo puede coexistir con el contractual.
- El objetivo puede ser exacto (`mínimo = objetivo = máximo`), un rango o un rango con objetivo central. El margen se deriva en minutos.
- Las categorías que computan proceden de cada versión del objetivo. Regular sigue incluido por defecto; Extras y otros trabajos permanecen visibles aunque no computen para ese objetivo.
- Realizado y planificado conservan sus métricas de trabajo bruto. El crédito computable se deriva de la política del objetivo. `proyección = realizado computable + planificado computable`.
- El saldo faltante, la brecha proyectada, el exceso y la media adicional por semana son cálculos derivados. Cambios de Calendar, resolución CURRENT/PROPOSED o Planning no crean revisiones del objetivo.
- Planning sigue siendo la única fuente de horas futuras. Una revisión del objetivo no publica ni duplica Planning.
- Las estadísticas sin objetivo siguen funcionando y no infieren una jornada contractual.

La migration `0048_versioned_worktime_targets.sql` añade la autoridad versionada sin borrar la tabla histórica ni modificar filas de la organización real. La conversión de filas del mirror conserva notas, fuente, periodo y política almacenada. El backfill de política productiva se realiza en una operación de release revisada; no se ejecuta durante QA.

## 7. Terminología visible

| Español | English |
| --- | --- |
| Calendario actual | Current calendar |
| Propuesta detectada | Detected proposal |
| Mantener actual | Keep current |
| Usar propuesta | Use proposal |
| Diferencia pendiente | Pending difference |

La interfaz no muestra nombres internos de estados, `COMPANY_PLAN`, huellas ni UUIDs. El historial puede identificar una versión con un número legible y muestra su vigencia, periodo, límites, política y procedencia. El disclosure estadístico identifica cuántos días pendientes se cuentan provisionalmente con el calendario actual y aclara que las horas se actualizarán al resolverlos.
