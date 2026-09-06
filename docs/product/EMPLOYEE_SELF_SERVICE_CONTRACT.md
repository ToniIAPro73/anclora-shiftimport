# Employee self-import contract

Estado: implementado en P5.4; contrato aprobado para P5/P5.4 (D-03, D-04) · 2026-09-06

## Alcance

Un usuario con rol `EMPLOYEE` y un `Employee` vinculado en estado `active` puede importar sus
propios turnos. La operación se ejecuta exclusivamente con scope `SELF`; el backend resuelve el
`employee_id` desde la sesión y no acepta que el cliente lo sustituya.

El EMPLOYEE no puede crear o reactivar Employees, resolver identidades ajenas, importar para otro
Employee ni utilizar este flujo como importación de equipo.

## Ficheros multiempleado

El análisis puede recibir filas de varias personas, pero solo se conservan las filas atribuidas de
forma inequívoca al Employee vinculado. Las filas ajenas y las no identificables se excluyen con
recuento visible antes de confirmar y en el resultado persistente. Si no aparece la identidad propia,
el resultado es `blocked` con razón `SELF_IDENTITY_NOT_FOUND` y no se escribe ningún turno. La
ambigüedad material también bloquea la operación y exige una elección explícita.

## Fechas futuras

El self-import solo puede escribir turnos pasados y presentes. Las filas propias futuras se excluyen
con recuento y explicación (`SELF_FUTURE_ROWS_EXCLUDED`); no crean `Shift`, `Schedule` ni
`ScheduleVersion`, y no habilitan el planificador ni la publicación.

## Garantías server-side

- Un `Employee` debe pertenecer a la organización activa y estar `active`.
- Un `employee_id` ajeno o de otra organización se rechaza con 403 y sin mutaciones.
- Un EMPLOYEE sin vínculo activo queda bloqueado con `SCOPE_UNAVAILABLE`.
- La previsualización precede a la escritura; la idempotencia y la atomicidad existentes se conservan.
- La UI muestra el desglose, pero no sustituye las comprobaciones de autorización del backend.

## Portal de autoservicio (P5.4)

El portal conserva su navegación `Hoy` / `Semana` / `Solicitudes` / `Más` y mantiene scope `SELF`.
`Hoy` y `Semana` muestran únicamente turnos publicados del Employee vinculado. Desde el detalle de
un turno y desde `Solicitudes`, el Employee puede crear una solicitud de cambio usando el dominio
`ChangeRequest` existente; no puede editar el turno directamente ni aprobar solicitudes.

`Más` expone `Importar mis turnos` y `Añadir turno pasado`. Ambas entradas reutilizan los flujos
existentes: el import filtra filas propias y excluye futuro, y el alta manual sólo acepta `date <
today` en `Europe/Madrid`. El backend sigue resolviendo identidad, organización, Employee activo,
propiedad del turno y frontera temporal; la UI no es una autoridad de seguridad.

Un Employee sin vínculo activo permanece en el estado contractual de cuenta no vinculada y no recibe
acciones SELF ni acceso a datos.
