# Checklist de validación — Cierre de G6 (`heading-order` en calendario compacto y foco/teclado en MonthGrid) (2026-11-09)

> Este fichero se sobrescribe en cada entrega. El historial queda en Git (las entregas anteriores de la serie G6/MonthGrid constan en `fc94880` y `991deb3`).

**Repositorio:** anclora-shiftimport
**Rama:** development
**Estado del árbol:** cambios locales sin commit sobre `fe6b925` (`origin/development`), listos para validación local.

## 1. Qué cambia
- `src/components/shift-dashboard/MonthDayAgenda.tsx`: el encabezado del panel diario en el calendario compacto (`≤640px`, `.month-day-agenda__title`) pasa de `<h3>` a `<h2>`, manteniendo la jerarquía secuencial `<h1 class="calendar-toolbar__title">` → `<h2 class="month-day-agenda__title">` y cerrando la violación moderada `heading-order` de Axe reportada en G6 (`SPEC-SHIFTIMPORT-PLANNING-SIMPLIFICATION-MOBILE-AND-VACATIONS.md` §1665 / §20.2). Sin cambio visual (los estilos aplican por clase `.month-day-agenda__title`).
- `src/components/shift-dashboard/MonthDayAgenda.test.tsx`: actualiza las aserciones de nivel de encabezado (`level: 2`) en ES y EN y verifica la ausencia de `<h3>` huérfanos en el panel.
- `src/components/shift-dashboard/MonthGrid.test.tsx`:
  - Resuelve `src/index.css` mediante `join(__dirname, '../../index.css')` en los tests G5 y G6, eliminando el fallo `ENOENT` cuando Vitest se invoca fuera de la raíz del repositorio.
  - Añade verificación de cierre por teclado (`Escape`) y restauración de foco al botón `day-history-btn-<fecha>` tras cerrar `DayDetailModal`.

## 2. Evidencia
| Comprobación | Método | Resultado | Límite |
| --- | --- | --- | --- |
| Tests focales de MonthDayAgenda y MonthGrid | `npm --prefix /Users/toni/Developer/anclora/anclora-shiftimport exec -- vitest run src/components/shift-dashboard/MonthDayAgenda.test.tsx src/components/shift-dashboard/MonthGrid.test.tsx` | **PASS (2 ficheros, 51/51 tests: 20 en `MonthDayAgenda.test.tsx`, 31 en `MonthGrid.test.tsx`)** | Entorno `jsdom` |
| Typecheck | `npm --prefix /Users/toni/Developer/anclora/anclora-shiftimport exec -- tsc --noEmit -p /Users/toni/Developer/anclora/anclora-shiftimport/tsconfig.json` | **PASS (0 errores)** | — |
| Lint | `npm --prefix /Users/toni/Developer/anclora/anclora-shiftimport run lint -- src/components/shift-dashboard/MonthDayAgenda.tsx src/components/shift-dashboard/MonthDayAgenda.test.tsx src/components/shift-dashboard/MonthGrid.test.tsx` | **PASS (0 warnings, 0 errores)** | — |
| Build | `npm run build` | **NOT_RUN** | No requerido antes de validación local de microtarea UI/a11y |
| Suite completa | `npx vitest run` | **NOT_RUN** | QA proporcional (`AGENT_EXECUTION_POLICY.md` §13) |
| QA visual / navegador real | `anclora-visual-qa` | **NOT_RUN** | `MonthDayAgenda` mantiene `.month-day-agenda__title` sin cambios visuales |

## 3. Pruebas no ejecutadas (NOT_RUN)
| Prueba | Motivo |
| --- | --- |
| Lector de pantalla en dispositivo real (VoiceOver / TalkBack) | Requiere dispositivo físico o validación manual |
| E2E autenticado contra QA Mirror | Fuera del alcance de esta microtarea; sin cambios de API, sesión ni datos |

## 4. Checklist para validar en la aplicación
Marca cada punto. Un fallo en un punto marcado **[BLOQUEANTE]** impide entregar.

| # | Dónde | Pasos | Resultado esperado | Cuenta o configuración | Bloqueante |
| --- | --- | --- | --- | --- | --- |
| 1 | Calendario compacto (`≤640px`), panel inferior del día seleccionado | Inspecciona el título de fecha del panel (`.month-day-agenda__title`). | El elemento es un `<h2>` con `aria-label` de la fecha completa, continuando el `<h1>` del mes sin salto a `<h3>` | Cualquier rol o invitado en viewport móvil (`≤640px`) | Sí |
| 2 | Calendario escritorio (`>640px`), día con diferencia pendiente o historial | Abre el detalle del día desde el botón de aviso/historial (`day-history-btn-<fecha>`) y pulsa `Escape`. | El modal `DayDetailModal` se cierra y el foco vuelve al botón que lo abrió | Usuario con sesión y día con aviso o historial | Sí |
| 3 | Apariencia del panel compacto (`≤640px`) | Compara la cabecera del día seleccionado en móvil claro/oscuro. | Sin cambios visuales en tipografía, tamaño ni alineación | Cualquier rol | No |

### Casos negativos y de borde
| # | Caso | Resultado esperado |
| --- | --- | --- |
| 1 | Escritorio (`>640px`) | No se renderiza `MonthDayAgenda`; la cuadrícula mensual no cambia |
| 2 | Ejecución de `MonthGrid.test.tsx` desde fuera de la raíz del repo | Los tests G5 y G6 resuelven `src/index.css` sin `ENOENT` y pasan (31/31) |

### Estados de interfaz afectados
- [x] Vacío · [ ] Cargando · [ ] Error · [x] Éxito · [x] Móvil · [x] Escritorio · [x] Modo oscuro

## 5. Riesgos y limitaciones
- Riesgo funcional muy bajo: ajuste semántico de etiqueta (`<h3>` → `<h2>`) con clase CSS invariante y refuerzo de tests focales.
- El gap **G2** (`schedule.week_copied` como evento dedicado en `organization_audit_events`) permanece bloqueado en el roadmap hasta contar con aprobación de Producto y autorización de migración del `CHECK` de base de datos.

## 6. Decisión de Toni
- [ ] Los puntos bloqueantes pasan
- [ ] Autorizar commit y push a `origin/development`
- [ ] Se promociona: escribir `PROMOTE=FULL` (staging → production → main)
- [ ] No se promociona. Motivo: ______________________
