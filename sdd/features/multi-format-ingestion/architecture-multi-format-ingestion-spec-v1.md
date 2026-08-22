# architecture-multi-format-ingestion-spec-v1

Estado: DISEÑO APROBADO PARA FASES — análisis completado sobre `development` @ d907be7 (+ cambios de perfil/reset pendientes de commit).
Alcance: arquitectura de importación multi-formato con aprendizaje adaptativo para Anclora ShiftImport.

## 1. Principios no negociables (contrato del producto)

1. Una empresa puede tener cero, una o muchas áreas.
2. Un área puede tener cero, uno o muchos perfiles de importación.
3. Un perfil puede servir para una o muchas áreas (many-to-many).
4. El formato no define el área; el área no define el formato.
5. Los cambios de software son normales; los perfiles antiguos coexisten (legacy) con los nuevos.
6. El aprendizaje produce configuración versionable/auditable/reversible, nunca código auto-modificado.
7. Todos los formatos convergen a un modelo normalizado antes de persistir.
8. El aprendizaje global guarda patrones estructurales, nunca PII.
9. Formatos oficiales: CSV, XLSX, JSON, XML, PDF. Nada más; el resto se rechaza con mensaje claro.
10. Prioridad conceptual: JSON/XML → CSV/XLSX → PDF (PDF = más complejo, no referencia).
11. El usuario solo interviene cuando la confianza automática no basta (revisión asistida mínima).
12. La UX oculta fingerprints, signatures, parser config e IDs internos.

## 2. Estado actual (evidencia del repo)

### Lo que YA existe y se reutiliza

- **IR universal `PdfTextItem[]`** (`src/ingestion/core/text-items.ts`): todo extractor (PDF.js, Tesseract OCR, ExcelJS, CSV) proyecta a items posicionados. Es la capa de adapters actual.
- **Core posicional puro** (`core/`): normalize, tokens, clustering, row-detection, shift-builder, shift-code-profile. Agnóstico de formato, bien testeado.
- **Registro declarativo `IngestionProfile`** (`src/ingestion/profiles/`): TYPE_A/TYPE_B/TYPE_TAB/TYPE_LEGEND/TYPE_MULTI, detección ordenada first-match, perfiles como datos (umbrales, geometría, estrategia de calendario). Es el embrión del "format profile".
- **`UserFormatProfile` aprendido** (`src/lib/format-profiles.ts`): signature estructural (FNV-1a one-way hash, SIN PII), tokenAliases, codeTimes, offTokens, employeeRow strategy, dayColumnMap, memoria tabular, useCount. Matching 1.0/0.6 + `detectProfileDrift`. Persistencia: solo localStorage.
- **Calidad + diagnósticos** (`analysis.ts`, `src/lib/import-quality.ts`, `diagnostics.ts`): confidence con penalizaciones explicables, estados canónicos READY/NEEDS_USER_INPUT/PARTIAL/BLOCKED/UNSUPPORTED/FAILED, diagnósticos estructurados con recuperación guiada. Es el Validator independiente pedido.
- **Ruta roster CSV** (`parsers/file.ts` `parseRosterCsv` + `ROSTER_HEADER_ALIASES`): parser de filas con mapeo de cabeceras — embrión del esquema normalizado.
- **Asistente de formato** (`assistant.ts`, `tabular-assistant.ts`, `ProfileAssistantPanel.tsx`): Q&A mínima sobre ambigüedades; respuestas → perfil aprendido (aprendizaje = configuración, ya cumple el principio 6).
- **Corpus de aceptación** (`src/ingestion/fixtures/acceptance-corpus/`): 17 fixtures manifest-driven con golden `expected.json` (schema rico: employee, segments, crosses_midnight, status, area) + `_negative/` GN-01..07 + dataset adversarial.
- **Backend multi-tenant** (`api/`, `db/migrations/`): org-scoping forzado server-side, planes (free/personal/team) con `requireFeature`, convenciones de migración transaccionales, `resetOrganization` transaccional.

### Gaps confirmados

