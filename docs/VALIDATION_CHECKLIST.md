# Checklist de validación — F1: planificación móvil y auto-publicación en importación (2026-10-30)

> Se sobrescribe en cada entrega; el historial queda en Git.

**Repositorio:** anclora-shiftimport
**Rama:** development (F1 sobre `7979b35`)
**Spec canónica:** `docs/specs/SPEC-SHIFTIMPORT-PLANNING-SIMPLIFICATION-MOBILE-AND-VACATIONS.md` (F1)
**Entorno de validación:** runtime local (`qa:dev-runtime`, `IMPORT_AUTO_PUBLISH_ENABLED=true`) → Neon `main`; escrituras solo en `ShiftImport — QA Mirror` y tenants sintéticos `E2E-SHIFT-<runId>`.
**Datos:** sintéticos; 0 escrituras en `ShiftImport` real ni Groundforce; 0 despliegues manuales; 0 promociones.

## 1. Qué cambia
- **Móvil**: `day-focus` rediseñado (era una tira de ~10 px por especificidad CSS), pista de scroll encima de la rejilla, barra del planificador en rejilla ≤640, «1 turno», calendario mensual compacto con panel del día (`MonthDayAgenda`), TopBar compacto con Rol/Empleado en el menú de cuenta (OD-06).
- **Importación**: nueva decisión `historical-and-auto-publish` (publica solo lo válido, de hoy en adelante, atribuible a la propia importación y sin pisar trabajo manual). Detrás de `IMPORT_AUTO_PUBLISH_ENABLED` (**apagado por defecto**): con el switch apagado todo se comporta como hoy.
- **Reversión** de importaciones auto-publicadas (1:1 o bloqueada) y notificación única por empleado y lote.
- **Migración `0049` aplicada en Neon `main`** con tu autorización (`db/migrations/0049_import_auto_publish_decision.sql`, sha256 `550cc2042877…`); el switch sigue apagado por defecto.

## 0. Corrección posterior a F1 (calendario en vertical, sin commit)
- Con el móvil en vertical y «Sitio de escritorio» (~980 px de ancho, 2000+ px de alto) el mes salía pequeño y aplastado (filas de ~59 px). En `src/index.css` (`@media (min-width: 641px) and (orientation: portrait) and (min-height: 701px)`) las filas pasan a seguir el ancho (`clamp(104px, 14.5vw, 190px)`, casillas algo más altas que anchas, ~142 px a 980 px) y el mes NO se estira al alto de la pantalla. Horizontal, escritorio y ≤640 px no cambian.
- Tablets (561–980 px): siete columnas fluidas (el domingo ya no se corta a 768 px) y la cabecera del calendario ya no se solapa con el selector de empleado (`AppShell.css`); los controles pasan a otra línea si no caben.
- Comprobado (diagnóstico con API simulada, 980×2000; iPhone 390, Galaxy A16 412 y tablets 600/768/820 en vertical): rejilla 311 → ~730 px, sin desbordes. **Validación de Toni en dispositivo: pendiente.**

## 2. Ya comprobado por el agente
| Comprobación | Resultado |
| --- | --- |
| `0049` en Neon `main` (autorizada) | aplicada: 49 aplicadas, 0 pendientes, `0050` sin aplicar |
| Huella de la organización real `ShiftImport` antes/después de migrar y de todo el QA | idéntica; Groundforce no existe en esta BD; 0 escrituras en ambas |
| E2E real (`auto-publish.spec.ts`, runtime local → Neon `main`, tenants sintéticos `E2E-SHIFT-<runId>`, residuo 0) | 8/8: MIXED y FUTURE limpios, SPLIT, manual/NULL/pendiente retenidos, reversión 1:1 y bloqueada, PLANNER ORG/AREAS/EMPLOYEES, EMPLOYEE 403, cross-tenant, INV-06 |
| `qa:local:smoke` (QA Mirror) | PASS |
| Accesibilidad en runtime real (`a11y-f1.spec.ts`) | 4/4 (teclado, `aria-pressed`, foco devuelto al menú, `day-focus`, pista); corregido un fallo de contraste real |
| Accesibilidad consentimiento y resultado (`harness/a11y.mjs`) | 92/92 (axe, teclado, foco, trampa de foco, Esc, `role=status`) |
| Suite completa `vitest`, `eslint`, `tsc`, `build` | PASS |
| Mirror refrescado (`--apply`) tras el QA | PASS, origen sin cambios |

## 3. NOT_RUN / gaps
**F1_GATE=PASS** (validación humana de Toni, 2026-10-30). Lo siguiente es deuda técnica NO bloqueante:
- Suite histórica completa de `specs-qa-mirror`: no completada (1 h, 18 fallos sin diagnosticar uno a uno). `import-layout-identity` (desktop) falla por un test desfasado desde `851e846` (anterior a F1); el resto, timeouts de 90 s. Deuda técnica no bloqueante; no se re-ejecuta ni se sanea en F1.
- `test:a11y` del paquete E2E (usa `vercel dev` + Postgres Docker): no es el runtime contractual.
- Specs que exigen documentos reales: no ejecutados.

## 4. Para Toni
- Confirmar en el móvil si el navegador estaba en «Sitio de escritorio» (`innerWidth` real).
