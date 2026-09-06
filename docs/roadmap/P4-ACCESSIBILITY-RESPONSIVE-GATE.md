# P4 — Accessibility & Responsive Hardening Gate

Fecha: 2026-09-06  
Rama: `development`  
Baseline de fase: `276efc1`  

## STATUS

`PASS_WITH_GAPS`

## Evidencia

| Criterio | Resultado | Evidencia |
|---|---|---|
| P4-M01 — controles de color accesibles | PASS | `SettingsModal` asigna nombre único a cada selector; test dirigido incluido |
| P4-M02 — scroll de tabla | PASS | wrapper con scroll propio, `tabIndex=0`, nombre accesible y affordance visual |
| P4-M03 — scroll de métricas | PASS | `StatsBar` mantiene ribbon horizontal alcanzable con affordance |
| P4-M04 — editor móvil | PASS | editor estable, espacio de seguridad para la última fila y retorno de foco |
| P4-M05 — navegación landing móvil | PASS | menú colapsable bajo 480px, `aria-expanded`, `aria-controls` y cierre con ESC |
| P4-M06 — validación inline de onboarding | PASS | reproducción roja previa; error persistente, `aria-describedby` y foco en el campo |
| P4-M07 — responsive | PASS | runner compacto: un journey sintético cubre 1440, 834, 390 y 844×390 |
| Accesibilidad dirigida | PASS | assertions de nombre, roles, focusability y ausencia de diálogos nativos |
| Regresión de componentes | PASS | 4 ficheros, 45 tests |
| Lint | PASS | `npm run lint` |
| Typecheck/build | PASS | `npm run build` |
| Seguridad, autorización, tenant, datos, API y DB | N/A | `git diff --stat` del cambio de Gate no añade cambios de producto en esas capas |
| Worktree | PASS | limpio después de registrar el Gate |

## E2E reducido

Se conserva una única prueba de navegador por fase para evitar repetir variantes que ya están
cubiertas por Vitest y assertions de componente. El runner P4 usa datos sintéticos interceptados,
un worker Chromium y verifica en la misma ruta:

- cuadrícula y tabla accesible;
- scroll interno y cabecera sticky;
- ausencia de overflow horizontal del `body`;
- editor móvil;
- tema claro y oscuro;
- landing responsive y menú accesible.

Resultado: `1/1 PASS`. El marcador `/tmp/shiftimport-p4-gate-results/.last-run.json` indica
`status: passed`; se generaron `p4-planner-dark-desktop.png`, `p4-planner-dark-mobile.png`,
`p4-planner-light-desktop.png` y `p4-table-dark-tablet.png`.

Las variantes de lógica permanecen en tests unitarios/componentes; no se duplican en E2E.

## Gap explícito

Las capturas son evidencia temporal local y no se versionan. El comportamiento queda cubierto por
el runner reproducible y las assertions automatizadas; una captura comparativa archivada puede
añadirse en el Gate final si el proceso de release la requiere.

## Decisión

P4 es segura y funcional, con un gap documental de archivado visual. No se modifica la lógica de
negocio ni se introduce migración, API o cambio de autorización.
