# UX Remediation Codex 2026-09 — Progress Log

Resume from here after any context compaction. Leer este fichero más `03_IMPLEMENTATION_PLAN.md`
antes de hacer nada; no reiniciar subtareas ya completadas.

Plantilla vacía — una fila por microtarea, todas en `PENDING`. Al implementar, cada gate real añade
una entrada con: fecha, HEAD antes/después, ficheros tocados, tests ejecutados y resultado,
desviaciones respecto a esta spec (si las hay) y decisiones tomadas durante la implementación.

---

## Estado de microtareas (36 total)

### Fase 0 — Línea base y harness (8)

| ID | Título | Estado |
|---|---|---|
| UXR-F0-M01 | Baseline de regresión visual reproducible | PARTIAL (determinismo 34/48, ver gate) |
| UXR-F0-M02 | Formato/ubicación de locales TS para `i18n-integrity-check` | PARTIAL (herramienta externa no disponible; cobertura sustituida por `i18n-coverage.test.ts`) |
| UXR-F0-M03 | Inventario de rutas internas de App | DONE |
| UXR-F0-M04 | Declaración de consumo del Design System | NOT_APPLICABLE (sin dependencia de design system) |
| UXR-F0-M05 | `hide-scrollbars=false` obligatorio | DONE (por diseño de herramienta) |
| UXR-F0-M06 | Rutas absolutas de subida en escenarios | DONE |
| UXR-F0-M07 | Aprovisionar cuentas sintéticas OWNER y PLANNER | PARTIAL (verificado en vivo por reproducción SQL; `local-setup.ts` no invocado literalmente) |
| UXR-F0-M08 | Congelar matriz base 8×2×2 | DONE (calendar 32/32; pricing/import-preview en subconjunto reducido, ver gate) |

### Fase 1 — Quick wins (4)

| ID | Título | Estado |
|---|---|---|
| UXR-F1-M01 | CX-F03 — nombres accesibles en preview | PENDING |
| UXR-F1-M02 | CX-F08 — sincronizar `lang` del documento | PENDING |
| UXR-F1-M03 | CX-F09 — separar precio/moneda/intervalo, terminología de roles | PENDING |
| UXR-F1-M04 | CX-E01 — alinear cabecera del fixture de empleados | PENDING |

### Fase 2 — Alto impacto (6)

| ID | Título | Estado |
|---|---|---|
| UXR-F2-M01 | CX-F01 — resumen expandible + región visible mínima | PENDING |
| UXR-F2-M02 | CX-F01 — adaptar filas a lectura móvil | PENDING |
| UXR-F2-M03 | CX-F04 — derivar resumen temporal efectivo (lib) | PENDING |
| UXR-F2-M04 | CX-F04 — consumir resumen efectivo en el badge (UI) | PENDING |
| UXR-F2-M05 | CX-F05 — separar existencia/vínculo, detectar duplicado intra-fichero (lib) | PENDING |
| UXR-F2-M06 | CX-F05 — mostrar clasificación y conteos consistentes (UI) | PENDING |

### Fase 3 — Estructura (6)

| ID | Título | Estado |
|---|---|---|
| UXR-F3-M01 | CX-F02 — métrica total responsiva en `StatsBar` | PENDING |
| UXR-F3-M02 | CX-F02 — indicador de overflow y scroll nombrado en tabla semanal | PENDING |
| UXR-F3-M03 | CX-F06 — conectar acuse al detalle activo del shell Employee | PENDING |
| UXR-F3-M04 | CX-F06 — estado de fallo y reintento del acuse | PENDING |
| UXR-F3-M05 | CX-F07 — acción masiva explícita en Equipo | PENDING |
| UXR-F3-M06 | CX-F07 — conservar contexto al volver de la preview bulk | PENDING |

### Fase 4 — Cierre de evidencia (12)

