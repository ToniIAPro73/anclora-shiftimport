# Future Import and Automatic Publication Contract

**Estado**: vigente; supersede parcialmente la decisión P5.5 · 2026-10-15

Este contrato separa el histórico operativo de la planificación futura y conserva el dominio
canónico `Shift` → `Schedule` → `ScheduleVersion` → `ShiftAssignment`.

## Frontera temporal y consentimiento

La fecha operativa se calcula con el helper canónico (`Europe/Madrid`): `date < today` es histórico
y se persiste como `Shift`; `date >= today` es futuro. OWNER, ADMIN y PLANNER deben elegir entre
importar solo históricos o importar históricos y publicar futuros. La segunda opción envía
`futureConsent: "publish"`. Cerrar el flujo cancela sin escrituras. EMPLOYEE conserva SELF histórico
y no puede crear planificación futura.

## Scheduling y publicación

El backend valida tenant, rol, scope de todas las áreas/empleados afectados y estado activo del
empleado. Agrupa por semana y área. Reutiliza un DRAFT solo si no contiene assignments de otro
import; el trabajo compartido provoca un conflicto explícito. Nunca modifica versiones PUBLISHED.
La publicación usa el mismo CTE canónico que Planning y toda la operación es una transacción: una
validación fallida en cualquier semana revierte import, historial, assignments y publicaciones.
Los shifts aparecen en Calendario tras materializarse. El inicio de semana respeta la preferencia
`monday`/`sunday`.

## Resultado e idempotencia

El resultado informa shifts históricos persistidos/existentes, assignments futuros nuevos/existentes
y semanas publicadas. Repetir el mismo archivo/contexto devuelve el resultado previo sin insertar
assignments ni materializar shifts adicionales. EMPLOYEE y la modalidad guest/local-first no reciben
auto-publicación.

La decisión P5.5 `Import ≠ Publish` se conserva en el historial y sigue aplicando al resto de flujos.
Queda supersedida solo para Safe Import remoto, con rol efectivo OWNER/ADMIN/PLANNER, scope válido y
consentimiento explícito `publish`.