- **No existen parsers JSON ni XML** (JSON solo aparece como fixture adversarial no manejado).
- **XLSX es PARTIAL y frágil**: solo primera hoja, proyección celda→posición falsa pierde semántica de cabeceras.
- **No hay esquema normalizado único**: dos rutas paralelas (items posicionales vs filas roster) convergen solo en `ParsedCalendarShift`, que es plano (worker id contrabandeado en `notes`, sin segments/crossesMidnight/status).
- **Perfiles aprendidos son localStorage-only**: sin sync remoto, sin compartir entre usuarios de la org, sin tier global.
- **No existen áreas** ni bindings perfil↔área (ni en DB ni en dominio).
- **No hay ciclo de vida de perfiles** (candidate/validated/verified/legacy/deprecated): solo `useCount` y drift.
- **Repair loop es single-shot** (una ronda Q&A), no iterativo acotado.
- **`classifyDocument`** solo por extensión/MIME; sin content sniffing.
- **Sin observabilidad persistida** de importaciones (métricas sin PII).
- Detección de tipo de documento soportado: `formats.ts` acepta imágenes (PARTIAL) — el nuevo contrato las excluye del contrato oficial (se comunican como no oficiales).

## 3. Arquitectura objetivo

### 3.1 Pipeline

```
Upload → detectFileType (extensión + content sniffing)
       → reject si fuera de {CSV,XLSX,JSON,XML,PDF} con mensaje claro
       → fingerprint estructural (sin PII)
       → lookup: FormatProfile org → Global Registry
       → match alta confianza: adapter → NormalizedShiftRecord → Validator → preview → import
       → sin match: Adaptive Repair Loop (acotado) → Validator
                     → confianza media: revisión asistida (solo ambigüedades)
                     → respuestas → Candidate FormatProfile (+ binding área si se preguntó)
       → área: inferida por binding conocido; solo se pregunta si no se puede deducir
```

Separación estricta: ingestion / classification / extraction / normalization / validation / persistence.

### 3.2 Modelo de entidades

```
Organization (existe)
  ├── Area (NUEVA, opcional, org-scoped)                    0..N
  ├── FormatProfile (EVOLUCIÓN de UserFormatProfile → server) 0..N
  ├── AreaProfileBinding (NUEVA, M:N area↔profile, org-scoped)
  ├── OrganizationOverride (NUEVA: aliases/tokens locales)    0..N
  └── employees (existe; employees.area_id opcional, fase posterior)

GlobalFormatRegistry (NUEVA, cross-tenant, SOLO estructura)
  └── GlobalFormatProfile: signature, header patterns, column mappings,
      date/time patterns, token aliases estructurales, parser config,
      lifecycle status, confidence history, version
```

- `FormatProfile` ≠ binding: "cómo se interpreta el documento" vs "dónde se usa".
- Lifecycle: `candidate → validated → verified` (+ `legacy`, `deprecated`). Promoción por evidencia (nº de importaciones confirmadas, orgs distintas para global), nunca por un solo archivo.
- Drift: fingerprint deja de coincidir → nueva versión `candidate`, nunca sobrescribir perfil conocido.
- Empresa sin áreas: perfiles vinculados directamente a la organización (binding con `area_id NULL`); no se fuerzan áreas artificiales.

### 3.3 NormalizedShiftRecord (evolución de ParsedCalendarShift)

```
NormalizedShiftRecord {
  employeeRef { id? | externalId? | name? }   // first-class, no notes
  date, startTime, endTime
  segments[]?, crossesMidnight?
  shiftType, status (work|free|vacation|...)
  location?
  sourceType (csv|xlsx|json|xml|pdf)
  sourceProfileId?, profileVersion?
  confidence, rawText?
}
```

Contrato = el schema golden del corpus (`expected-assignment.schema.json`), hoy solo test-side, promovido a contrato de producción.

### 3.4 Adapters por tipo (todos → NormalizedShiftRecord)

| Adapter | Estrategia |
|---|---|
| CsvIngestor | Delimitador auto (`,` `;` tab), encoding/locale, roster-headers → filas; grid → items posicionales |
| XlsxIngestor | Multi-sheet, header detection, merged cells factibles, date serials; sheet roster → filas, grid → items |
| JsonIngestor | Schema detection, array/object discovery, field mapping aprendible, date/time normalization |
| XmlIngestor | Node discovery + mapping, namespaces, parser con XXE deshabilitado (obligatorio) |
| PdfIngestor | Escalonado: perfil conocido → parser posicional → hipótesis alternativas → OCR → VLM solo justificado |

### 3.5 Adaptive Repair Loop (acotado)

```
attempt 1: parser estándar / perfil candidato
attempt 2: hipótesis alternativas de header/layout
attempt 3: detección alternativa locale/fecha/hora
attempt 4: OCR si PDF/imagen lo requiere
attempt 5: generar candidate profile desde evidencia
límites duros: maxAttempts, maxExecutionTimeMs, maxCostBudget (AI)
```

