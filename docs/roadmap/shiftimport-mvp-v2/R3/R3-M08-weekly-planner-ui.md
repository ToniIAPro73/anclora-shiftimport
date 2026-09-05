# R3-M08 — Weekly Planner UI

STATUS: DONE — PASS

## 1. Objetivo
UI para que un PLANNER cree/edite un draft de planificación semanal (grid empleado × día) usando los endpoints de R3-M04/M05/M06/M07.

## 2. Problema que resuelve
Primera superficie visual del dominio Scheduling — sin ella, Scheduling solo es utilizable vía API directa.

## 3. Estado actual del repositorio
PARTIAL / IMPLEMENTED. R0-M05 confirmó que el router hand-rolled `src/lib/route.ts` ya existe y debe extenderse incrementalmente; no se instala React Router. La vista nueva se integra en `/app/schedule`.

## 4. Alcance IN
- Vista semanal: filas = empleados del área/organización, columnas = días de la semana del `Schedule`.
- Crear/editar/eliminar assignment desde la grid (llamando a R3-M05).
- Mostrar errores de solapamiento (R3-M06) y descanso (R3-M07) inline.
- Estados: loading, empty (sin empleados activos en el área), error, disabled (versión no-DRAFT).

## 5. Alcance OUT
Publicación (R3-M10 — botón existe aquí pero la lógica de publicar vive en esa microfase). Vista alternativa accesible en tabla (R3-M09, componente hermano).

## 6. Dependencias
R0-M05 (PASS), R3-M04, R3-M05, R3-M06, R3-M07.

## 7. Decisiones arquitectónicas
Nuevo directorio `src/components/scheduling/` (no reutilizar `shift-dashboard/`, que es específico del histórico importado — mezclar draft-editing con la vista de histórico aumentaría el acoplamiento sin necesidad). Sigue el design system existente — antes de crear cualquier modal nuevo, revisar `ModalShell` y primitives ya existentes (§23 del prompt maestro).

## 8. Modelo de datos afectado
N/A — solo consumo de API existente.

## 9. API / Backend
Consume `GET /api/schedules`, `GET /api/schedules/:scheduleId/versions/:versionId` y `POST/PATCH/DELETE /api/schedules/.../assignments` (R3-M05). Todos los handlers aplican organization y scope en backend.

## 10. Frontend / UX
Grid semanal responsive, con estados de carga/vacío/error siguiendo el patrón premium ya usado en `TeamImportModal`/`ImportModal` (feedback durante operaciones largas, sin layout shifts, §22 del prompt maestro). El editor inline evita un modal paralelo y permite teclado, foco visible y scroll horizontal controlado.

## 11. Seguridad y autorización
La UI oculta acciones de edición si el usuario no es PLANNER+, pero el backend (R3-M05/M13) es la barrera real — la UI nunca es la única autorización (§25 del prompt maestro).

## 12. i18n
Todas las cadenas nuevas en ES/EN vía `src/lib/i18n.ts`, verificado por `i18n-coverage.test.ts`.

## 13. Accesibilidad
Grid debe ser operable por teclado como mínimo para navegación entre celdas; la alternativa completa sin drag-and-drop vive en R3-M09, pero esta vista no debe ser una trampa de teclado (focus visible, orden lógico).

## 14. Responsive / temas
Dark/light y responsive real (no solo desktop) — verificar en viewport móvil mínimo, aunque el caso de uso principal de planificación es desktop.

## 15. Observabilidad / errores
Errores de API (422 overlap/rest-rule, 409 estado, 403 permiso) mostrados con mensajes distintos y accionables, no un genérico "Error".

## 16. Migraciones
N/A.

## 17. Compatibilidad y datos existentes
N/A — UI nueva y aislada.

## 18. Tasks

