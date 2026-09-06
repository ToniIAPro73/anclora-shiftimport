# Future Import to Draft Scheduling Contract

**Estado**: implementado en P5.5 · 2026-09-06

Este contrato separa el histórico operativo de la planificación futura. No introduce un modelo
paralelo: utiliza `Shift` para histórico y `Schedule` → `ScheduleVersion` → `ShiftAssignment` para
hoy/futuro.

## Frontera temporal

La fecha operativa se calcula con el helper canónico de producto (`Europe/Madrid`):

- `date < today` → `HISTORICAL`; se persiste como `Shift`.
- `date >= today` → `FUTURE_DRAFT`; se persiste como assignment dentro de una versión `DRAFT`.

La frontera es la misma en frontend y backend. Un `Shift` histórico nunca representa una fila de
hoy o futura proveniente de este flujo.

## Consentimiento

Si el análisis contiene filas de hoy/futuras, OWNER, ADMIN y PLANNER deben elegir por importación:

1. importar solo históricos; o
2. importar históricos y añadir hoy/futuro a planificación en borrador.

La opción segura por defecto es no confirmar la creación del borrador. Cerrar el flujo cancela sin
escrituras. El backend exige `futureConsent: "draft"` para cualquier solicitud que contenga filas
de hoy/futuras; la UI no es la autoridad de seguridad.

EMPLOYEE conserva SELF import histórico y excluye hoy/futuro sin crear `ScheduleVersion` ni
`ShiftAssignment`.

## Scheduling

- Cada semana y área resuelve un `Schedule` único y reutiliza su `DRAFT` editable.
- Si solo existe una versión publicada, nunca se modifica directamente; la resolución sigue el
  mecanismo canónico de nueva versión editable.
- El import no publica automáticamente.
- La preferencia de inicio de semana (`monday`/`sunday`) se transmite como preferencia de agrupación;
  el backend sigue validando organización, scope, Employee activo y estado `DRAFT`.

## Resultado

El resultado distingue históricos persistidos/existentes, assignments futuros creados/existentes,
semanas afectadas y el enlace `Ver planificación`. El calendario operativo solo muestra turnos
publicados; Planner muestra los borradores importados.

## Seguridad e idempotencia

El endpoint `/api/imports/confirm-split` resuelve autenticación, tenant, rol, scope y Employee
activo en backend. EMPLOYEE no puede usarlo para futuro. Las claves existentes de importación y la
deduplicación semántica de assignments se conservan; reimportar no duplica históricos, drafts ni
assignments.