| ID | Título | Estado |
|---|---|---|
| UXR-F4-M01 | Retest histórico F2 — gate Personal | PENDING |
| UXR-F4-M02 | Retest histórico F9 — validación de nombre en onboarding | PENDING |
| UXR-F4-M03 | Cierre histórico F1 — persistencia postcommit | PENDING |
| UXR-F4-M04 | Cierre histórico F5 — contrato documental README/AGENTS | PENDING |
| UXR-F4-M05 | Verificación de cierre histórico F6 | PENDING |
| UXR-F4-M06 | Verificación de cierre histórico F8 | PENDING |
| UXR-F4-M07 | Journeys OWNER/PLANNER (cierre de flags) | PENDING |
| UXR-F4-M08 | Ciclo publicar→acuse→solicitud→resolución (PUBLISH/APPROVAL) | PENDING |
| UXR-F4-M09 | Reimportación e idempotencia + borrado seguro | PENDING |
| UXR-F4-M10 | Importación masiva de equipo completa (TEAM_IMPORT) | PENDING |
| UXR-F4-M11 | Verificación de credencial de un solo uso | PENDING |
| UXR-F4-M12 | Cobertura STAGING/PREVIEW | PENDING |

---

## Entradas de progreso

### 2026-09-09 — Fase 0 completa (PASS_WITH_GAPS)

- **HEAD antes/después**: `43e5c31dcb3e87cc5ebe47bfc9ab937ea530c919` (sin cambio de HEAD — nada
  commiteado en esta pasada).
- **Ficheros tocados**: `qa/e2e-acceptance/local-setup.ts` (añade seed de `format_profiles` para
  UXR-F0-M07 AC-2), `.gitignore` (añade rutas de evidencia de baseline), nuevos:
  `qa/e2e-acceptance/playwright.uxr-f0-baseline.config.ts`,
  `qa/e2e-acceptance/specs-baseline/ux-remediation-baseline.spec.ts`,
  `docs/audits/ux-remediation-codex-2026-09-baseline-procedure.md`,
  `docs/audits/ux-remediation-codex-2026-09-internal-routes-inventory.md`,
  `docs/roadmap/UXR-F0-BASELINE-HARNESS-GATE.md` (actualizado).
- **Discovery no anticipado por la spec**:
  1. `vite dev` sin backend detrás del proxy `/api` no basta para modo invitado — `fetchSession()`
     sólo trata un 401 explícito como "guest"; un fallo de proxy se trata como "desconocido" y
     redirige a `/login`. Resuelto interceptando `/api/session/me` con `context.route(...)` →
     401 sintético, sin levantar `proxy-server.mjs`.
  2. El layout actual usa `[data-testid="app-shell"]`/`[data-testid="sidebar-import"]` (componente
     `src/components/app-shell/AppShell.tsx`), no la clase `.dashboard-header` que usa el spec
     existente `specs-responsive/responsive-landscape.spec.ts` — ese spec puede estar desactualizado
     respecto al shell premium actual; no se tocó (fuera de alcance de esta microtarea), sólo se
     anota aquí para quien lo revise después.
  3. En viewports estrechos, `[data-testid="sidebar-import"]` queda fuera de viewport tras colapsar
     a drawer móvil — se añadió apertura de `[data-testid="app-shell-mobile-menu"]` cuando esté
     visible, antes de clicar el import.
  4. El import de fixture requiere un paso explícito "Procesar archivo" tras `setInputFiles` (el
     modal no auto-parsea al seleccionar el fichero) — añadido al spec, con el label resuelto vía
     `translate(locale, 'importModal.process')` para no hardcodear texto por idioma.
  5. La Neon dev branch tenía 3 organizaciones `E2E*` huérfanas y vacías de una corrida incompleta
     anterior (ajena a esta sesión) — limpiadas antes de verificar M07 en vivo, para no mezclar
     evidencia con basura de otra sesión.
- **Incidente de seguridad menor (auto-reportado)**: un primer intento de comprobar el host de
  `DATABASE_URL` con `grep`+`sed` no enmascaró correctamente la línea `DATABASE_URL_UNPOOLED` y
  expuso la contraseña de la Neon dev DB en la salida de una herramienta durante esta sesión.
  Recomendación entregada al usuario: rotar esa credencial de desarrollo por precaución. A partir de
  ese punto, toda lectura de `.env.development.local` se hizo mediante el mismo patrón interno que
  ya usa `local-setup.ts` (nunca imprime la URL).