### T01 — Endpoint de lectura de versión + assignments y discovery
Objetivo: `GET /api/schedules/:scheduleId/versions/:versionId` devolviendo versión + lista de assignments + empleados del área.
Archivos / módulos probables: `api/schedules/[scheduleId]/versions/[versionId]/index.js`.
Cambios: nuevo handler de lectura.
No hacer: no mezclar con los endpoints de mutación de R3-M05.
Criterios de aceptación:
- [x] `GET /api/schedules/:scheduleId/versions/:versionId` devuelve versión, assignments y empleados activos del área/organización.
- [x] `GET /api/schedules` lista la última versión de cada schedule dentro del tenant y scope para que la UI pueda descubrir drafts.
Tests: integración.
Evidencia esperada: resultado de test.

### T02 — Componente `WeeklyPlanner`
Objetivo: grid empleado × día con lectura/escritura de assignments.
Archivos / módulos probables: `src/components/scheduling/WeeklyPlanner.tsx` (nuevo).
Cambios: componente nuevo + hooks de datos.
No hacer: no acoplar con `shift-dashboard/`.
Criterios de aceptación:
- [x] Crear/editar/eliminar assignment desde la UI refleja el estado real del backend.
- [x] Errores 422/409/403 se muestran de forma diferenciada.
- [x] Estados loading/empty/error/disabled implementados.
Tests: component test (React Testing Library o equivalente ya usado en el repo).
Evidencia esperada: test + captura de los 4 estados (loading/empty/error/disabled) en claro y oscuro.

### T03 — Ruta de acceso al planner
Objetivo: exponer la vista según la decisión de routing de R0-M05.
Archivos / módulos probables: dependiente de la decisión de R0-M05 (a documentar aquí una vez tomada).
Cambios: integración en el shell de navegación.
No hacer: no introducir una librería de routing distinta a la decidida en R0-M05.
Criterios de aceptación:
- [x] PLANNER+ puede navegar a `/app/schedule`; EMPLOYEE no ve la entrada de menú y el backend rechaza la lectura por rol.
Tests: E2E básico de navegación (parte de R3-M15, aquí solo smoke test manual documentado).
Evidencia esperada: captura de navegación funcionando.

## 19. Tests obligatorios
`unit/component`, `integration/API`, `accessibility` (básico), `responsive`, `E2E` smoke.

## 20. Evidencias
Implementación:
- `api/_lib/scheduling.js`: discovery tenant/scope-scoped y snapshot de versión con empleados activos y assignments.
- `api/schedules/index.js` + `api/schedules/[scheduleId]/versions/[versionId]/index.js`: lectura de drafts/versiones y snapshot autenticado.
- `src/components/scheduling/WeeklyPlanner.tsx`: grid empleado × día, creación/edición/eliminación, estados loading/empty/error/disabled y traducciones ES/EN.
- `src/App.tsx` + `src/lib/route.ts`: acceso PLANNER+ en `/app/schedule`; EMPLOYEE no recibe entrada de navegación.
- `src/components/scheduling/WeeklyPlanner.test.tsx`: 5 tests de componente PASS.
- `api/schedules/version.test.js`, `api/schedules/index.test.js`, `src/lib/route.test.ts`: tests API/routing PASS.
- `qa/e2e-acceptance/specs-local/scheduling-draft.spec.ts`: 5/5 E2E PASS, incluyendo UI, scope AREA, edición/borrado, permisos EMPLOYEE y regla de descanso de 11 horas.

Validación:
- `npm test`: 104 archivos, 1048 tests PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS; warning conocido de chunks >500 kB.
- `git diff --check`: PASS.
- `agent-browser` contra `http://localhost:3199`: ruta `/app/schedule`, grid renderizado, tema claro/oscuro, ES/EN y viewport 390px verificados.
- axe 4.12.1: 0 violations; los elementos `incomplete` restantes corresponden al gradiente global cuyo fondo no puede inferirse automáticamente.
- Responsive: a 390px `document.documentElement.scrollWidth === clientWidth === body.scrollWidth`; la tabla permanece operable dentro de su región desplazable.

