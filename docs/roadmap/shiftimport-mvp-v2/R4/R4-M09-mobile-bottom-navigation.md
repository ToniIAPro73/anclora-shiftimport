# R4-M09 — Mobile Bottom Navigation

## 1. Objetivo

Construir la barra de navegación inferior del portal del empleado con exactamente cuatro secciones: **Hoy / Semana / Solicitudes / Más**, conectando las pantallas ya construidas en R4-M01, R4-M02, R4-M07, y un menú "Más" para el resto (perfil, notificaciones, logout, tema/idioma).

## 2. Problema que resuelve

El shell de R4-M00 reservó un contenedor de navegación vacío. Esta microfase lo llena con la IA definitiva, mobile-first, tal como especifica el master prompt (§18): prioridad exacta "Hoy, Semana, Solicitudes, Más" — ni más ni menos ítems.

## 3. Estado actual del repositorio

El shell de R4-M00 ya montaba Today, My Week y Request Status, pero solo tenía tres botones de navegación y mantenía tema, idioma y logout en la cabecera. R4-M09 completa la IA con cuatro secciones y mueve esos accesos secundarios a Más.

## 4. Alcance IN

- Barra de navegación inferior fija en mobile con exactamente 4 ítems: Hoy, Semana, Solicitudes, Más.
- Indicador de sección activa.
- Badge de notificaciones no leídas sobre Más, donde vive Notifications.
- Sección "Más": acceso a perfil básico, notificaciones (R4-M08), tema/idioma, logout.

## 5. Alcance OUT

- Cualquier quinto ítem de navegación — explícitamente prohibido por el master prompt.
- Navegación de escritorio distinta (una barra lateral, por ejemplo) — fuera de alcance MVP salvo que R4-M10 decida una adaptación mínima no estructural.
- Fichaje/attendance como ítem de navegación.

## 6. Dependencias

R4-M00 (shell), R4-M01/M02/M07 (pantallas a enlazar), R4-M08 (fuente del badge de notificaciones).

## 7. Decisiones arquitectónicas

Los cuatro ítems son fijos y no configurables en MVP (no se construye un sistema de navegación dinámica/configurable — eso sería sobre-ingeniería para 4 ítems fijos).

## 8. Modelo de datos afectado

N/A — motivo: navegación puramente de frontend.

## 9. API / Backend

N/A — motivo: reutiliza endpoints ya existentes de las pantallas enlazadas.

## 10. Frontend / UX

Barra fija inferior (posición `fixed`/`sticky` según convención del repo), altura y área táctil accesibles (mínimo 44×44px por ítem), icono + label por ítem.

## 11. Seguridad y autorización

N/A — motivo: navegación no introduce ninguna superficie de datos nueva.

## 12. i18n

Labels de los 4 ítems en ES/EN.

## 13. Accesibilidad

Navegación con `nav` semántico, `aria-current` en el ítem activo, operable por teclado (tab order lógico), objetivo táctil de tamaño accesible.

## 14. Responsive / temas

Verificar que la barra no tapa contenido en pantallas pequeñas (safe-area en iOS); contraste en dark/light.

## 15. Observabilidad / errores

N/A — motivo: navegación estática, sin estados de error propios.

## 16. Migraciones

N/A — motivo: sin cambios de esquema.

## 17. Compatibilidad y datos existentes

N/A — motivo: sin impacto en datos.

## 18. Tasks

### T01 — Barra de navegación con 4 ítems fijos
Objetivo: construir la barra y decidir dónde vive el badge de notificaciones.
Archivos: `src/components/employee-portal/BottomNav.tsx`.
Cambios: 4 ítems fijos, indicador de activo, badge en "Más".
No hacer: no añadir un quinto ítem bajo ninguna circunstancia.
Criterios de aceptación:
- [x] Exactamente 4 ítems presentes: Hoy, Semana, Solicitudes, Más.
Tests: unit de conteo de ítems (test explícito que falla si se añade un quinto).
Evidencia esperada: captura de la barra con los 4 ítems.

### T02 — Sección "Más"
Objetivo: pantalla contenedora de perfil/notificaciones/tema-idioma/logout.
Archivos: `src/components/employee-portal/More.tsx`.
Cambios: agregación de accesos existentes (ThemeToggle, i18n switch, logout ya existentes en el repo, Notifications de R4-M08).
No hacer: no duplicar lógica de logout/tema — reutilizar componentes existentes.
Criterios de aceptación:
- [x] Logout desde "Más" reutiliza el callback de sesión existente y funciona igual que el logout actual del dashboard ADMIN.
Tests: integration.
Evidencia esperada: captura de "Más" con todos los accesos.

## 19. Tests obligatorios

Unit (conteo fijo de ítems, aria-current), Accessibility (tamaño de objetivo táctil, navegación por teclado).

## 20. Evidencias

- `npm test -- --run`: 129 archivos, 1174 tests PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS (warning preexistente de tamaño de chunks).
- `BottomNav.test.tsx`: 4 botones exactos, un estado activo, badge accesible y foco de teclado.
- `PortalShell.test.tsx`: navegación Today/Week/Requests/More, logout en Más, estado activo y preferencias reutilizadas.
- CSS revisado: barra fija solo en `max-width: 640px`, safe-area inferior, contenido con padding compensatorio, dark/light mediante variables existentes.

## 21. Gate

Gates obligatorios: G6 (UX/UI), G9 (Responsive/themes).

Resultado: **PASS**.

G6 PASS requiere explícitamente el test de conteo fijo de 4 ítems en verde — validado; cualquier item adicional continúa siendo FAIL por violar el master prompt. G9 queda cubierto por el layout responsive, safe-area y variables de tema existentes; la auditoría transversal ampliada continúa en R4-M10.

## 22. Rollback / remediación

Revert retira la barra; el shell vuelve a su contenedor vacío de R4-M00.

## 23. Criterio de DONE

Navegación de 4 ítems fija, accesible, responsive, con badge de notificaciones funcionando, acceso a perfil/preferencias/notificaciones/logout desde Más; Gate G6+G9 PASS.

Commit de cierre: `8c1e3d7 feat(employee-portal): add mobile bottom navigation`.
