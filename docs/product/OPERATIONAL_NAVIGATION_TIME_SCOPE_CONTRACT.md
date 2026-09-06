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

La shell de gestión usa Sidebar → navegación global, TopBar → preferencias e identidad, toolbar de
página → filtros y navegación temporal, workspace → contenido. Approval Lite se abre desde
**Aprobaciones** en la Sidebar y no ocupa permanentemente el calendario. EMPLOYEE conserva el Portal
de R4.

## Zona temporal

La zona operacional vigente es `Europe/Madrid`, centralizada en `src/lib/operational-date.ts` y
`api/_lib/operational-date.js`. No se añade configuración de base de datos en P5.2.
