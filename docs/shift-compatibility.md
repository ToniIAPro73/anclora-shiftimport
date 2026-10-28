# Qué turnos pueden coincidir en un mismo día

Esta guía describe los controles al registrar turnos para **una misma persona y fecha**.

## Regla rápida

- Los turnos que ocupan **todo el día** (Libre, Vacaciones o Baja de día completo) se mantienen exclusivos por defecto.
- Si ya existe uno de esos turnos, un usuario **OWNER, ADMIN o PLANNER** puede añadir un turno con horario después de aceptar una confirmación. Un usuario **EMPLOYEE** no puede aplicar esta excepción.
- Dos registros de día completo siguen sin poder combinarse.
- Los turnos con **hora de inicio y fin** sí pueden convivir, siempre que sus intervalos no se solapen.
- Si un turno termina exactamente cuando empieza el siguiente, se permite. Por ejemplo, `08:00–11:00` y `11:00–12:00`.

## Compatibilidad

| Turno ya registrado | Turno que se quiere añadir | ¿Se permite? | Motivo |
| --- | --- | --- | --- |
| Libre, Vacaciones o Baja de día completo | Un turno con horario, por usuario EMPLOYEE | No | La excepción requiere confirmación de un usuario con permisos de gestión. |
| Libre, Vacaciones o Baja de día completo | Un turno con horario, por OWNER, ADMIN o PLANNER | Sí, tras confirmar | Se informa de que ya hay un registro que ocupa la jornada. La confirmación queda registrada. |
| Libre, Vacaciones o Baja de día completo | Otro registro de día completo | No | La confirmación solo permite añadir un turno con horario. |
| Regular | Extras | Sí, si las horas no se solapan | Ambos tienen horario; cada intervalo debe quedar libre. |
| Regular | Ausencia | Sí, si las horas no se solapan | Ausencia es un intervalo horario, no un bloqueo de todo el día. |
| Extras | Ausencia | Sí, si las horas no se solapan | Se aplica la misma regla de intervalos. |
| Dos turnos con horario, del mismo tipo o de tipos distintos | El intervalo coincide total o parcialmente | No | Se solaparía con un registro existente. |
| Dos turnos con horario, del mismo tipo o de tipos distintos | Los intervalos son separados o solo se tocan en el límite | Sí | No hay horas compartidas. |
| Dos registros de día completo | — | No | Los registros de día completo son exclusivos. |

## Ejemplos

**Permitido directamente**

- `Regular 08:00–11:00` + `Extras 11:00–13:00`.
- `Regular 08:00–11:00` + `Ausencia 11:00–12:00` + `Regular 12:00–16:00`.
- `Extras 09:00–10:00` + `Extras 10:00–12:00`.

**Permitido tras confirmar (OWNER, ADMIN o PLANNER)**

- `Libre` + `Extras 21:00–23:00`: aparece un aviso indicando que Libre ocupa la fecha; al confirmar, se guarda Extras junto a Libre.
- `Baja` + `Regular 09:00–12:00`: se aplica la misma confirmación. La restricción temporal de quién puede registrar la fecha sigue vigente.

**No permitido**

- Dos estados de día completo distintos en la misma fecha, por ejemplo `Libre` + `Vacaciones`.
- `Libre` + `Extras` si quien intenta guardarlo tiene rol EMPLOYEE o no tiene un rol verificado.
- Un turno con horario que se solape con otro turno con horario, aunque se haya confirmado la excepción del día completo.
- `Regular 08:00–12:00` + `Extras 11:00–13:00`: comparten el tramo `11:00–12:00`.
- `Ausencia 10:00–12:00` + `Regular 11:00–15:00`: comparten el tramo `11:00–12:00`.

## Cómo se aplica

Las reglas se comprueban al preparar el registro en el calendario y se vuelven a validar en el servidor. La confirmación no evita la validación de permisos, de fechas ni de solapamientos entre turnos horarios. El Planificador mantiene sus límites habituales para las fechas: la excepción no concede permisos generales para registrar hoy o fechas futuras por fuera del flujo normal de planificación. El servidor registra el origen excepcional del turno para que el calendario y las estadísticas mantengan las horas computables sin tratar la combinación confirmada como un error de datos. El día conserva además su estado Libre, Vacaciones o Baja.

Los tipos incluidos por defecto son:

- **Con horario:** Regular, Extras y Ausencia.
- **De día completo y exclusivos:** Libre, Vacaciones y Baja.

La aplicación permite configurar tipos de turno. En esos casos, la compatibilidad depende de cómo esté configurado cada tipo: un tipo exclusivo o de día completo bloquea la fecha; los tipos con horario se comparan por sus horas. Por tanto, un tipo personalizado puede comportarse de forma distinta a otro con un nombre parecido.
