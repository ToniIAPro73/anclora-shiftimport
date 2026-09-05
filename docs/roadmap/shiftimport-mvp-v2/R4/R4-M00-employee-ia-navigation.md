# R4-M00 — Employee IA / Navigation

STATUS: DONE — PASS

## 1. Objetivo

Definir e implementar la información de arquitectura (IA) del Portal del Empleado: layout base, shell de navegación y punto de entrada mobile-first para el rol EMPLOYEE, sin construir todavía ninguna pantalla de contenido (Today/My Week/etc. son R4-M01+).

## 2. Problema que resuelve

Hoy no existe ninguna superficie dedicada al rol EMPLOYEE. `src/App.tsx` aloja todo el dashboard post-login sin separación por rol ni router. Un empleado que inicia sesión ve (o podría ver, si RBAC lo permitiera) la misma superficie que un ADMIN. R4-M00 crea el punto de entrada y el shell que todas las demás microfases de R4 usarán.

## 3. Estado actual del repositorio

- `src/App.tsx` mantiene el dashboard operativo existente para ADMIN/OWNER/PLANNER y ahora bifurca EMPLOYEE en un único punto post-auth.
- `src/components/employee-portal/PortalShell.tsx` contiene el shell aislado del portal, sin pantallas de contenido todavía.
- `src/lib/route.ts` conserva la estrategia de ruta física `/app` acordada en R0-M05; el rol determina la superficie renderizada.
- La resolución de sesión ya tenía una barrera de carga y redirección a `/login` ante errores; R4-M00 la reutiliza sin duplicar lógica.

## 4. Alcance IN

- Aplicar la estrategia de routing definida en R0-M05: ruta física `/app` con segmentación de superficie por rol.
- Shell de layout del portal (header mínimo, área de contenido, área de navegación inferior vacía — el contenido de la navegación lo define R4-M09).
- Redirección post-login: si `role === 'EMPLOYEE'`, entrar al shell del portal; si `role === 'ADMIN'`, mantener el dashboard actual sin cambios.
- Guard de ruta cliente (UX only) + reconfirmación de que el guard real vive en el backend (no se introduce autorización nueva aquí, se reutiliza la existente).

## 5. Alcance OUT

- Ninguna pantalla de contenido (Today, My Week, Shift Detail, etc.) — eso es R4-M01 en adelante.
- Ninguna funcionalidad de fichaje/attendance (post-MVP, R7).
- Ningún cambio al dashboard ADMIN existente más allá de la bifurcación de entrada por rol.
- Ninguna extensión de RBAC (OWNER/PLANNER se definen en R0-M03/R2-M06, no aquí).

## 6. Dependencias

- R0-M05 (Architecture & Module Boundaries) — decisión de routing debe estar cerrada (Gate PASS) antes de iniciar R4-M00.

## 7. Decisiones arquitectónicas

- El shell del portal vive en un módulo propio (p. ej. `src/components/employee-portal/`) separado de `src/components/shift-dashboard/`, para no acoplar el código ADMIN existente al nuevo código EMPLOYEE.
- La bifurcación por rol ocurre una sola vez, en el punto de entrada post-login (no se disemina el `if (role === 'EMPLOYEE')` por múltiples componentes).
- Mobile-first: el shell se diseña primero para viewport móvil; el comportamiento desktop es una extensión, no al revés.

## 8. Modelo de datos afectado

N/A — motivo: microfase puramente de shell/routing frontend, no toca esquema ni persistencia.

## 9. API / Backend

N/A — motivo: no se añade ni modifica ningún endpoint; se reutiliza el guard de auth/rol ya existente en `api/_lib/auth.js`.

## 10. Frontend / UX

- Shell con header (nombre org, nombre usuario, toggle tema/idioma reutilizando componentes existentes: `ThemeToggle.tsx`, i18n hooks).
- Área de contenido vacía (placeholder) hasta R4-M01.
- Contenedor de navegación inferior vacío, reservado para R4-M09.
- Estado de carga durante la resolución de rol/redirección reutilizando el gate `authResolved` existente de `App.tsx` (evita parpadeo del dashboard ADMIN).

## 11. Seguridad y autorización

- La bifurcación de UI por rol es solo UX; el backend sigue siendo la única barrera real de autorización (ya existente, no se modifica en esta microfase).
- Ningún dato de otro empleado se carga en el shell (no hay fetch de datos todavía).

## 12. i18n

- Todos los textos del shell (header, placeholders) deben usar las claves ES/EN existentes o nuevas añadidas a los catálogos de `src/lib/i18n*`, verificadas por `i18n-coverage.test.ts`.

## 13. Accesibilidad

- Landmarks semánticos (`header`, `main`, `nav` reservado) desde el inicio.
- Foco visible al navegar entre landmarks vía teclado.

## 14. Responsive / temas

- Verificar shell en breakpoints móvil/tablet/desktop.
- Dark/light heredado de `theme-react.tsx` sin lógica nueva.

