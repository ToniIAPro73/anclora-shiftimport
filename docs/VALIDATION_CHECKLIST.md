# Checklist de validación — mostrar turnos manuales en planificación (2026-10-28)

> Se sobrescribe en cada entrega; el historial queda en Git.

**Repositorio:** anclora-shiftimport  
**Rama y commit base:** development @ c5256b4e3954bff9a82a8eeb349db8d15e475775  
**Entorno:** UI de planificación y API snapshot; sin escrituras de datos  
**Datos:** sin escrituras; cuenta QA no utilizada.

## 1. Qué cambia

- El snapshot de una semana incluye por separado los turnos manuales efectivos de calendario, para que aparezcan en Planificación como **Ya en calendario**.
- Los turnos continúan siendo registros operativos manuales: no se convierten en asignaciones del borrador, no incrementan el contador y no se publican otra vez.
- La lectura limita los registros a la organización, semana, empleados activos y ámbito de área/empleado autorizado.

## 2. Ya comprobado por el agente

| Comprobación | Comando o método | Resultado |
| --- | --- | --- |
| Pruebas dirigidas de API y componentes | `npm test -- --run src/components/scheduling/WeeklyPlanner.test.tsx src/components/scheduling/AccessibleScheduleTable.test.tsx api/schedules/snapshot-scope.test.js api/schedules/version.test.js` | PASS — 30 pruebas |
| Typecheck | `npx tsc --noEmit` | PASS |
| Lint de archivos cambiados | `npx eslint api/_lib/scheduling.js api/schedules/snapshot-scope.test.js src/components/scheduling/AccessibleScheduleTable.tsx src/components/scheduling/AccessibleScheduleTable.test.tsx src/components/scheduling/WeeklyPlanner.tsx src/components/scheduling/WeeklyPlanner.test.tsx src/lib/i18n.ts src/lib/remote.ts` | PASS |
| Runtime de QA visual | `anclora-visual-qa doctor` | PASS — navegador compartido disponible; no se verificó una sesión visual autenticada contra la semana del usuario |
| Diff whitespace | `git diff --check` | PASS |

## 3. No ejecutado

| Comprobación | Motivo |
| --- | --- |
| Suite completa | Los tests específicos del snapshot, tabla y cuadrícula cubren el cambio; QA proporcional. |
| Recorrido visual autenticado de esa semana | Requiere una sesión autorizada en la organización/datos donde se creó el turno. No se hicieron escrituras para preparar datos visuales. |
| Pruebas con datos de producción | El cambio solo altera una lectura y presentación; no se modificaron datos ni esquema. |

## 4. Revisión en la aplicación

| # | Dónde | Resultado esperado |
| --- | --- | --- |
| 1 | Planificación → semana con turno manual futuro | Se muestra con la etiqueta **Ya en calendario**, tipo y horario; aparece separado de las asignaciones del borrador. |
| 2 | Contador y publicación del borrador | El turno manual no incrementa el contador de asignaciones ni vuelve a publicarse. |
| 3 | Vista de tabla accesible | El turno aparece como solo lectura, con la aclaración de que no pertenece al borrador. |

## 5. Riesgos y límites

- Solo se incluyen turnos efectivos de origen manual con provenance administrativa; los turnos importados, solicitudes pendientes y turnos publicados desde planificación no aparecen como manuales.
- Publicar el borrador no cambia el origen ni el estado de los turnos manuales ya existentes.