Umbrales configurables (no hardcodeados): `highThreshold → auto/preview`, `medium → revisión asistida`, `low → intervención`. Valores iniciales desde datos del corpus, ajustables por configuración.

### 3.6 Privacidad (separación tenant/global)

- Global: layout signature, header patterns, column mappings, date/time patterns, token aliases estructurales, parser config, confidence history, versión.
- NUNCA global: nombres/IDs de empleados, emails, turnos concretos, datos de empresa.
- Overrides de organización nunca contaminan el perfil global.
- IA/VLM: mínimo contenido necesario, logs sanitizados, tenant isolation, sin secretos.
- Observabilidad sin PII: sourceType, profileId, profileVersion, confidence, coverage, attemptCount, repairStrategy, validationErrors, processingTime, outcome.

### 3.7 UX

- Lista "Formatos aprendidos": `CSV · Sistema X — Verificado — Último uso: fecha`. Sin internals.
- Importación normal: subir → reconocido → preview → importar. Cero reconfiguración.
- Preguntas solo para ambigüedades concretas ("D" significa…, esta columna es…, 22:00–06:00 correcto?).
- Área solo se pregunta si no se infiere; la respuesta alimenta el binding.

## 4. Gap analysis → fases de implementación

Adaptadas a la realidad del repo (no asumir que todo está ausente):

- **Phase 1 — NormalizedShiftRecord + contrato de adapters.** REFACTOR `ParsedCalendarShift` → NormalizedShiftRecord (employeeRef first-class, segments, crossesMidnight, status); unificar rutas roster/posicional; REUSE validator existente. Error claro para formatos no oficiales (DOCX etc.) listando los 5 soportados. Corpus: promover golden schema a contrato.
- **Phase 2 — FormatProfile server-side + lifecycle.** Migración `0006_format_profiles.sql` (org-scoped, signature JSONB hash-only, aliases/config JSONB, status, use_count, versiones); sync del aprendizaje localStorage→server; estados candidate/validated/verified/legacy/deprecated con reglas de promoción por evidencia.
- **Phase 3 — Areas + bindings (opcionales, plan-gated).** Migración `0007_areas_bindings.sql`: `areas`, `area_profile_bindings` (M:N, org-scoped, `area_id NULL` = binding directo a org); inferencia de área por binding; pregunta solo si no deducible; feature flag en `PLANS` (team).
- **Phase 4 — CSV/XLSX structured learning.** REFACTOR XLSX (multi-sheet, headers, date serials; ruta roster cuando hay cabeceras); EXTEND memoria de mapeo de columnas; robustez delimitador/encoding. Corpus: variantes CSV/XLSX por área, perfil compartido entre áreas, cambio de software.
- **Phase 5 — JSON/XML ingestors.** Schema/node discovery + mapping aprendible; XML con XXE off. Corpus: JSON/XML conocidos, nuevos, corruptos.
- **Phase 6 — PDF repair loop acotado + drift→candidate.** Loop iterativo con maxAttempts/maxExecutionTime/maxCost; drift crea versión candidate; OCR confidence → QualitySignals. Corpus: drift de plantilla, escaneos degradados.
- **Phase 7 — Global Format Registry + org overrides.** Tablas globales estructura-only; fingerprint match cross-tenant; promoción global por evidencia multi-org; overrides org (aliases locales tipo `LN=Libre nocturno`) sin contaminar global.
- **Phase 8 — Revisión asistida + observabilidad.** UI de solo-ambigüedades consolidada; métricas persistidas sin PII por importación.

Regla AOS: ShiftImport es source of truth de sus profiles/bindings/ingestion-state; nada transversal se crea sin consultar fuentes canónicas AOS.

## 5. Decisiones pendientes de validación en implementación

- Valores concretos de umbrales (salir del corpus, configurables).
- Política de `resetOrganization` sobre areas/profiles/bindings (¿dato operativo o configuración? — decidir con evidencia cuando existan las tablas y actualizar su docstring).
- `employees.area_id` (pertenencia de empleado a área) — fase posterior, no necesario para bindings.
- Imágenes (PNG/JPG): hoy PARTIAL; bajo el nuevo contrato quedan fuera de los formatos oficiales — decidir si se mantienen como "no oficial/best-effort" o se retiran del accept.
