# Checklist de validación — Proyección CURRENT en detalle diario (2026-10-19)

> Este fichero se sobrescribe en cada entrega. El historial queda en Git.

**Repositorio:** anclora-shiftimport
**Rama y commit:** development @ b62d440 (código validado; este checklist se añade en el siguiente commit)
**Entorno de validación:** runtime local `http://localhost:5174` sobre Vercel Development · Neon canónica, consulta de solo lectura
**Datos:** ShiftImport — QA Mirror; cuenta QA persistente del contrato (`qa.shiftimport@anclora.test`), usuario piloto Sebastián Pozo Mendoza — QA. No se usó la cuenta personal de Toni.

## 1. Qué cambia
- El calendario y el detalle diario comparten la misma proyección determinista CURRENT cuando hay una diferencia pendiente.
- El detalle excluye propuestas, mantiene los IDs de las filas actuales para editar/eliminar y falla cerrado si la selección es ambigua.
- La nota ES/EN del registro legado JT aclara que no duplica las horas del turno actual.

## 2. Ya comprobado por el agente
| Comprobación | Comando o método | Resultado | SHA |
| --- | --- | --- | --- |
| Pruebas focalizadas | `npx vitest run api/_lib/effective-calendar.test.js src/components/shift-dashboard/MonthGrid.test.tsx src/components/shift-dashboard/DayProvenancePanel.test.tsx` | PASS — 3 ficheros, 98 pruebas | b62d440 |
| TypeScript | `npx tsc --noEmit` | PASS | b62d440 |
| Lint | `npm run lint` | PASS | b62d440 |
| Build | `npm run build` | PASS (aviso existente por chunks grandes) | b62d440 |
| Diff | `git diff --check` | PASS | b62d440 |
| Revisión visual QA Mirror, 2026-01-07 | `agent-browser` en `/calendar`; detalle abierto desde el calendario | PASS — 1 Regular `17:00–01:00`, 1 elemento; dos alternativas de decisión; editar/eliminar apuntan al ID actual por pruebas focalizadas | b62d440 |
| Revisión visual QA Mirror, 2026-01-14 | `agent-browser` en `/calendar`; detalle abierto desde el calendario | PASS — Regular `06:00–11:00` y Extras `11:00–13:00`; 2 elementos y sin duplicar el Regular coincidente | b62d440 |
| Auditoría de días pendientes del piloto | Consulta SQL explícita `BEGIN READ ONLY` / `ROLLBACK`, limitada a ShiftImport — QA Mirror y al empleado QA 84881 | PASS — 38 de 38 días auditados; 10 coincidencias semánticas, 6 casos JT + propuesta equivalente, 4 días con varias filas CURRENT y propuesta coincidente; 0 días ambiguos. Sin escritura ni cambios de filas | b62d440 |
| Estado de migraciones | Estado de solo lectura con `db/migrate.mjs --status` y entorno Vercel Development | PASS — 45/45 aplicadas, ninguna pendiente; no se necesitó migración | b62d440 |

## 3. Pruebas no ejecutadas (NOT_RUN)
| Prueba | Motivo concreto |
| --- | --- |
| `npm test` (suite completa) | `QA_MODE=AUTO` selecciona STANDARD para este cambio funcional aislado; la política canónica del workspace limita la validación al conjunto focalizado suficiente. Las 98 pruebas relevantes sí pasaron. |

## 4. Checklist para validar en la aplicación
Marca cada punto. Un fallo en un punto marcado **[BLOQUEANTE]** impide promocionar.

| # | Dónde | Pasos | Resultado esperado | Cuenta o configuración | Bloqueante |
| --- | --- | --- | --- | --- | --- |
| 1 | Calendario, 7 de enero de 2026 | Seleccionar a Sebastián Pozo Mendoza — QA y abrir el detalle del día | Un único Regular `17:00–01:00`; las propuestas no aparecen como turnos actuales y el panel ofrece dos alternativas | ShiftImport — QA Mirror, rol ADMIN | Sí |
| 2 | Calendario, 14 de enero de 2026 | Abrir el detalle del día | Regular `06:00–11:00` y Extras `11:00–13:00`; sin duplicado Regular; 2 turnos | ShiftImport — QA Mirror, rol ADMIN | Sí |
| 3 | Detalle diario, 7 de enero | Inspeccionar la nota del registro JT legado | El texto indica que el registro legado no duplica las horas del turno actual | Idioma ES; verificar EN si se cambia idioma | No |

### Casos negativos y de borde
| # | Caso | Resultado esperado |
| --- | --- | --- |
| 1 | Día pendiente ambiguo sin selección CURRENT inequívoca | No proyectar propuestas como calendario actual |
| 2 | Día sin diferencia pendiente | Conservar las filas existentes sin alterar la presentación |
| 3 | Editar o eliminar el JT actual | La acción usa el ID original de la fila persistida |

### Estados de interfaz afectados
- [ ] Vacío · [x] Cargando · [ ] Error · [x] Éxito · [ ] Móvil · [x] Escritorio · [x] Modo oscuro

## 5. Riesgos y limitaciones
- `npm run build` conserva un aviso de chunks grandes ya existente.
- No se ejecutó la suite completa; la validación focalizada y las puertas de tipo, lint y build pasaron.
- Ninguna migración ni escritura de datos es necesaria. El código solo cambia la proyección de lectura/presentación.

## 6. Decisión de Toni
- [ ] Todos los puntos bloqueantes pasan
- [ ] Se promociona: escribir `PROMOTE=FULL` (staging → production → main)
- [x] No se promociona. Motivo: el contrato de la misión requiere detenerse tras el push a `development`.
