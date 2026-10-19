# Historical Import and Future Planning Draft Contract

**Estado**: vigente · actualizado 2026-10-19

Este documento describe el flujo vigente de importación. El modelo de Plan Empresa versionado y el bootstrap de un baseline quedan retirados del runtime activo.

## Historical import

Las filas importadas para fechas pasadas se comparan con el estado `CURRENT` del calendario:

- Incoming == CURRENT: noop; no se crea una diferencia ni una fila duplicada.
- Incoming != CURRENT: CURRENT permanece vigente y computable; Incoming queda como `PROPOSED` (`REQUIRES_REVIEW`) hasta una decisión explícita.
- Un día que ya espera resolución no se resuelve mediante reimportación.
- Una fecha ausente en el documento no significa que se deba borrar el estado actual.

Un nuevo conflicto conserva las filas actuales `EFFECTIVE` y crea sus alternativas como `REQUIRES_REVIEW`. Calendar muestra únicamente CURRENT como activo. Statistics computa CURRENT. Differences presenta `Calendario actual` y `Propuesta detectada`.

## Future import

La decisión `historical-and-plan` autoriza el efecto histórico descrito arriba y la creación o actualización de borradores futuros de Planning. El destino futuro es `schedules` / `schedule_versions` / `shift_assignments`.

- La importación nunca publica un borrador.
- No se crea `company_plan_revisions`, un baseline ni una revisión N+1.
- La planificación se revisa y publica desde Planning.
- Reimportaciones idénticas son idempotentes.

## Legacy compatibility

`company_plan_revisions` y las filas antiguas con `layer='COMPANY_PLAN'` permanecen como metadatos de almacenamiento/auditoría. No son fuente de CURRENT ni intervienen en Calendar, Statistics, Differences o nuevas confirmaciones. La reversión debe seguir leyendo registros de revisión que pertenezcan a importaciones históricas creadas por versiones anteriores; las nuevas confirmaciones no escriben revisiones.

Los códigos de clasificación históricos `COMPANY_PLAN` / `COMPANY_PLAN_UPDATE` pueden aparecer en registros de importación antiguos. La UI los presenta con nombres de Planning; no reactivan el antiguo modelo.

## Source and identity handling

La clase de fuente describe el contenido importado, no la autoridad sobre el calendario. Las fuentes de calendario y los cuadrantes de equipo obedecen la misma comparación CURRENT / Incoming para fechas históricas. Los alias de empleado se resuelven mediante `employee_source_identifiers` y el servidor valida la pertenencia a organización y el ámbito de acceso.

Anotaciones DCF y observaciones permanecen separadas de los turnos. DCF no inventa intervalos; un reimport no degrada información ya completada.

## QA

Los fixtures son sintéticos. La integración persistente usa exclusivamente `ShiftImport — QA Mirror`; la organización `ShiftImport` se mantiene de solo lectura. Los escenarios de aceptación cubren importación idéntica, diferencia con CURRENT preservado, borrador futuro sin publicación y reversión de importaciones legacy.