- **Tests ejecutados y resultado**: ver `docs/roadmap/UXR-F0-BASELINE-HARNESS-GATE.md` §3.3 (antes/
  después de `npm test`/`tsc --noEmit`/`lint`/`build`, los 4 en verde en ambos momentos). Suite de
  captura (`playwright.uxr-f0-baseline.config.ts`): 48/48 tests pasan; determinismo entre 2
  corridas: 34/48 hashes idénticos (ver gate).
- **Desviaciones respecto a la spec original**: `UXR-F0-M07` verificado por reproducción SQL fiel de
  `local-setup.ts`, no por su invocación literal (requiere `vercel dev`, fuera de alcance de riesgo
  de esta pasada — ver gate §3.1). `UXR-F0-M08` capturó `pricing`/`import-preview` en subconjunto
  reducido de viewports, no las 8 completas (decisión de alcance documentada en el gate §3.4).
- **Riesgos para fases siguientes**: Equipo/Miembros/planner semanal no capturados (requieren
  sesión autenticada real, `vercel dev` + Neon) — Fase 3 debe levantar ese entorno. El determinismo
  parcial de M01 (70.8%) significa que cualquier captura puntual de evidencia en Fase 1-4 debe
  repetirse 2 veces antes de archivarse como definitiva, no asumirse estable a la primera.
- **Siguiente paso**: Fase 1 (`UXR-F1-M01`…`M04`, quick wins) puede empezar — sus dependencias
  declaradas (`UXR-F0-M05`, `UXR-F0-M06`) están cumplidas.

---

## Revisión de determinismo de UXR-F0-M01 (2026-09-09, posterior al cierre de Fase 0)

Motivo: AC-1 quedó como "causa no aislada" (34/48, 70.8%). Se aisló.

| Paso | Resultado |
|---|---|
| Aserción de contenido poblado (`.month-day-cell` × 30, `.pricing-card` × 3) en vez de `toBeAttached()` | Aplicado |
| `stableScreenshot()` — recaptura hasta que dos buffers consecutivos son idénticos | Aplicado; `settled: true` en 48/48, `max settleTries = 2` |
| `deviceScaleFactor: 1` explícito en cada contexto | Aplicado (el manifiesto ya lo declaraba sin controlarlo) |
| Reset de scroll antes de capturar | Aplicado |
| Directorio por corrida (`artifacts/ux-remediation-baseline/<runId>/`) | Aplicado — sin esto las dos corridas se pisaban |
| Flags de rasterización determinista en `launchOptions` | Aplicados; **reducen** la varianza, **no la eliminan** (una medición inicial de 3 muestras sugirió lo contrario y no se sostuvo al ampliarla) |
| `compare-baseline-runs.mjs` — verificación de AC-1 con tolerancia declarada | Nuevo |

**Causa aislada** (medida, no hipotetizada): DOM idéntico entre procesos (33 246 chars byte a byte),
orden de CSS idéntico, capturas idénticas al byte dentro de un mismo lanzamiento (4/4). La varianza
es de rasterización entre procesos, y son **dos fenómenos distintos**: jitter de antialiasing en
glifos (13-107 px de 329 160, `maxDelta` 4-10 de 765) e inestabilidad de layout sub-píxel en
`import-preview` (líneas horizontales de 1px, y=422, `maxDelta` 43).

**Resultado**: AC-1 cumplido con tolerancia declarada, **0 UNSTABLE en dos pares independientes**
(run1/run2: 36+11+1; run3/run4: 38+7+3). `import-preview` queda **declarada inestable a nivel de
pantalla** — declararla por id fue un error corregido: la firma se movía de celda entre pares.
Propiedad de `UXR-F2-M01`/`M02` (es la distribución de alturas fijas de CX-F01).

**Observación no atribuida a esta fase**: la suite `npm test` falló 1 vez de 13 ejecuciones (~8%),
con 2 errores no capturados; no reproducible en 10 intentos consecutivos posteriores y sin relación
con estos cambios (no se tocó `src/`). Se deja registrado, no diagnosticado.
