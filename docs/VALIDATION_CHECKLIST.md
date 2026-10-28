# Checklist de validación — objetivos anuales por tipo de turno

> Se sobrescribe en cada entrega; el historial queda en Git.

**Repositorio:** anclora-shiftimport
**Rama:** development
**Alcance:** selector de tipos de turno que computan en el objetivo anual de cada empleado, persistencia de la selección y cálculo de estadísticas.

## Validación realizada

| Comprobación | Resultado |
| --- | --- |
| `git diff --check` | PASS — sin errores de espacios o formato en el diff. |
| Suite de pruebas | No ejecutada en esta tarea. |
| Verificación visual/local | No realizada en esta tarea. |

## Estado de migración

La migración `0047_annual_target_shift_types.sql` añade `included_shift_types` y una restricción de validación. Toni informó que ejecutó el SQL desde Neon: la columna ya existe y el `DROP CONSTRAINT IF EXISTS` produjo un aviso esperado; la tercera consulta, que añade la restricción, apareció como `ERROR`. No se ha confirmado que la restricción quedara creada ni que la migración esté registrada por el runner `_migrations`.

Antes de promocionar esta versión, confirmar la salida de la tercera consulta y reconciliar el estado mediante el runner canónico `npm run db:migrate` / `npm run db:migrate:status`, según corresponda.

## Revisión funcional pendiente

- Configurar por empleado y año los tipos de turno incluidos en el objetivo; `Regular` es la selección inicial.
- Verificar que la selección se conserva y afecta a los totales correspondientes, mientras los extras siguen visibles en sus contadores independientes.
- Revisar el estado de la migración en Neon y validar el flujo en el entorno de desarrollo.
