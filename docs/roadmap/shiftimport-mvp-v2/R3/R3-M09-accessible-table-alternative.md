# R3-M09 — Accessible Table Alternative

STATUS: DONE — PASS

## 1. Objetivo
Vista alternativa, 100% navegable por teclado y compatible con lector de pantalla, de los mismos datos del planner semanal (R3-M08), sin depender de interacción tipo drag-and-drop o grid compleja.

## 2. Problema que resuelve
Una grid visual densa no garantiza accesibilidad completa (WCAG 2.2 AA) para usuarios de lector de pantalla o navegación exclusiva por teclado. Se ofrece una vista de tabla semántica como alternativa equivalente en funcionalidad.

## 3. Estado actual del repositorio
IMPLEMENTED. El contenedor de R3-M08 conserva una única fuente de estado y mutaciones; grid y tabla son superficies de presentación alternativas sobre el mismo snapshot y los mismos endpoints.

## 4. Alcance IN
- Tabla semántica (`<table>` con `<th scope>` correctos) listando assignments por empleado y día, con formularios accesibles para crear/editar/eliminar (no drag-and-drop).
- Toggle entre vista grid (R3-M08) y vista tabla, con preferencia recordada por usuario (localStorage, no servidor — es una preferencia de presentación, no de dominio).

## 5. Alcance OUT
Cualquier lógica de negocio nueva — reutiliza exactamente los mismos endpoints de R3-M04/M05/M06/M07.

## 6. Dependencias
R3-M08.

## 7. Decisiones arquitectónicas
Componente hermano `src/components/scheduling/AccessibleScheduleTable.tsx`, renderizado por `WeeklyPlanner` con el mismo snapshot, editor y callbacks de carga/mutación. No duplica fetch ni llamadas API; `ScheduleAssignmentEditor` también se comparte entre grid y tabla.

## 8. Modelo de datos afectado
N/A.

## 9. API / Backend
Mismos endpoints que R3-M08 — sin cambios.

## 10. Frontend / UX
Tabla con acciones por fila (editar/eliminar) accesibles vía teclado (Tab/Enter/Espacio), formulario de creación como sección separada, no modal flotante difícil de navegar.

## 11. Seguridad y autorización
N/A adicional — misma capa de R3-M08.

## 12. i18n
Reutiliza las mismas claves i18n de R3-M08 donde aplique; nuevas solo para textos específicos de esta vista (p.ej. "Cambiar a vista de tabla").

## 13. Accesibilidad
Núcleo de esta microfase: verificar con axe (o equivalente) cero violaciones críticas/serias, navegación completa por teclado sin trampas de foco, contraste WCAG AA, `prefers-reduced-motion` respetado si hay cualquier transición.

## 14. Responsive / temas
Dark/light verificado; tabla con scroll horizontal contenido en su propio contenedor si el ancho lo requiere (nunca scroll horizontal de toda la página).

## 15. Observabilidad / errores
Mismos estados de error que R3-M08, presentados de forma accesible (asociados a su campo, no solo color).

## 16. Migraciones
N/A.

## 17. Compatibilidad y datos existentes
N/A.

## 18. Tasks

### T01 — Componente `AccessibleScheduleTable`
Objetivo: tabla semántica con create/edit/delete accesibles, reutilizando hooks de R3-M08.
Archivos / módulos probables: `src/components/scheduling/AccessibleScheduleTable.tsx` (nuevo).
Cambios: componente nuevo compartiendo hooks de datos.
No hacer: no duplicar llamadas a la API — reutilizar el mismo hook que `WeeklyPlanner`.
Criterios de aceptación:
- [x] Cero violaciones axe críticas/serias.
- [x] Flujo completo (crear/editar/eliminar) operable solo con teclado, verificado manualmente y documentado.
Tests: accessibility audit automatizado + test de navegación por teclado.
Evidencia esperada: reporte axe adjunto, notas de verificación manual de teclado.

### T02 — Toggle grid/tabla
Objetivo: alternar entre `WeeklyPlanner` y `AccessibleScheduleTable`, recordando preferencia en localStorage.
Archivos / módulos probables: contenedor común en `src/components/scheduling/`.
Cambios: estado de preferencia + persistencia local.
No hacer: no persistir la preferencia en servidor (no es dato de dominio).
Criterios de aceptación:
- [x] Preferencia persiste entre sesiones del mismo navegador.
Tests: component test del toggle.
Evidencia esperada: test en PASS.

## 19. Tests obligatorios
`accessibility`, `unit/component`.

## 20. Evidencias
Implementación:
- `src/components/scheduling/AccessibleScheduleTable.tsx`: tabla semántica con `caption`, `th scope`, filas por empleado/día, acciones nativas y formulario separado.
- `src/components/scheduling/ScheduleAssignmentEditor.tsx`: editor compartido con labels asociados, foco inicial controlado, errores `aria-live` y confirmación para borrado.
- `src/components/scheduling/WeeklyPlanner.tsx`: toggle `aria-pressed` y preferencia versionada `anclora_shiftimport_planner_view_v1` en localStorage.
- `src/lib/i18n.ts` + `src/index.css`: cadenas ES/EN, dark/light, foco visible y scroll horizontal contenido.

Validación:
- `src/components/scheduling/WeeklyPlanner.test.tsx`: 7 tests PASS, incluyendo persistencia del toggle y foco/operación de teclado.
- `npm test`: 104 archivos, 1050 tests PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS; warning conocido de chunks >500 kB.
- `qa/e2e-acceptance/specs-local/scheduling-draft.spec.ts`: 5/5 E2E PASS, incluyendo reload con preferencia tabla, foco y Enter.
- `agent-browser` + axe 4.12.1: tabla real verificada en dark/light, 0 violations.
- Responsive 390px: documento 390/390/390; wrapper de tabla 362px y contenido 860px, sin overflow horizontal de página.
- `git diff --check`: PASS.

## 21. Gate
Gates requeridos: **G7** (Accessibility).

Resultado ejecutado: **PASS**.

- G7 — PASS: HTML semántico, labels y nombres accesibles, acciones nativas de teclado, foco visible e inicial, errores anunciados y axe sin violations críticas/serias.

## 22. Rollback / remediación
Si axe reporta violaciones críticas: no commitear como PASS_WITH_WARNINGS — accesibilidad es el objetivo central de esta microfase, un warning aquí no es aceptable per §9 del prompt maestro (no hay microfase futura que lo absorba, esta ES esa microfase).

## 23. Criterio de DONE
Vista tabla operativa, cero violaciones axe críticas/serias, navegación por teclado completa verificada, Gate G7 PASS. Commit de implementación: `6e71c23`.
