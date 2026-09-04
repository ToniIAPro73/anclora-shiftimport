# R0-M05 — Architecture & Module Boundaries

> **EXECUTION NOTE (2026-09-04)**: the routing decision below ("introduce React Router now") was written before investigation and turned out to be based on a false premise — `src/lib/route.ts` already implements a working, tested, hand-rolled router. Tasks T02–T04/T06 as written (evaluate/install a routing library, verify theme after wrapping `App.tsx`) were superseded during execution. The actual decision taken, with full justification, is in [`MODULE-BOUNDARIES.md`](./MODULE-BOUNDARIES.md) section 2: extend `route.ts` incrementally, install nothing. No code was changed in this microfase. Gate still PASSED (G1, G15) against the corrected decision — see commit `e3753c3`.

## 1. Objetivo

Decidir y documentar (sin ejecutar todavía) la estrategia de división de `api/_lib/data.js` (1524 líneas, capa de acceso a datos monolítica) por dominio, y decidir el enfoque de enrutamiento del dashboard (`src/App.tsx`) necesario antes de que R3 (Scheduling) y R4 (Employee Portal) puedan añadir superficies de UI nuevas.

## 2. Problema que resuelve

Dos riesgos arquitectónicos identificados en el baseline bloquean progreso limpio de R3/R4:
1. `api/_lib/data.js` es un único archivo de 1524 líneas que concentra todo el acceso a datos. Añadir dominios nuevos (scheduling, approvals) sin una decisión de límites lo hará crecer sin control o forzará una refactorización a mitad de R3.
2. `src/App.tsx` aloja hoy todo el dashboard post-login sin router; `src/pages/` solo tiene landing/pricing. Introducir Employee Portal (R4) o Weekly Planner (R3) sin decidir el enfoque de enrutamiento antes generará trabajo redundante o una migración de routing a mitad de esas fases.

## 3. Estado actual del repositorio

`api/_lib/data.js` confirmado en 1524 líneas (ver `../00-BASELINE.md`). `src/App.tsx` es el shell único; `src/components/shift-dashboard/*` contiene la UI operativa actual. No hay librería de routing (React Router u otra) detectada en `package.json` — a confirmar en T04.

## 4. Alcance IN

- Decidir estrategia de split de `data.js`: por dominio (imports, employees, organizations, format-profiles, auth) en módulos separados bajo `api/_lib/` (p.ej. `api/_lib/data/imports.js`, `api/_lib/data/employees.js`, etc.), re-exportados o importados directamente por los endpoints — sin introducir una capa de abstracción/ORM nueva.
- Decidir si el split se ejecuta ahora (R0) o se difiere a R1-M16/R2 (dado que R1 está mayormente DONE y tocar `data.js` ahora tiene riesgo de regresión en la parte más madura del producto).
- Decidir enfoque de routing del dashboard: introducir React Router (u otra solución ligera) ahora en R0, o diferir hasta que R3-M08/R4-M00 lo necesiten explícitamente.
- Documentar la decisión con justificación explícita (riesgo/beneficio) para ambas.

## 5. Alcance OUT

- No ejecutar el split de `data.js` en esta microfase si la decisión es diferirlo (queda documentado como prerequisito de la microfase que lo necesite).
- No introducir router en esta microfase si la decisión es diferirlo.
- No introducir Redux/Zustand ni gestión de estado global nueva — no hay evidencia en el baseline de que sea necesaria.

## 6. Dependencias

R0-M03 (el guard de autorización futuro debe already estar contractualmente definido antes de decidir cómo se particiona el acceso a datos por dominio+rol), R0-M04 (las tres máquinas de estado futuras informan qué módulos de datos nuevos vendrán).

## 7. Decisiones arquitectónicas

- **Split de `data.js`**: DIFERIR la ejecución. Justificación: R1 (Safe Import) es la parte más madura y probada del producto; tocar `data.js` ahora sin necesidad funcional inmediata introduce riesgo de regresión sin beneficio a corto plazo. Se documenta el plan de split (por dominio: `imports`, `employees`, `organizations`, `format-profiles`, `auth`) para ejecutarlo de forma incremental cuando R2/R3 añadan dominios nuevos (cada dominio nuevo se escribe en su propio módulo desde el principio; los dominios existentes se migran solo si un cambio los toca de todas formas — migración oportunista, no un refactor global previo).
- **Routing del dashboard**: INTRODUCIR una librería de routing ligera (React Router) en R0-M05 mismo, antes de R3/R4, porque ambas fases dependen de navegación multi-vista (Weekly Planner, Employee Portal con Hoy/Semana/Solicitudes/Más) y retrasarlo forzaría una migración de routing a mitad de una fase de producto. Esto es la única pieza de código real que esta microfase introduce; el resto es documentación de decisión.

