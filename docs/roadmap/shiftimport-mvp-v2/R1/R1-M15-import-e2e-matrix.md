# R1-M15 — Import E2E Matrix

## 1. Objetivo
Confirmar que la matriz E2E de importación (acceptance-corpus + qa/e2e-acceptance) corre en CI en cada push, o documentar formalmente la brecha si no es así.

## 2. Problema que resuelve
Tener fixtures excelentes (10 doradas + 7 negativas + 8 adversariales) sin que corran automáticamente en CI es un riesgo de regresión silenciosa.

## 3. Estado actual del repositorio
STATUS: PARTIAL. `qa/e2e-acceptance/` y el acceptance-corpus existen y son rigurosos; el baseline no confirma si están gateados en CI (no se encontró configuración de CI en la primera pasada del audit).

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
- [ ] Confirmado con evidencia el estado real de CI (existe/no existe, qué cubre).
Tests: Ninguno.
Evidencia esperada: Resultado de la búsqueda, con rutas de archivo o su ausencia confirmada.

### T02 — Cerrar la brecha o documentarla formalmente
Objetivo: Si no hay CI gateando estas suites, conectarlas (mínimo viable, reusando el mecanismo que ya use el repo si existe alguno parcial) o, si no es viable en esta microfase, documentar la brecha como PASS_WITH_WARNINGS con una microfase futura explícita que la absorba, según la regla del master prompt §9.
Archivos / módulos probables: `.github/workflows/*` (si se crea/edita).
Cambios: Configuración de CI mínima que ejecute `npm test`, lint, typecheck, y `qa/e2e-acceptance/` en cada push a `development` y en PRs.
No hacer: No introducir un pipeline de CI complejo no solicitado; mínimo viable que cierre el riesgo de regresión silenciosa.
Criterios de aceptación:
- [ ] CI ejecuta la matriz E2E en cada push, o la brecha queda documentada como PASS_WITH_WARNINGS con microfase de seguimiento nombrada.
Tests: Confirmación de que el pipeline de CI (si se crea) pasa en verde sobre HEAD actual.
Evidencia esperada: Ejecución de CI en verde, o documento de brecha aceptada.

## 19. Tests obligatorios
Ejecución completa de `npm test`, acceptance-corpus, y `qa/e2e-acceptance/` — localmente si no hay CI, en pipeline si se crea.

## 20. Evidencias
Resultado de T01, resultado de T02 (pipeline en verde o documento de brecha).

## 21. Gate
Gates obligatorios: G11 (E2E), G13 (Regression).

Regla: PASS_WITH_WARNINGS permitido únicamente si T02 documenta la brecha con microfase de seguimiento nombrada explícitamente, sin riesgo de seguridad ni funcional inmediato.

## 22. Rollback / remediación
Si se introduce CI y rompe el pipeline existente de deploy (Vercel), revertir el cambio de CI y reintentar con configuración más conservadora.

## 23. Criterio de DONE
Estado real de CI confirmado; matriz E2E de importación corriendo automáticamente en cada push, o brecha formalmente documentada y aceptada.
