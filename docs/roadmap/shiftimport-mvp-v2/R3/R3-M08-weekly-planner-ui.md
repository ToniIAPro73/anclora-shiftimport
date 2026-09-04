# R3-M08 — Weekly Planner UI

## 1. Objetivo
UI para que un PLANNER cree/edite un draft de planificación semanal (grid empleado × día) usando los endpoints de R3-M04/M05/M06/M07.

## 2. Problema que resuelve
Primera superficie visual del dominio Scheduling — sin ella, Scheduling solo es utilizable vía API directa.

## 3. Estado actual del repositorio
MISSING. **Bloqueada por R0-M05**: hoy no existe split de routing — `src/App.tsx` aloja todo el dashboard post-login, `src/pages/` solo tiene `LandingPage.tsx`/`PricingPage.tsx`. Esta microfase NO puede empezar hasta que R0-M05 esté en Gate PASS con una decisión de enrutado tomada.

## 4. Alcance IN
- Vista semanal: filas = empleados del área/organización, columnas = días de la semana del `Schedule`.
- Crear/editar/eliminar assignment desde la grid (llamando a R3-M05).
- Mostrar errores de solapamiento (R3-M06) y descanso (R3-M07) inline.
- Estados: loading, empty (sin empleados activos en el área), error, disabled (versión no-DRAFT).

## 5. Alcance OUT
Publicación (R3-M10 — botón existe aquí pero la lógica de publicar vive en esa microfase). Vista alternativa accesible en tabla (R3-M09, componente hermano).

## 6. Dependencias
**R0-M05 (bloqueante)**, R3-M04, R3-M05, R3-M06, R3-M07.

## 7. Decisiones arquitectónicas
Nuevo directorio `src/components/scheduling/` (no reutilizar `shift-dashboard/`, que es específico del histórico importado — mezclar draft-editing con la vista de histórico aumentaría el acoplamiento sin necesidad). Sigue el design system existente — antes de crear cualquier modal nuevo, revisar `ModalShell` y primitives ya existentes (§23 del prompt maestro).

## 8. Modelo de datos afectado
N/A — solo consumo de API existente.

## 9. API / Backend
Consume `POST/PATCH/DELETE /api/schedules/.../assignments` (R3-M05) y `GET` (implícito, a añadir en esta microfase si no existe ya un GET de lectura de versión+assignments — confirmar y, si falta, añadirlo como parte de T01 de esta microfase, no como microfase nueva).

## 10. Frontend / UX
Grid semanal responsive, con estados de carga/vacío/error siguiendo el patrón premium ya usado en `TeamImportModal`/`ImportModal` (feedback durante operaciones largas, sin layout shifts, §22 del prompt maestro).

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

### T01 — Endpoint de lectura de versión + assignments (si falta)
Objetivo: `GET /api/schedules/:scheduleId/versions/:versionId` devolviendo versión + lista de assignments + empleados del área.
Archivos / módulos probables: `api/schedules/[scheduleId]/versions/[versionId]/index.js`.
Cambios: nuevo handler de lectura.
No hacer: no mezclar con los endpoints de mutación de R3-M05.
Criterios de aceptación:
- [ ] Devuelve versión, assignments, y empleados activos del área/organización.
Tests: integración.
Evidencia esperada: resultado de test.

### T02 — Componente `WeeklyPlanner`
Objetivo: grid empleado × día con lectura/escritura de assignments.
Archivos / módulos probables: `src/components/scheduling/WeeklyPlanner.tsx` (nuevo).
Cambios: componente nuevo + hooks de datos.
No hacer: no acoplar con `shift-dashboard/`.
Criterios de aceptación:
- [ ] Crear/editar/eliminar assignment desde la UI refleja el estado real del backend.
- [ ] Errores 422/409/403 se muestran de forma diferenciada.
- [ ] Estados loading/empty/error/disabled implementados.
Tests: component test (React Testing Library o equivalente ya usado en el repo).
Evidencia esperada: test + captura de los 4 estados (loading/empty/error/disabled) en claro y oscuro.

### T03 — Ruta de acceso al planner
Objetivo: exponer la vista según la decisión de routing de R0-M05.
Archivos / módulos probables: dependiente de la decisión de R0-M05 (a documentar aquí una vez tomada).
Cambios: integración en el shell de navegación.
No hacer: no introducir una librería de routing distinta a la decidida en R0-M05.
Criterios de aceptación:
- [ ] PLANNER+ puede navegar a la vista; EMPLOYEE no ve la entrada de menú (y el backend igualmente la rechaza si se accede directo).
Tests: E2E básico de navegación (parte de R3-M15, aquí solo smoke test manual documentado).
Evidencia esperada: captura de navegación funcionando.

## 19. Tests obligatorios
`unit/component`, `accessibility` (básico), `responsive`.

## 20. Evidencias
Componente commiteado, tests en PASS, capturas dark/light/estados adjuntas.

## 21. Gate
Gates requeridos: **G6** (UX/UI), **G9** (Responsive/temas). BLOCKED si R0-M05 no está en PASS.

## 22. Rollback / remediación
Si el Gate falla por accesibilidad/responsive: no commitear hasta corregir — es una microfase con impacto visible directo al usuario final PLANNER.

## 23. Criterio de DONE
R0-M05 en PASS, grid operativo con los 3 tasks completos, estados verificados en ambos temas y responsive, Gate G6+G9 PASS.