## 8. Modelo de datos afectado

N/A — motivo: esta microfase no toca esquema, solo estructura de módulos de código y routing de frontend.

## 9. API / Backend

Plan de split de `data.js` documentado (no ejecutado): módulos futuros `api/_lib/data/{imports,employees,organizations,format-profiles,auth}.js`, cada uno exportando las funciones ya existentes en `data.js` agrupadas por dominio, sin cambiar sus firmas ni comportamiento.

## 10. Frontend / UX

Introducción de routing base: instalar librería de routing, envolver `src/App.tsx` con un router de nivel superior, migrar las vistas actuales (landing, pricing, dashboard) a rutas explícitas sin cambiar su UI/comportamiento visible. Es un cambio estructural, no visual.

## 11. Seguridad y autorización

N/A — motivo: el routing introducido aquí no cambia ninguna regla de autorización (todas las rutas post-login siguen requiriendo la misma sesión que hoy); no se añaden rutas nuevas de negocio en esta microfase.

## 12. i18n

N/A — motivo: no se añaden strings nuevos de usuario en esta microfase.

## 13. Accesibilidad

El router introducido debe preservar el foco y el comportamiento de navegación por teclado ya existente en `App.tsx` — verificar que no se rompe el orden de tabulación al envolver con el router.

## 14. Responsive / temas

Verificar que envolver `App.tsx` con el router no introduce layout shift ni rompe dark/light — regresión visual a comprobar manualmente antes de Gate.

## 15. Observabilidad / errores

N/A — motivo: no se añade telemetría nueva en esta microfase; el comportamiento de error existente de `App.tsx` debe preservarse intacto.

## 16. Migraciones

N/A — motivo: ninguna migración de base de datos en esta microfase.

## 17. Compatibilidad y datos existentes

La introducción del router no debe cambiar ninguna URL ni comportamiento visible para el usuario actual (single-page hoy, sigue pareciendo single-page hasta que R3/R4 añadan rutas reales) — es un cambio de infraestructura interna, no de producto.

## 18. Tasks

### T01 — Documentar plan de split de `data.js` (sin ejecutar)

Objetivo: Especificar los 5 módulos de dominio futuros y su mapeo de funciones actuales.

Archivos / módulos probables: nuevo documento `docs/roadmap/shiftimport-mvp-v2/R0/MODULE-BOUNDARIES.md`, lectura de `api/_lib/data.js`.

Cambios: Documento con mapeo función→módulo futuro.

No hacer: No mover ni una sola función de `data.js` en esta microfase.

Criterios de aceptación:
- [ ] Cada función pública de `data.js` asignada a uno de los 5 módulos de dominio futuros.
- [ ] Decisión de "migración oportunista, no refactor global" documentada con justificación.

Tests: N/A.

Evidencia esperada: `MODULE-BOUNDARIES.md`, sección "data.js split plan".

### T02 — Evaluar y elegir librería de routing

Objetivo: Confirmar ausencia de router actual y elegir una opción ligera compatible con Vite+React.

Archivos / módulos probables: `package.json`, `src/App.tsx`.

Cambios: Ninguno todavía — solo decisión documentada.

No hacer: No instalar todavía en este task (instalación es T03).

Criterios de aceptación:
- [ ] Confirmado que no existe router instalado hoy.
- [ ] Librería elegida con justificación breve (tamaño, compatibilidad, mantenimiento).

Tests: N/A.

Evidencia esperada: Sección "Routing decision" en `MODULE-BOUNDARIES.md`.

### T03 — Instalar router y envolver `App.tsx` sin cambiar rutas visibles

Objetivo: Introducir el router base sin alterar comportamiento actual.

Archivos / módulos probables: `package.json`, `src/App.tsx`, `src/pages/`.

Cambios: Instalación de dependencia; wrapper de router de nivel superior; landing/pricing/dashboard mapeados a rutas explícitas equivalentes al comportamiento actual.

