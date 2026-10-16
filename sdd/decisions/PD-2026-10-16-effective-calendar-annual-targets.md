# PD-2026-10-16 — Effective calendar, annual targets and provenance

## Metadatos

- Estado: Aprobada (misión explícita de Toni · 2026-10-16).
- Nivel: Product Decision (PD) local.
- Alcance: Calendario, estadísticas, Scheduling (lectura), auditoría, migración GroundSync.

## Decisiones

- `D-EC-01`: las estadísticas se calculan solo sobre el **calendario efectivo**; `origin` pasa a ser
  procedencia, no criterio de cómputo. Se eliminan «Propios» / «Empresa» como acumuladores.
- `D-EC-02`: el plan de empresa tiene revisiones; nada se borra. Los estados `SUPERSEDED`,
  `ABSORBED`, `METADATA_ONLY` y `REQUIRES_REVIEW` no computan.
- `D-EC-03`: `JT` (Jefe de Turno) es una función (`duty_role=shift_lead`), no trabajo adicional
  (`JT_COUNTS_AS_ADDITIONAL_WORK=false`).
- `D-EC-04`: el objetivo anual es por empleado y por año, en minutos, sin copiar años; el margen se
  deriva.
- `D-EC-05`: una acción administrativa directa sobre el propio calendario se audita como tal
  (`self_change`); no es una autoaprobación y la política de `approval_requests` no cambia.
- `D-EC-06`: una sola implementación (`src/lib/effective-calendar.js`) para API y cliente.
- `D-EC-07`: solo se aplican reconciliaciones de confianza HIGH; el resto queda `REQUIRES_REVIEW`.

## Alternativas descartadas

- Sustituir «Propios/Empresa» por otros dos acumuladores: conserva el defecto de dominio.
- Tabla paralela de turnos efectivos: duplica `shifts`; se extiende en su lugar (EXTEND_EXISTING).
- Borrar o reescribir filas legadas: viola la trazabilidad histórica.

## Fuentes

- `docs/product/EFFECTIVE_CALENDAR_CONTRACT.md`
- `db/migrations/0041_effective_calendar_and_annual_targets.sql`