## 15. Observabilidad / errores

- Estado de error si la resolución de rol falla (p. ej. sesión inválida) — reutilizar manejo de error de sesión ya existente, redirigir a login.

## 16. Migraciones

N/A — motivo: sin cambios de esquema.

## 17. Compatibilidad y datos existentes

- Usuarios ADMIN existentes no deben notar ningún cambio de comportamiento.
- Empleados con `user_id` ya vinculado (ver R2-M04) deben aterrizar en el nuevo shell inmediatamente tras el despliegue, sin pasos de migración de datos.

## 18. Tasks

### T01 — Aplicar decisión de routing de R0-M05

Objetivo:
Introducir el mecanismo de enrutado (router o segmentación equivalente) acordado en R0-M05, aplicado por primera vez al flujo post-login.

Archivos / módulos probables:
`src/App.tsx`, nuevo `src/components/employee-portal/PortalShell.tsx`.

Cambios:
Bifurcar el render post-login según `role` de la membership activa.

No hacer:
No reescribir el dashboard ADMIN existente.

Criterios de aceptación:
- [x] Login como EMPLOYEE renderiza el nuevo shell.
- [x] Login como ADMIN renderiza el dashboard sin cambios visibles.

Tests:
- Test de render condicional por rol.

Evidencia esperada:
- Captura de shell EMPLOYEE vacío y dashboard ADMIN sin cambios.

### T02 — Shell de layout (header + main + nav placeholder)

Objetivo:
Construir el layout base reutilizable por todas las pantallas de R4.

Archivos / módulos probables:
`src/components/employee-portal/PortalShell.tsx`, `PortalHeader.tsx`.

Cambios:
Header con identidad de organización/usuario, toggle tema/idioma, área `main` vacía, contenedor `nav` vacío.

No hacer:
No implementar contenido de Today/My Week aquí.

Criterios de aceptación:
- [x] Shell renderiza en mobile y desktop sin overflow horizontal.
- [x] Landmarks semánticos presentes.

Tests:
- Test de accesibilidad básico (landmarks, foco).

Evidencia esperada:
- Captura responsive (mobile/desktop) en claro/oscuro.

### T03 — Estado de carga/error en resolución de rol

Objetivo:
Evitar parpadeo o fuga de contenido incorrecto mientras se resuelve el rol activo.

Archivos / módulos probables:
`src/components/employee-portal/PortalShell.tsx`.

Cambios:
Loading state hasta resolver membership/rol; error state si sesión inválida (redirect a login).

No hacer:
No introducir lógica de reintento compleja; reutilizar manejo de sesión existente.

Criterios de aceptación:
- [x] Sin parpadeo de contenido ADMIN durante carga para un EMPLOYEE.
- [x] Sesión inválida redirige a login mediante el flujo de sesión existente, sin fallback anónimo.

Tests:
- Test de estado de carga y de sesión inválida.

Evidencia esperada:
- Log de consola limpio en ambos escenarios.

## 19. Tests obligatorios

- Unit: render condicional por rol, landmarks de accesibilidad y foco de acciones.
- Integration: N/A — motivo: sin API nueva en esta microfase.

## 20. Evidencias

- `src/App.employee-portal.test.tsx`: EMPLOYEE → portal y ADMIN → dashboard existente.
- `src/components/employee-portal/PortalShell.test.tsx`: landmarks, identidad, fallback de usuario y logout con foco.
- `src/App.employee-selector.test.tsx` y `src/App.areas.test.tsx`: expectativas heredadas reconciliadas con el nuevo contrato EMPLOYEE.
- `npm test -- --run`: PASS — 111 archivos / 1088 tests.
- `npm run lint`: PASS.
- `npm run build`: PASS — 1734 módulos transformados; warning conocido de chunks mayores de 500 kB.
- `git diff --check`: PASS.
- La resolución de sesión inválida queda cubierta por `App.logout.test.tsx`; no se añadió fetch ni autorización nueva en R4-M00.

## 21. Gate

Gates obligatorios: G1 (Architecture), G6 (UX/UI).

- G1 PASS: la bifurcación por rol vive en un único punto de entrada de `App.tsx` y el shell está aislado en `components/employee-portal`.
- G6 PASS: shell mobile-first, responsive, sin overflow horizontal, con loading gate heredado, landmarks y controles de tema/idioma.

Resultado ejecutado: PASS.

Resultado posible: PASS / PASS_WITH_WARNINGS / FAIL / BLOCKED (regla general del prompt maestro §9).

## 22. Rollback / remediación

Revert del commit de esta microfase restaura el comportamiento actual (todo usuario entra al dashboard ADMIN-shaped). No hay dato persistido que revertir.

## 23. Criterio de DONE

Un usuario con rol EMPLOYEE aterriza en el shell del portal tras login; un usuario ADMIN no ve cambio alguno; Gate G1+G6 en PASS.

Commit de cierre: pendiente de registrar tras el commit de esta microfase.