## 21. Gate
Gates requeridos: **G6** (UX/UI), **G9** (Responsive/temas), con G4/G10/G11 como soporte de la superficie conectada.

Resultado ejecutado: **PASS**.

- G4 — PASS: lectura y mutaciones pasan por API autenticada y scoped; la UI no es la única barrera.
- G6 — PASS: grid operativo, feedback de operaciones, estados diferenciados, foco visible y editor inline sin modal paralelo.
- G9 — PASS: dark/light, ES/EN y responsive 390px verificados con navegador.
- G10 — PASS: suite unitaria/API completa, lint, build y diff check PASS.
- G11 — PASS: 5/5 E2E con `vercel dev` y Neon development.

## 22. Rollback / remediación
Si el Gate falla por accesibilidad/responsive: no commitear hasta corregir — es una microfase con impacto visible directo al usuario final PLANNER.

## 23. Criterio de DONE
R0-M05 en PASS, grid operativo con los 3 tasks completos, estados verificados en ambos temas y responsive, Gate G6+G9 PASS. Commit de implementación: `0490289`.

## 24. Remediación UX — 2026-09-05

La validación del planner con un roster grande detectó que el grid podía hacer crecer
la página y comprimir el editor fuera del viewport. La remediación conserva el dominio
de scheduling y añade:

- workspace de altura limitada al viewport, con scroll vertical únicamente en la matriz;
- cabecera de días sticky y scrollbar visible de la región del grid;
- selector searchable de empleado, con `Todos los empleados` y filtro de visualización;
- editor común estable para grid y tabla accesible;
- selección de celda con `+` que rellena empleado/fecha, mantiene scroll y marca la celda;
- editor móvil como drawer inferior; en estado cerrado no intercepta las celdas del grid y
  mantiene una entrada directa `Abrir editor de turno`;
- guardado/cancelación sin cambiar semana ni filtro.

Archivos principales:

- `src/components/scheduling/WeeklyPlanner.tsx`
- `src/components/scheduling/AccessibleScheduleTable.tsx`
- `src/components/scheduling/ScheduleAssignmentEditor.tsx`
- `src/index.css`
- `src/components/scheduling/WeeklyPlanner.test.tsx`
- `qa/e2e-acceptance/specs-local/weekly-planner-ux.spec.ts`

Evidencia rápida de navegador (Neon dev + Chromium):

- 26 empleados activos: todas las filas accesibles; `scrollHeight > clientHeight` en el grid.
- 1440×900: dark, top/middle/bottom, sticky header, editor completo dentro del viewport.
- filtro individual y restauración a todos; celda seleccionada y editor prellenado.
- 1366×768, 1024×768, 768×1024 y 390×844: layout contenido; en móvil drawer inferior.
- light/dark, ES, consola sin errores y `document` sin scroll vertical global.

Validación: `weekly-planner-ux.spec.ts` PASS. El E2E funcional largo de scheduling se
mantiene separado para no confundir latencia de Neon/navegación con la comprobación visual.

## 25. Refinamiento Premium — 2026-09-05

La segunda revisión compacta la superficie operativa sin rediseñar el dominio:

- cabecera reducida a contexto, título y navegación semanal;
- controles locales de tema/idioma eliminados de `/app/schedule`;
- filtro de empleado, inicio de semana y modo de presentación integrados en una única toolbar;
- selector persistente `Lunes`/`Domingo`, con semanas de siete días y navegación coherente;
- cabecera sticky opaca y columna de empleado con capas estables;
- foco diario en cuadrícula con navegación anterior/siguiente, `aria-pressed` y foco horizontal
  sin tocar el scroll vertical ni el estado del editor.

La validación visual usa un harness Playwright aislado que conserva el shell y login reales y
simula únicamente el snapshot de scheduling con 26 empleados para evitar la latencia variable
de Neon en una comprobación de layout. Los contratos API de lunes/domingo se validan aparte.
