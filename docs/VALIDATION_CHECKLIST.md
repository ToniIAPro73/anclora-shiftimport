# Checklist de validación — turnos directos y estadísticas por empleado (2026-10-28)

**Repositorio:** anclora-shiftimport
**Rama:** development
**Entorno:** validado por Toni en development antes del commit
**Datos:** no se hicieron escrituras ni migraciones en la base de datos.

## 1. Cambios incluidos

- ADMIN y OWNER pueden registrar turnos manuales de cualquier empleado de su organización en fechas pasadas, de hoy o futuras, sin planificación ni solicitud. Las restricciones para otros roles se conservan.
- Para Sebastián Pozo Mendoza (external employee ID `84881`) en ShiftImport, los totales y el objetivo anual cuentan solo horas Regular; el contador de Extras permanece visible. La regla se limita a ShiftImport y su espejo de QA.

## 2. Validación ejecutada

| Comprobación | Método | Resultado |
| --- | --- | --- |
| Pruebas focalizadas | `npm test -- --run src/lib/calendar-actions.test.ts src/lib/employee-statistics.test.js src/components/shift-dashboard/StatisticsModal.test.tsx api/_lib/data.test.js api/_lib/calendar-version-authority.test.js` | PASS — 147 tests |
| Typecheck y build | `npm run build` | PASS — `tsc` y `vite build`; Vite informó advertencia por tamaño de bundle |
| Lint | `npm run lint` | PASS |
| Integridad del diff | `git diff --check` | PASS |
| Smoke visual local | `anclora-visual-qa check http://127.0.0.1:4173` | PASS — página cargada, sin overlay de error; vista pública, sin sesión autenticada |
| Revisión de Toni | Confirmación expresa en conversación | Validado en development |

## 3. No ejecutado

| Comprobación | Motivo |
| --- | --- |
| Flujo autenticado E2E como ADMIN sobre Sebastián | No se escribió en la base de datos de producción; la revisión funcional de development fue confirmada por Toni |
| Preview del SHA final | Se debe revisar después del push y antes de cualquier promoción |

## 4. Revisión posterior al push

| # | Entorno | Acción | Resultado esperado | Bloqueante |
| --- | --- | --- | --- | --- |
| 1 | Preview | Revisar la Preview vinculada al SHA publicado | Confirmar que corresponde al cambio revisado y se comporta correctamente | Sí, antes de promoción |

## 5. Riesgos y limitaciones

- La excepción estadística depende del external employee ID `84881` y del ID de organización de ShiftImport; otras personas y organizaciones conservan el cálculo actual.
- El alta manual directa mantiene las validaciones existentes de solapamiento, tipo de turno, empleado activo, organización y plan.
- No se modificaron datos de producción.

## 6. Decisión de Toni

- [x] Validado en development
- [ ] Validado en Preview
- [ ] PROMOTE=FULL
- [ ] No se promociona. Motivo: ______________________
