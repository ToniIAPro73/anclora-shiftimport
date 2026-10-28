# Checklist de validación — corrección de build de objetivos anuales

> Se sobrescribe en cada entrega; el historial queda en Git.

**Repositorio:** anclora-shiftimport
**Rama:** development
**Alcance:** eliminar una variable local declarada pero no utilizada que impedía compilar `src/App.tsx` en Vercel Preview (`TS6133`).

## Validación realizada

| Comprobación | Resultado |
| --- | --- |
| `npm run build` | PASS — `tsc` y `vite build` completados. Vite muestra solo el aviso no bloqueante de tamaño de chunks. |
| `git diff --check` | PASS — sin errores de espacios o formato en el diff. |
| Suite de pruebas | No ejecutada para esta corrección de build. |
| Verificación visual/local | No realizada para esta corrección de build. |

## Causa del Preview fallido

Vercel Preview del commit `93cc1be` falló en `npm run build` porque `activeEmployeeExternalId` estaba declarado y no se leía. Se eliminó esa declaración obsoleta. El build local equivalente ahora pasa.

## Estado de migración

La migración `0047_annual_target_shift_types.sql` añade `included_shift_types` y una restricción de validación. Toni informó que ejecutó el SQL desde Neon: la columna ya existe y el `DROP CONSTRAINT IF EXISTS` produjo un aviso esperado; la tercera consulta, que añade la restricción, apareció como `ERROR`. No se ha confirmado que la restricción quedara creada ni que la migración esté registrada por el runner `_migrations`.

Antes de promocionar esta versión, confirmar la salida de la tercera consulta y reconciliar el estado mediante el runner canónico `npm run db:migrate` / `npm run db:migrate:status`, según corresponda.

## Revisión funcional pendiente

- Configurar por empleado y año los tipos de turno incluidos en el objetivo; `Regular` es la selección inicial.
- Verificar que la selección se conserva y afecta a los totales correspondientes, mientras los extras siguen visibles en sus contadores independientes.
- Revisar el estado de la migración en Neon y validar el flujo en el entorno de desarrollo.
