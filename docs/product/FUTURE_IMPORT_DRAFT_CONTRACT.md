# Historical Import and Future Planning Draft Contract

**Estado**: vigente · actualizado 2026-10-30 (enmienda F0 aprobada: auto-publicación condicionada; **no implementada hasta F1**, por lo que el runtime actual sigue sin publicar)

Autoridad de implementación de la enmienda: `docs/specs/SPEC-SHIFTIMPORT-PLANNING-SIMPLIFICATION-MOBILE-AND-VACATIONS.md` (§0.3, §4.1).

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

- `historical-and-plan` **nunca publica** un borrador; conserva exactamente su semántica. El valor legado `publish` se acepta en el cable como `historical-and-plan` y **jamás** auto-publica.
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

## Auto-publicación condicionada (`historical-and-auto-publish`)

Existen tres decisiones y siguen diferenciadas: `historical-only` (por defecto y seguro), `historical-and-plan` (borradores) e `historical-and-auto-publish`.

La regla **no** es «toda importación publica». Una importación puede auto-publicar únicamente bajo las condiciones de seguridad, scope, fecha, granularidad, atribución y ausencia de conflicto siguientes; si falla cualquiera, esa fila queda en borrador o revisión (fail closed):

1. el actor tiene permiso efectivo de planificación/publicación sobre ese empleado o área (scope real: `ORGANIZATION`, `AREAS` o `EMPLOYEES`);
2. el turno es válido (sin solape, sin conflicto de día completo, sin violar el descanso mínimo vigente);
3. la fecha es hoy o futura en `Europe/Madrid` (lo anterior sigue la ruta histórica);
4. el par `(empleado, fecha)` forma parte de la propia importación; nunca se publican borradores de otros empleados o fechas;
5. no existe conflicto bloqueante (`REQUIRES_REVIEW`, vacación aprobada);
6. no existe procedencia manual protegida: la auto-publicación nunca sobrescribe ni absorbe turnos manuales, borradores manuales ni procedencias que no puedan atribuirse inequívocamente a la importación;
7. no existe modificación pendiente incompatible;
8. cualquier ambigüedad degrada a borrador/revisión.

La publicación es granular por par, no de versión completa, y todo lo retenido aparece en el resultado con su motivo. Es reversible 1:1 mientras nada la haya tocado (`IMPORT_REVERSION_CONTRACT.md`). EMPLOYEE no importa futuro. Detalle, máquina de estados y códigos de motivo: spec canónica §2.2 y §4.1.
