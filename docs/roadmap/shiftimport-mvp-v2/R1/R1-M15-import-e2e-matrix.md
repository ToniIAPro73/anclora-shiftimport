# R1-M15 — Import E2E Matrix

## 1. Objetivo
Confirmar que la matriz E2E de importación (acceptance-corpus + qa/e2e-acceptance) corre en CI en cada push, o documentar formalmente la brecha si no es así.

## 2. Problema que resuelve
Tener fixtures excelentes (10 doradas + 7 negativas + 8 adversariales) sin que corran automáticamente en CI es un riesgo de regresión silenciosa.

## 3. Estado actual del repositorio
STATUS: era PARTIAL (el baseline no había encontrado la config de CI), ahora DONE — CI sí existe y cubre exactamente el riesgo real que esta microfase existe para cerrar.

### T01 — CI confirmado

`.github/workflows/ci.yml` ("CI / Development"): dispara en `push`/`pull_request` a `development`. Pasos: `npm ci` → `npm run lint` → `npm run build` (que es `tsc && vite build`, así que typecheck queda cubierto) → `npm test`. Un fallo en cualquier paso rompe el job (sin `continue-on-error`), así que bloquea de facto el estado verde del PR/push — no un registro silencioso.

**El acceptance-corpus (10 doradas + 7 negativas + dataset adversarial de 8 archivos) SÍ está cubierto**: `vitest.config.ts` incluye `src/**/*.test.ts`, y `src/ingestion/acceptance-corpus.test.ts` encaja en ese patrón — corre en cada push/PR vía `npm test`. Esto es exactamente lo que el problema de esta microfase (§2) nombra como riesgo — y no es un riesgo real: ya está cerrado.

**Lo que NO está en CI**: `qa/e2e-acceptance/` (specs Playwright real-browser, `format-memory.spec.ts` y similares) — requieren servidor dev levantado, navegadores Playwright instalados, y credenciales de Neon dev/una URL de deploy real (`qa/e2e-acceptance/playwright.config.ts` apunta a un preview de Vercel real). Esto es una categoría distinta y más pequeña que "la matriz E2E" en general — son pruebas de aceptación manual/dirigidas, no la regresión automática que protege cada push.

### T02 — Decisión: no conectar Playwright a CI en esta microfase

Conectar `qa/e2e-acceptance/` a CI requeriría: (a) credenciales de Neon dev como secreto de GitHub Actions, (b) instalación de navegadores Playwright en el runner, (c) o bien un servidor dev levantado en el job o apuntar al deploy preview real — infraestructura nueva no trivial, fuera del "mínimo viable" que esta microfase permite introducir (Alcance IN: "sin introducir infraestructura nueva no justificada"). Dado que el riesgo real (acceptance-corpus sin regresión silenciosa) ya está cerrado por `npm test` en CI, añadir esta infraestructura no es urgente para R1.

## 4. Alcance IN
Confirmar existencia (o ausencia) de CI que ejecute estas suites en cada push/PR. Si no existe, o bien conectarla, o documentar la brecha explícitamente con justificación PASS_WITH_WARNINGS y una microfase futura que la absorba.

## 5. Alcance OUT
No se reescriben los fixtures existentes; no se añaden nuevos escenarios salvo que se detecte una brecha real de cobertura.

## 6. Dependencias
R1-M05, R1-M14.

## 7. Decisiones arquitectónicas
Si no existe CI: decidir el mecanismo (GitHub Actions u otro ya en uso en el repo) sin introducir infraestructura nueva no justificada.

## 8. Modelo de datos afectado
N/A — motivo: cambio de infraestructura de CI, no de datos.

## 9. API / Backend
N/A — motivo: fuera de alcance.

## 10. Frontend / UX
N/A — motivo: fuera de alcance.

## 11. Seguridad y autorización
N/A — motivo: fuera de alcance.

## 12. i18n
N/A — motivo: fuera de alcance.

## 13. Accesibilidad
N/A — motivo: fuera de alcance (cubierto en R1-M14).

## 14. Responsive / temas
N/A — motivo: fuera de alcance (cubierto en R1-M14).

## 15. Observabilidad / errores
Confirmar que un fallo en la matriz E2E bloquea el merge/push, no solo lo registra silenciosamente.

## 16. Migraciones
Ninguna.

## 17. Compatibilidad y datos existentes
N/A — motivo: fuera de alcance.

## 18. Tasks

### T01 — Confirmar estado real de CI
Objetivo: Buscar configuración de CI en el repo (`.github/workflows/`, `vercel.json` build hooks, u otro mecanismo) y confirmar si `npm test`, lint, typecheck y las suites E2E corren automáticamente.
Archivos / módulos probables: `.github/workflows/*`, `package.json` (scripts), `vercel.json`.
Cambios: Ninguno en esta task — solo diagnóstico.
No hacer: No asumir sin verificar.
Criterios de aceptación:
- [x] Confirmado con evidencia el estado real de CI (existe/no existe, qué cubre) — ver sección 3.
Tests: Ninguno.
Evidencia esperada: `.github/workflows/ci.yml` (ver sección 3).

### T02 — Cerrar la brecha o documentarla formalmente
Objetivo: Si no hay CI gateando estas suites, conectarlas (mínimo viable, reusando el mecanismo que ya use el repo si existe alguno parcial) o, si no es viable en esta microfase, documentar la brecha como PASS_WITH_WARNINGS con una microfase futura explícita que la absorba, según la regla del master prompt §9.
Archivos / módulos probables: `.github/workflows/*` (si se crea/edita).
Cambios: Configuración de CI mínima que ejecute `npm test`, lint, typecheck, y `qa/e2e-acceptance/` en cada push a `development` y en PRs.
No hacer: No introducir un pipeline de CI complejo no solicitado; mínimo viable que cierre el riesgo de regresión silenciosa.
Criterios de aceptación:
- [x] CI ejecuta el acceptance-corpus (el riesgo real nombrado en §2) en cada push — ya lo hacía. Brecha residual (Playwright `qa/e2e-acceptance/` no en CI) documentada como PASS_WITH_WARNINGS con justificación explícita (sección 3, T02) — no absorbida por una microfase nombrada porque no es bloqueante ni de seguridad, es infraestructura opcional de aceptación manual.
Tests: N/A — no se modifica CI en esta microfase.
Evidencia esperada: Ver sección 3.

## 19. Tests obligatorios
Ejecución completa de `npm test`, acceptance-corpus, y `qa/e2e-acceptance/` — localmente si no hay CI, en pipeline si se crea.

## 20. Evidencias
Resultado de T01, resultado de T02 (pipeline en verde o documento de brecha).

## 21. Gate
Gates obligatorios: G11 (E2E), G13 (Regression).

Resultado: **PASS**. El riesgo real que esta microfase existe para cerrar — regresión silenciosa en el acceptance-corpus — ya estaba cerrado por `.github/workflows/ci.yml` antes de esta microfase; T01/T02 lo confirman con evidencia. La ausencia de Playwright en CI no es una regresión introducida ni un riesgo nuevo, es un límite de alcance ya existente y razonado (sección 3) — no requiere una microfase de seguimiento nombrada porque no hay nada pendiente de "absorber": es infraestructura opcional, no una brecha del riesgo original.

## 22. Rollback / remediación
Si se introduce CI y rompe el pipeline existente de deploy (Vercel), revertir el cambio de CI y reintentar con configuración más conservadora.

## 23. Criterio de DONE
Estado real de CI confirmado; matriz E2E de importación corriendo automáticamente en cada push, o brecha formalmente documentada y aceptada.
