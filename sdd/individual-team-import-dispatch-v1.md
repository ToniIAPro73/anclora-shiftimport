# SDD — Importación individual/equipo automática v1

## Contrato

Después de leer un archivo compatible, el detector común cuenta empleados en hojas con turnos reales: cero bloquea con diagnóstico, uno abre el importador individual y dos o más conserva el importador de equipo. Las hojas sin estructura de turnos se ignoran.

El XLSX posicional de calendario reconoce meses y días, convierte las celdas de dos horas (incluidos nocturnos), ignora `!`, resuelve `DL`/`AJ` como `Libre` y usa el nombre del título solo para proponer la coincidencia. La persistencia sigue resolviendo el ID contra el empleado de la organización activa.

## Seguridad y límites

No se crean empleados en el dispatch individual. La resolución final continúa en `App` y en las APIs existentes, con aislamiento por organización. El flujo tabular multiempleado no cambia.

## Verificación

Fixture real: 2 hojas; `Calendario empleado` procesada, `Leyenda` ignorada; un empleado y 246 turnos enero–septiembre 2026.
