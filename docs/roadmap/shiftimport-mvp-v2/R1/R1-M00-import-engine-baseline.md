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

### Inventario de módulos (T01, verificado contra HEAD `3d866e0`)

| Módulo | Responsabilidad |
|---|---|
| `parsers/pdf.ts`, `parsers/detect.ts`, `parsers/parse-items.ts`, `parsers/file.ts`, `parsers/multi-section.ts` | Extracción de texto/estructura desde PDF, detección de tipo de documento, parseo a ítems posicionales |
| `adapters/xlsx-workbook.ts`, `adapters/json-adapter.ts`, `adapters/xml-adapter.ts`, `adapters/structured-rows.ts` | Adaptadores de formato tabular (Excel/JSON/XML/CSV estructurado) a un modelo de filas común |
| `core/row-detection.ts`, `core/day-columns.ts`, `core/clustering.ts`, `core/normalize.ts`, `core/shift-builder.ts`, `core/tokens.ts`, `core/text-items.ts`, `core/calendar-context.ts`, `core/shift-code-profile.ts` | Núcleo determinista de detección de filas/columnas de día, normalización de tokens y construcción de turnos a partir de ítems posicionales |
| `profiles/type-a.ts`, `profiles/type-b.ts`, `profiles/tabular.ts`, `profiles/multi-section.ts`, `profiles/legend.ts`, `profiles/index.ts`, `profiles/types.ts` | Perfiles de formato conocidos (plantillas estructurales) y su registro |
| `analysis.ts` | Capa de análisis de calidad de importación sobre el pipeline de parseo (Fase 1A) — produce `DocumentAnalysisResult` |
| `assistant.ts` | Asistente de perfil de formato: cuando `analysis.ts` no puede importar con confianza, ofrece recuperación guiada sin UI (Fase 1A) |
| `tabular-assistant.ts` | Variante del asistente para documentos tabulares/CSV no posicionales (remediación Fase 1A) |
| `diagnostics.ts` | Capa de diagnóstico estructurado + recuperación guiada (Fase 1B) — deriva el `ImportState` de 6 valores (`READY`/`NEEDS_USER_INPUT`/`PARTIAL`/`BLOCKED`/`UNSUPPORTED`/`FAILED`) desde `DocumentAnalysisResult`, capa pura sin efectos |
| `team-roster.ts` | Detección de roster multiempleado en CSV/tabular (Fase 1.2F): identifica cada empleado distinto en el documento |
| `pdf-roster.ts` | Equivalente de team-roster para PDF posicional (Fase 1.2F-PDF): descubre qué empleados aparecen en el documento |
| `pdf-team-import.ts` | Punto de entrada async, consumidor de `File`, para import de equipo desde PDF — reutiliza el pipeline de extracción individual por cada empleado descubierto por `pdf-roster.ts` |
| `import-dispatcher.ts` | Regla de enrutamiento única compartida por todos los adaptadores de roster estructurado y la UI — decide a qué adaptador/flujo enviar un documento |
| `vlm-trigger.ts` | Decide (puro, sin efectos) si un documento califica para el fallback visual (VLM) tras fallar el pipeline determinista |
| `vlm-client.ts` | Cliente del fallback VLM server-side (`POST /api/ingestion/vlm`), autenticado y org-scoped |
| `vlm-raster.ts` | Rasteriza PDF/imagen a PNG base64 para el payload del endpoint VLM (browser-only, canvas/pdf.js) |
| `formats.ts` | Registro de capacidades de formatos soportados — de aquí deriva la UI su `accept` de input de archivo y su lista visible de formatos |
| `fixtures/` | Acceptance-corpus: fixtures doradas/negativas, dataset adversarial, `DATASET_README.md` |

### Flujo ANALYZE → REVIEW → COMPARE → CONFIRM trazado a módulos

- **ANALYZE**: `parsers/*` + `adapters/*` + `core/*` (extracción y detección) → `analysis.ts` (calidad) → `diagnostics.ts` (deriva `ImportState`) → si insuficiente, `assistant.ts`/`tabular-assistant.ts` (recuperación guiada) o `vlm-trigger.ts` → `vlm-client.ts`/`vlm-raster.ts` (fallback visual).
- **REVIEW**: resultado de `analysis.ts`/`diagnostics.ts` + (para equipo) `team-roster.ts`/`pdf-roster.ts` se muestra en `ImportModal.tsx`/`TeamImportModal.tsx` (fuera de `src/ingestion/`, capa UI) para edición previa a confirmar.
- **COMPARE**: contraste contra turnos/empleados existentes — implementado en la capa de API/datos (`api/_lib/data.js`, `api/imports/`), no en `src/ingestion/` — ver R1-M05.
- **CONFIRM**: escritura final vía `api/imports/` una vez el usuario confirma — ver R1-M06.

`import-dispatcher.ts` es el punto que decide, para import de equipo, hacia qué adaptador (`team-roster.ts`, `pdf-roster.ts`, o adaptadores tabulares) enrutar un documento dado.

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
