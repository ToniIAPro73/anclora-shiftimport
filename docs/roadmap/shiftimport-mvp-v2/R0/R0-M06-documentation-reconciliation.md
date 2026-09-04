# R0-M06 — Documentation Reconciliation

## 1. Objetivo

Sincronizar el resto de la documentación del repositorio (SETUP.md, backend-setup.md, implementation_plan.md, `docs/standards/*`, `docs/product/*`) con las decisiones tomadas en R0-M01 (contrato de producto), R0-M02 (glosario), R0-M03 (RBAC), R0-M04 (modelo de estados) y R0-M05 (límites de arquitectura), de forma que ningún documento del repo contradiga otro al cierre de R0.

## 2. Problema que resuelve

R0-M01..M05 introducen nuevos documentos canónicos (`RBAC-MODEL.md`, `STATE-MODEL.md`, `DOMAIN-GLOSSARY.md`, `MODULE-BOUNDARIES.md`) y corrigen README. Sin esta microfase, el resto de la documentación existente (SETUP.md, backend-setup.md, implementation_plan.md) podría seguir citando el modelo antiguo de 2 roles o el posicionamiento B2C ya corregido en el README.

## 3. Estado actual del repositorio

`docs/standards/*` (branding, modal contract, localization contract, motion contract) confirmados como contratos vivos y referenciados desde código — no tocar su contenido técnico, solo verificar que no contradicen el nuevo contrato de producto. `docs/product/APPLICATION_STRUCTURE_AREAS_OPTIONAL.md` y `docs/IMPORT_RECOVERY_FORMAT_MEMORY_REMEDIATION_2026-09-04.md` ya están al día. `SETUP.md`, `backend-setup.md`, `implementation_plan.md` no auditados todavía en detalle (pendiente de esta microfase).

## 4. Alcance IN

- Leer `SETUP.md`, `backend-setup.md`, `implementation_plan.md` completos y detectar cualquier afirmación que contradiga R0-M01..M05.
- Corregir referencias a roles (si mencionan solo ADMIN/EMPLOYEE sin indicar que RBAC de 4 roles está en diseño) para que apunten a `RBAC-MODEL.md`.
- Verificar `docs/standards/*` no contradice el nuevo posicionamiento de producto (no se espera contradicción, pero debe confirmarse, no asumirse).
- Añadir referencias cruzadas desde `docs/product/*` hacia los nuevos documentos canónicos de R0 donde sea relevante.

## 5. Alcance OUT

- No reescribir el contenido técnico de `docs/standards/*` (branding, modal, localization, motion contracts) — son contratos de UI ya correctos y fuera del alcance de un rebaseline de producto/arquitectura.
- No tocar código.

## 6. Dependencias

R0-M01, R0-M02, R0-M03, R0-M04, R0-M05.

## 7. Decisiones arquitectónicas

N/A — motivo: microfase de sincronización documental, no toma decisiones nuevas, aplica las ya tomadas en R0-M01..M05.

## 8. Modelo de datos afectado

N/A — motivo: documental.

## 9. API / Backend

N/A — motivo: documental.

## 10. Frontend / UX

N/A — motivo: documental.

## 11. Seguridad y autorización

N/A — motivo: documental.

## 12. i18n

N/A — motivo: los documentos afectados son internos (setup/arquitectura), no localizados.

## 13. Accesibilidad

N/A — motivo: no aplica a documentación interna.

## 14. Responsive / temas

N/A — motivo: no aplica.

## 15. Observabilidad / errores

N/A — motivo: no aplica.

## 16. Migraciones

N/A — motivo: ninguna.

## 17. Compatibilidad y datos existentes

N/A — motivo: cambio puramente documental.

## 18. Tasks

### T01 — Auditar SETUP.md, backend-setup.md, implementation_plan.md

Objetivo: Detectar contradicciones con R0-M01..M05.

Archivos / módulos probables: `SETUP.md`, `backend-setup.md`, `implementation_plan.md`.

Cambios: Ninguno todavía — solo lista de contradicciones.

No hacer: No reescribir en este task.

Criterios de aceptación:
- [ ] Lista de contradicciones (o confirmación de que no hay ninguna) con file:line.

Tests: N/A.

Evidencia esperada: Lista de hallazgos.

### T02 — Corregir contradicciones detectadas

Objetivo: Actualizar los tres documentos para alinearlos con README, RBAC-MODEL, STATE-MODEL, DOMAIN-GLOSSARY, MODULE-BOUNDARIES.

Archivos / módulos probables: mismos de T01.

Cambios: Ediciones puntuales, no reescritura completa salvo necesidad real.

No hacer: No inventar contenido nuevo no derivado de R0-M01..M05.

Criterios de aceptación:
- [ ] Cero contradicciones remanentes entre estos documentos y los canónicos de R0.

Tests: N/A.

Evidencia esperada: Diffs de los tres documentos.

### T03 — Verificar `docs/standards/*` y `docs/product/*`

Objetivo: Confirmar ausencia de contradicción (no se espera reescritura).

Archivos / módulos probables: `docs/standards/*`, `docs/product/*`.

Cambios: Ninguno esperado; referencias cruzadas añadidas si aporta claridad.

No hacer: No modificar contenido técnico de contratos de UI ya vigentes.

Criterios de aceptación:
- [ ] Confirmación explícita de ausencia de contradicción.

Tests: N/A.

Evidencia esperada: Nota de verificación en el resumen de microfase.

### T04 — Revisión cruzada final de todo `docs/`

Objetivo: Barrido final para confirmar que no queda ningún documento con "Phase 0"/B2C/2-roles-only sin actualizar.

Archivos / módulos probables: `docs/**/*.md`, `README.md`, `README.en.md`.

Cambios: Correcciones puntuales residuales si aparecen.

No hacer: No dejar hallazgos sin resolver silenciosamente.

Criterios de aceptación:
- [ ] Grep de términos obsoletos ("Phase 0", "B2C", "Prosumer") sin resultados fuera de contexto histórico explícito.

Tests: N/A (grep como verificación).

Evidencia esperada: Salida del grep final, limpia.

## 19. Tests obligatorios

N/A — motivo: microfase documental sin código ejecutable.

## 20. Evidencias

Diffs de `SETUP.md`, `backend-setup.md`, `implementation_plan.md` (si aplica); nota de verificación de `docs/standards/*` y `docs/product/*`; salida de grep final.

## 21. Gate

Gates requeridos: **G14 (Documentation)**.

G14: PASS si un grep de términos obsoletos ("Phase 0", "B2C", "Prosumer" fuera de contexto histórico) en todo `docs/` + README no arroja resultados, y los tres documentos de setup/plan están alineados con los documentos canónicos de R0.

## 22. Rollback / remediación

Si quedan contradicciones tras el Gate: corregir y repetir el grep de verificación. Sin riesgo de datos.

## 23. Criterio de DONE

Todo el árbol de documentación del repositorio es coherente con README.md/README.en.md (R0-M01), `DOMAIN-GLOSSARY.md` (R0-M02), `RBAC-MODEL.md` (R0-M03), `STATE-MODEL.md` (R0-M04) y `MODULE-BOUNDARIES.md` (R0-M05). Grep de verificación limpio.
