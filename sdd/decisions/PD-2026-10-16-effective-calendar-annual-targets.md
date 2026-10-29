# PD-2026-10-16 — Effective calendar, annual targets and provenance

## Metadatos

- Estado: Aprobada (misión explícita de Toni · 2026-10-16).
- Nivel: Product Decision (PD) local.
- Alcance: Calendario, estadísticas, Scheduling (lectura), auditoría, migración GroundSync.

## Decisiones

- `D-EC-01`: las estadísticas se calculan solo sobre el **calendario efectivo**; `origin` pasa a ser
  procedencia, no criterio de cómputo. Se eliminan «Propios» / «Empresa» como acumuladores.
- `D-EC-02`: el plan de empresa tiene revisiones; nada se borra. `SUPERSEDED`, `ABSORBED` y
  `METADATA_ONLY` no computan. `REQUIRES_REVIEW` conserva su estado de incidencia; si su baseline
  actual se determina inequívocamente, ese único estado cuenta provisionalmente hasta resolverlo.
  Las alternativas nunca se suman y la ambigüedad se deja sin computar.
- `D-EC-03`: `JT` (Jefe de Turno) es una función (`duty_role=shift_lead`), no trabajo adicional
  (`JT_COUNTS_AS_ADDITIONAL_WORK=false`).
- `D-EC-04`: el objetivo anual es por empleado y por año, en minutos, sin copiar años; el margen se
  deriva.
- `D-EC-05`: una acción administrativa directa sobre el propio calendario se audita como tal
  (`self_change`); no es una autoaprobación y la política de `approval_requests` no cambia.
- `D-EC-06`: una sola implementación (`src/lib/effective-calendar.js`) para API y cliente.
- `D-EC-07`: solo se aplican reconciliaciones de confianza HIGH; el resto queda `REQUIRES_REVIEW`.
- `D-EC-08` (2026-10-19): el calendario efectivo compartido por API y cliente conserva la incidencia
  y contabiliza provisionalmente solo el baseline actual inequívoco. La reconciliación y estadísticas
  comparten el selector de estado; sin distinción segura, no se computa.
- `D-EC-09` (2026-10-28): cada objetivo anual por empleado/año define qué tipos de turno de trabajo
  suman a sus totales. Por defecto solo se incluye `Regular`; otros tipos de trabajo, como `Extras`,
  se pueden activar en la edición del objetivo. Las métricas individuales por tipo siguen visibles.
- `D-EC-10` (2026-10-29): los objetivos son versiones inmutables por empleado, tipo y periodo, con fechas efectivas. `employee_worktime_targets` es la autoridad activa; `employee_annual_targets` se conserva como compatibilidad histórica.
- `D-EC-11` (2026-10-29): los objetivos CONTRACTUAL y OPERATIONAL son series separadas. Los cambios de Calendar y Planning recalculan el balance sin crear revisiones del objetivo. El crédito computable procede de la política guardada en cada versión.
- `D-EC-12` (2026-10-29): la migración de esquema no inserta filas de política en la organización real. QA Mirror transforma los objetivos históricos; el backfill productivo se difiere a una operación de release revisada.

## Alternativas descartadas

- Sustituir «Propios/Empresa» por otros dos acumuladores: conserva el defecto de dominio.
- Tabla paralela de turnos efectivos: duplica `shifts`; se extiende en su lugar (EXTEND_EXISTING).
- Borrar o reescribir filas legadas: viola la trazabilidad histórica.

## Fuentes

- `docs/product/EFFECTIVE_CALENDAR_CONTRACT.md`
- `db/migrations/0041_effective_calendar_and_annual_targets.sql`
