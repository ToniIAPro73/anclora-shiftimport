# R3-M09 — Accessible Table Alternative

## 1. Objetivo
Vista alternativa, 100% navegable por teclado y compatible con lector de pantalla, de los mismos datos del planner semanal (R3-M08), sin depender de interacción tipo drag-and-drop o grid compleja.

## 2. Problema que resuelve
Una grid visual densa no garantiza accesibilidad completa (WCAG 2.2 AA) para usuarios de lector de pantalla o navegación exclusiva por teclado. Se ofrece una vista de tabla semántica como alternativa equivalente en funcionalidad.

## 3. Estado actual del repositorio
MISSING. Depende de R3-M08 (mismos datos, mismos endpoints).

## 4. Alcance IN
- Tabla semántica (`<table>` con `<th scope>` correctos) listando assignments por empleado y día, con formularios accesibles para crear/editar/eliminar (no drag-and-drop).
- Toggle entre vista grid (R3-M08) y vista tabla, con preferencia recordada por usuario (localStorage, no servidor — es una preferencia de presentación, no de dominio).

## 5. Alcance OUT
Cualquier lógica de negocio nueva — reutiliza exactamente los mismos endpoints de R3-M04/M05/M06/M07.

## 6. Dependencias
R3-M08.

## 7. Decisiones arquitectónicas
Componente hermano `src/components/scheduling/AccessibleScheduleTable.tsx`, comparte los mismos hooks de datos que `WeeklyPlanner` (no duplicar lógica de fetch/mutación, solo la presentación difiere).

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
- [ ] Cero violaciones axe críticas/serias.
- [ ] Flujo completo (crear/editar/eliminar) operable solo con teclado, verificado manualmente y documentado.
Tests: accessibility audit automatizado + test de navegación por teclado.
Evidencia esperada: reporte axe adjunto, notas de verificación manual de teclado.

### T02 — Toggle grid/tabla
Objetivo: alternar entre `WeeklyPlanner` y `AccessibleScheduleTable`, recordando preferencia en localStorage.
Archivos / módulos probables: contenedor común en `src/components/scheduling/`.
Cambios: estado de preferencia + persistencia local.
No hacer: no persistir la preferencia en servidor (no es dato de dominio).
Criterios de aceptación:
- [ ] Preferencia persiste entre sesiones del mismo navegador.
Tests: component test del toggle.
Evidencia esperada: test en PASS.

## 19. Tests obligatorios
`accessibility`, `unit/component`.

## 20. Evidencias
Componente commiteado, reporte axe sin violaciones críticas/serias, test de toggle en PASS.

## 21. Gate
Gates requeridos: **G7** (Accessibility).

## 22. Rollback / remediación
Si axe reporta violaciones críticas: no commitear como PASS_WITH_WARNINGS — accesibilidad es el objetivo central de esta microfase, un warning aquí no es aceptable per §9 del prompt maestro (no hay microfase futura que lo absorba, esta ES esa microfase).

## 23. Criterio de DONE
Vista tabla operativa, cero violaciones axe críticas/serias, navegación por teclado completa verificada, Gate G7 PASS.
