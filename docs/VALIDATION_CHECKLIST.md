# Checklist de validación — turnos directos y excepción de jornada completa (2026-10-28)

**Repositorio:** anclora-shiftimport
**Rama:** development
**Validación:** suite local y QA autenticado sobre `ShiftImport — QA Mirror`; Toni validó el cambio en development
**Base de datos de producción:** la migración 0046 aún no está aplicada; el guard de Anclora bloqueó el comando del runner.

## 1. Cambios incluidos

- ADMIN y OWNER pueden registrar turnos manuales de cualquier empleado de su organización en fechas pasadas, actuales o futuras, sin planificación ni solicitud; los roles restantes conservan sus restricciones.
- Para Sebastián Pozo Mendoza (external employee ID `84881`) en la organización ShiftImport, las estadísticas anuales suman únicamente horas Regular y mantienen visible el contador de Extras. La excepción no afecta a otros empleados ni organizaciones.
- Cuando un rol autorizado intenta añadir un turno a una fecha que ya contiene un turno de jornada completa, la interfaz explica el solapamiento y pide confirmación. Cancelar no guarda el turno; confirmar permite continuar con las validaciones existentes.

## 2. Validación ejecutada

| Comprobación | Método | Resultado |
| --- | --- | --- |
| Suite completa | `npm test -- --run` | PASS — 2.190 pruebas aprobadas, 2 omitidas (2.192 total) |
| QA mirror, solo lectura | `npm run qa:mirror:refresh -- --dry-run` | PASS — espejo reconocido, 62 empleados y ámbito configurado; no se aplicaron cambios |
| Smoke autenticado del espejo | `npm run qa:local:smoke` | PASS — login, sesión, espejo, piloto, estadísticas y reconciliación |
| Integridad visual | `anclora-visual-qa check http://127.0.0.1:5173/` | PASS — sin overlay de error y con contenido |
| Confirmación de turno en jornada completa | `agent-browser`, sesión QA dedicada en el runtime local, organización `ShiftImport — QA Mirror` | PASS — mostró tipo de turno existente y opciones Cancelar/Añadir turno; se canceló sin escribir en la base de datos |

## 3. Migración de producción

- Migración requerida: [`db/migrations/0046_confirmed_full_day_shift_override.sql`](../db/migrations/0046_confirmed_full_day_shift_override.sql).
- No aplicada. El control automático bloqueó la ejecución del runner con: `Anclora: comando destructivo bloqueado por contrato Anclora (BD de producción)`.
- No se creó ningún turno de prueba ni se modificaron datos del espejo o de la organización fuente.

## 4. Revisión posterior al push

| # | Entorno | Acción | Resultado esperado | Bloqueante |
| --- | --- | --- | --- | --- |
| 1 | Development | Revisar el cambio publicado en `origin/development` | Confirmar los cambios de turnos, estadísticas y el diálogo | No |
| 2 | Producción | Aplicar la migración 0046 mediante el runner aprobado | Runner registra 0046 como aplicada | Sí, para persistencia del override |
| 3 | Producción | Verificar el flujo de confirmación tras aplicar la migración | Confirmar guarda el turno y Cancelar no lo guarda | Sí, antes de promocionar |

## 5. Riesgos y limitaciones

- El filtro estadístico especial depende del ID externo `84881` y del ID de organización ShiftImport.
- La excepción de solapamiento requiere la migración 0046; hasta aplicarla, el flujo visual puede mostrarse, pero no se ha validado su persistencia en producción.
- Se conserva la validación de empleado, organización, permisos y demás reglas de turno.

## 6. Decisión de Toni

- [x] Validado en development
- [ ] Validado en Preview
- [ ] PROMOTE=FULL
- [ ] No se promociona. Motivo: ______________________