No hacer: No añadir rutas nuevas de negocio (Weekly Planner, Employee Portal) — eso es R3/R4.

Criterios de aceptación:
- [ ] `npm run build` pasa sin errores.
- [ ] Navegación actual (landing → login → dashboard) funciona idéntica a antes visualmente.
- [ ] Sin layout shift ni regresión de foco/teclado.

Tests: Verificación manual en navegador (build + smoke test de navegación); tests existentes de `App.tsx`/páginas siguen en verde.

Evidencia esperada: Diff de `App.tsx`, captura de navegación antes/después, resultado de `npm run build`.

### T04 — Verificar tema y responsive tras el cambio de routing

Objetivo: Confirmar que dark/light y layout responsive no se rompen al envolver con router.

Archivos / módulos probables: `src/lib/theme-react.tsx`, `src/App.tsx`.

Cambios: Ninguno de producto — solo verificación; ajustes menores si aparece regresión.

No hacer: No rediseñar theming en esta microfase.

Criterios de aceptación:
- [ ] Dark/light funcionan igual que antes en las rutas migradas.
- [ ] Sin layout shift en ningún breakpoint probado.

Tests: Verificación manual (o captura) en al menos 2 breakpoints × 2 temas.

Evidencia esperada: Capturas antes/después.

### T05 — Documentar prerequisitos que R2/R3/R4 heredan de esta decisión

Objetivo: Dejar explícito qué asume R3-M08 (Weekly Planner UI) y R4-M00 (Employee IA/Navigation) sobre el router ya existente.

Archivos / módulos probables: `MODULE-BOUNDARIES.md`, `../00-ROADMAP-MASTER.md` (referencia, sin reescribir tabla).

Cambios: Sección "Downstream assumptions" en `MODULE-BOUNDARIES.md`.

No hacer: No modificar la tabla de roadmap master en esta microfase salvo nota de referencia.

Criterios de aceptación:
- [ ] Prerequisitos heredados documentados explícitamente.

Tests: N/A.

Evidencia esperada: Sección "Downstream assumptions" visible.

### T06 — Gate de regresión general

Objetivo: Confirmar que ningún test existente se rompió por el cambio de routing.

Archivos / módulos probables: suite completa de tests.

Cambios: Ninguno — solo ejecución de verificación.

No hacer: No hacer skip de tests fallidos para forzar PASS.

Criterios de aceptación:
- [ ] Suite completa (`npm test`) en verde.
- [ ] `npm run build` y typecheck en verde.

Tests: Suite completa del repositorio.

Evidencia esperada: Salida de `npm test`, `npm run build`, typecheck.

## 19. Tests obligatorios

- Suite completa existente (`npm test`) debe permanecer en verde tras T03/T04.
- Build (`npm run build`) y typecheck deben pasar.
- Verificación manual de navegación, tema y responsive (T04).

## 20. Evidencias

`MODULE-BOUNDARIES.md` (plan de split de `data.js` + decisión de routing + prerequisitos heredados); diff de `App.tsx`; capturas antes/después de navegación/tema/responsive; salida de test/build/typecheck.

## 21. Gate

Gates requeridos: **G1 (Architecture)**, **G15 (Build/lint/typecheck)**.

- G1: PASS si ambas decisiones (split de `data.js` diferido con plan documentado; routing introducido) están justificadas y documentadas, y el routing no altera comportamiento visible actual.
- G15: PASS si build, lint, typecheck y suite completa de tests pasan tras la introducción del router.

FAIL si el cambio de routing rompe cualquier test existente o introduce regresión visual — no commit, corregir, re-Gate.

## 22. Rollback / remediación

Si el router introduce regresión no corregible rápidamente: revertir el commit de esta microfase (nuevo commit de reversión, no `git reset --hard`), documentar el bloqueo, y reintentar con una librería de routing alternativa o un enfoque de wrapper más conservador.

## 23. Criterio de DONE

`MODULE-BOUNDARIES.md` documenta el plan de split de `data.js` (diferido, con mapeo función→módulo) y la decisión de routing (ejecutada). Router instalado y funcionando sin regresión visible, con toda la suite de tests, build y typecheck en verde. R3-M08 y R4-M00 pueden asumir que existe una base de routing funcional.
