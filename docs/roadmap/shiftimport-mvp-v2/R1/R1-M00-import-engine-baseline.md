# R1-M00 — Import Engine Baseline

## 1. Objetivo

Documentar `src/ingestion/` como el contrato canónico del motor de importación (Safe Import) tal como existe hoy en el repositorio, sirviendo de base de referencia para el resto de microfases R1.

## 2. Problema que resuelve

No existe un documento único que describa la arquitectura del motor de ingestión. El conocimiento vive distribuido en el código (parsers, VLM fallback, format-memory, team-roster, diagnostics) y en commits recientes. Sin este baseline, las microfases siguientes (M01–M15) no tienen un punto de referencia estable para verificar invariantes.

## 3. Estado actual del repositorio

STATUS: DONE (motor ya implementado y en producción activa).

`src/ingestion/` contiene, según 00-BASELINE.md:
- Parsers: PDF (pdf.js), XLSX, CSV/XML/JSON adapters.
- Cliente VLM (vision-LLM) de fallback.
- Perfiles de format-memory (`format_profiles`, structureHash).
- Detección de team-roster (`team-roster.ts`).
- Diagnostics / state-contract (`diagnostics.ts`, `ImportState` de 6 valores).
- Acceptance-corpus: 10 fixtures doradas + 7 negativas + dataset adversarial (8 archivos hostiles).

Últimos 10 commits del repo son, en su totalidad, endurecimiento de este subsistema — es la parte más madura y testeada del producto.

## 4. Alcance IN

- Producir un documento de arquitectura (`docs/roadmap/shiftimport-mvp-v2/R1/R1-M00-import-engine-baseline.md`, este mismo archivo, sección 3 y evidencias) que describa módulos, responsabilidades y flujo de datos del motor.
- Enumerar los módulos reales con ruta de archivo.

## 5. Alcance OUT

- No se modifica código del motor en esta microfase.
- No se rediseña la arquitectura — eso es competencia de R0-M05 (module boundaries) para `api/_lib/data.js`, no del motor de ingestión en sí.

## 6. Dependencias

R0-M07 (R0 Final Gate) debe estar en PASS antes de iniciar R1.

## 7. Decisiones arquitectónicas

Ninguna decisión nueva — esta microfase es descriptiva, no prescriptiva. Cualquier decisión arquitectónica sobre el motor se documenta en la microfase correspondiente (M01–M15) donde exista una brecha real.

## 8. Modelo de datos afectado

N/A — motivo: no se modifican tablas en esta microfase; se referencian `format_profiles`, `imports`, `shifts` como parte de la documentación descriptiva.

## 9. API / Backend

N/A — motivo: no se modifican endpoints; se documentan los existentes (`api/format-profiles/index.js`, `api/imports/index.js`) por referencia.

## 10. Frontend / UX

N/A — motivo: no se modifica UI en esta microfase.

## 11. Seguridad y autorización

N/A — motivo: sin cambios de código, sin superficie de seguridad nueva.

## 12. i18n

N/A — motivo: documento técnico interno, no user-facing.

## 13. Accesibilidad

N/A — motivo: sin cambios de UI.

## 14. Responsive / temas

N/A — motivo: sin cambios de UI.

## 15. Observabilidad / errores

N/A — motivo: sin cambios de código.

## 16. Migraciones

N/A — motivo: sin cambios de esquema.

## 17. Compatibilidad y datos existentes

N/A — motivo: documento descriptivo, no afecta datos.

## 18. Tasks

### T01 — Inventariar módulos de `src/ingestion/`

Objetivo:
Listar cada archivo/módulo bajo `src/ingestion/` con su responsabilidad en una frase.

Archivos / módulos probables:
`src/ingestion/*` (parsers, VLM client, format-memory, team-roster.ts, diagnostics.ts).

Cambios:
Añadir tabla de inventario a este documento (sección 3, ya iniciada).

No hacer:
No modificar ningún archivo de `src/ingestion/`.

Criterios de aceptación:
- [ ] Cada módulo de `src/ingestion/` aparece listado con ruta y responsabilidad.
- [ ] El flujo ANALYZE → REVIEW → COMPARE → CONFIRM (master prompt §14) queda trazado a los módulos que lo implementan.

Tests:
Ninguno — tarea documental.

Evidencia esperada:
Tabla de inventario incorporada al documento.

### T02 — Confirmar que el documento no contradice el código

Objetivo:
Revisar que las afirmaciones de la sección 3 son correctas contra HEAD actual.

Archivos / módulos probables:
`src/ingestion/*`.

Cambios:
Corregir cualquier discrepancia detectada.

No hacer:
No añadir funcionalidad nueva ni refactors.

Criterios de aceptación:
- [ ] Cero discrepancias entre el documento y el código en HEAD.

Tests:
Ninguno.

Evidencia esperada:
Confirmación explícita en el resumen de Gate.

## 19. Tests obligatorios

N/A — motivo: microfase puramente documental, no introduce código ni riesgo de regresión.

## 20. Evidencias

- Este documento.
- `git log --oneline -10` (ya capturado en 00-BASELINE.md) como evidencia de madurez del subsistema.

## 21. Gate

Gates obligatorios: G14 (Documentation).

Regla: PASS si el documento es preciso y completo; FAIL si contiene afirmaciones no verificables contra el código.

## 22. Rollback / remediación

Si se detecta imprecisión tras el Gate: corregir el documento, no requiere revertir código (no hay cambios de código).

## 23. Criterio de DONE

El documento describe con precisión el estado real de `src/ingestion/` en HEAD `3d866e0`, sirviendo de referencia estable para R1-M01..M15.
