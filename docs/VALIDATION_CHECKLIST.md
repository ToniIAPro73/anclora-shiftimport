# Checklist de validación — modal Objetivo de jornada y Toast de feedback (2026-10-30)

> Se sobrescribe en cada entrega; el historial queda en Git.

**Repositorio:** anclora-shiftimport
**Rama:** development
**Entorno de validación:** ejecución LOCAL (`npm run dev`, `localhost:5173`) contra Neon Production `main` (credenciales del proyecto Vercel, scope `development`); QA solo en `ShiftImport — QA Mirror` con `qa.shiftimport@anclora.test`; organización `ShiftImport` en solo lectura.
**Datos:** turnos de prueba creados únicamente en el QA Mirror (días pasados aleatorios); 0 escrituras en `ShiftImport`.

## 1. Qué cambia
- Modal Objetivo de jornada: dos columnas en escritorio sin scroll evitable; en móvil una columna, Mínimo/Máximo en fila, footer separado y borde inferior difuminado; grupo "Horas que computan" contenido; campos alineados.
- Toast canónico (Design System) para feedback transitorio (turno guardado, importación ya existente): overlay, sin reflow del dashboard.
- Adopción local de `MODAL_CONTRACT` y `vite.config.ts` (`server.fs.allow`) para servir las fuentes del Design System en el runtime local.

## 2. Ya comprobado por el agente
| Comprobación | Resultado |
| --- | --- |
| QA visual/geométrica `specs-qa-mirror/target-modal-toast.spec.ts` (9): 1440×900, 1366×768, 390×844, oscuro/claro, ES + EN smoke | PASS |
| Toast: overlay `fixed`, `aria-live=polite`, `role=status`, descartable por teclado, cierre automático a 5 s, movimiento reducido, geometría del dashboard idéntica | PASS |
| Tests focales vitest (2 ficheros, 4 tests) | PASS |
| `eslint` de los ficheros afectados, `npm run build` (tsc + vite) | PASS |
| `git diff --check` | PASS |

## 3. NOT_RUN
Suite completa, E2E de importación/onboarding y producción: fuera de alcance (QA focal).

## 4. Para Toni
| # | Dónde | Pasos | Resultado esperado | Bloqueante |
| --- | --- | --- | --- | --- |
| 1 | `npm run dev` → Estadísticas → Objetivo anual → Configurar | Revisar el modal en escritorio y móvil | Sin scroll evitable; "Horas que computan" legible | No |
