# Operational Navigation & Time-Scope Contract

**Estado**: aprobado para P5.2 · **Fecha**: 2026-09-06

## Frontera de producto

| Operación | Propósito | Fechas válidas | Dominio | Resultado esperado |
|---|---|---|---|---|
| **Importar turnos** | Incorporar turnos desde un fichero externo | Pasadas, presentes y futuras según el actor y el contrato de importación | Import | Preview antes de escribir; el scope decide qué filas persisten |
| **Añadir turno** | Registrar manualmente un turno histórico | `date < today` en `Europe/Madrid` | Histórico | Sólo el Employee activo y el scope autorizado pueden recibir el turno |
| **Planificar** | Crear o editar planificación operativa | `date >= today` | Scheduling | Borrador semanal; publicación explícita; EMPLOYEE no edita planificación |

La regla normativa es **PASADO → Importar/Añadir turno** y **HOY/FUTURO → Planificar**. No existe
un segundo camino para crear planificación futura. Las filas futuras de un self-import de EMPLOYEE
se excluyen según D-04; no crean `Shift`, `Schedule` ni `ScheduleVersion`.

## Matriz de rol, scope y tiempo

| Capacidad | OWNER | ADMIN | PLANNER | EMPLOYEE |
|---|---|---|---|---|
| Importar propios pasado/presente | Si tiene Employee activo · SELF | Si tiene Employee activo · SELF | Si tiene Employee activo · SELF | Sí · SELF |
| Importar equipo | ORGANIZATION | ORGANIZATION | No, salvo la capacidad ya aprobada por la matriz vigente | No |
| Añadir propios históricos | Si tiene Employee activo · SELF | Si tiene Employee activo · SELF | Si tiene Employee activo · SELF/AREA | Sí · SELF |
| Añadir históricos de terceros | ORGANIZATION | ORGANIZATION | AREA | No |
| Planificar hoy/futuro | ORGANIZATION | ORGANIZATION | AREA o ORGANIZATION sólo sin áreas activas | No |
| Publicar | ORGANIZATION | ORGANIZATION | AREA o ORGANIZATION sólo sin áreas activas | No |
| Ver propios publicados | Si tiene Employee · SELF | Si tiene Employee · SELF | Si tiene Employee · SELF | SELF |
| Solicitar cambio | Si tiene Employee · SELF | Si tiene Employee · SELF | Si tiene Employee · SELF | SELF |
| Aprobar | Según `ApprovalPolicy` | Según `ApprovalPolicy` | No en el endpoint vigente (`403`); P5.2 no añade capacidad nueva | No |

User y Employee siguen siendo entidades distintas. Las capacidades SELF requieren el vínculo
explícito con un Employee `active`; el rol por sí solo no crea identidad operativa.

## Navegación

La shell de gestión usa Sidebar → navegación global y selectores de contexto, TopBar → preferencias e
identidad operativa/autenticada, toolbar de página → filtros y navegación temporal, workspace →
contenido. El TopBar muestra directamente Organización, Rol y Empleado, sin botón ni popover de
contexto duplicado; User conectado y Employee visualizado siguen siendo identidades distintas.
Approval Lite se abre desde **Aprobaciones** en la Sidebar y no ocupa permanentemente el calendario.
EMPLOYEE conserva el Portal de R4.

## Remediación visual y temporal P5.2

La remediación post-M15 mantiene la shell y los dominios existentes, sin migración ni cambio de API:

- el control de Sidebar expanded/collapsed es icon-only, con `aria-label` y tooltip accesible;
- el Planificador semanal ocupa el viewport de la aplicación y su periodo vive en el header del modal;
- el editor de turno del planner sólo aparece bajo demanda en un `ModalShell`, preservando foco, scroll y
  estado del planner;
- la política compartida `src/lib/calendar-actions.ts` deriva el `+` mensual desde rol, fecha, estado
  del Employee y existencia de un draft editable;
- pasado abre **Añadir turno** histórico; hoy/futuro abre **Planificar** sólo con contexto editable;
- EMPLOYEE no puede usar `+` para hoy/futuro ni crear planificación, y los estados deshabilitados
  explican el motivo en ES/EN.

## Zona temporal

La zona operacional vigente es `Europe/Madrid`, centralizada en `src/lib/operational-date.ts` y
`api/_lib/operational-date.js`. No se añade configuración de base de datos en P5.2.
