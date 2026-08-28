# VLM Fallback — ingesta de PDF/imagen degradados

Fallback controlado a un modelo visual (VLM) cuando el pipeline determinista de PDF/imagen no alcanza fiabilidad suficiente. El VLM **no** es parser principal: solo extrae estructura y su salida reentra al pipeline normal (validación → employee matching → áreas → diagnostics → preview → reconciliation → persistencia). Nunca escribe en DB, nunca crea Employees ni Areas, nunca se salta el preview.

## Cuándo se activa

`classifyVlmTrigger` (`src/ingestion/vlm-trigger.ts`), evaluado dentro de `analyzeDocumentFile` (`src/ingestion/parsers/file.ts`) tras el análisis determinista:

- `VLM_ELIGIBLE`: documento sin items extraíbles (PDF escaneado / OCR vacío), o resultado `UNRECOGNIZED` con 0 turnos.
- `VLM_NOT_ELIGIBLE`: formatos estructurados (CSV/XLSX/JSON/XML), resultados CORRECT/REVIEW con registros, o ausencia de sesión (el endpoint exige auth).
- PDF/imagen buenos **nunca** llaman al VLM.

La salida VLM tiene techo REVIEW: siempre requiere revisión humana en preview (badge "Análisis visual", `sourceFormat` `pdf+vlm`/`image+vlm`).

## Provider seam

`api/_lib/vlm/`:

- `provider.js` — interfaz `analyze({pages, hint, timeoutMs, signal}) → {records, usage}` + factory `createVlmProvider(env)` y `VlmError` con códigos `VLM_UNAVAILABLE | VLM_TIMEOUT | VLM_RATE_LIMITED | VLM_INVALID_RESPONSE | VLM_PROVIDER_ERROR`.
- `provider-openai-compatible.js` — única implementación real: endpoint OpenAI-compatible (`/v1/chat/completions`, multi-imagen `image_url`, `response_format: json_object` + validación estricta server-side vía `schema.js`). Patrón heredado del legacy `proxy-server.mjs`. Sin SDK: `fetch` directo.
- `provider-fake.js` — fake determinista para tests/QA (`VLM_PROVIDER=fake`, comportamientos vía `VLM_FAKE_BEHAVIOR` o header dev-only `x-vlm-fake-behavior`).
- `schema.js` / `prompt.js` — contrato de extracción estricto (null si no visible, prohibido inventar) y validador sin dependencias.

Para añadir otro proveedor: nuevo `provider-xxx.js` que cumpla la interfaz y un case en la factory. Nada más toca al provider.

## Endpoint

`POST /api/ingestion/vlm` — sesión obligatoria, org-scope desde el contexto de sesión (nunca del cliente), rate limit 10 req/60 min por org (tabla `login_attempts`, key `vlm:org:<id>`), máx 3 páginas y 4 MB decodificados por página, timeout 30 s, `maxDuration` 60 en `vercel.json`.

- Request: `{ pages: [{ imageBase64, mimeType }], context?: { month?, year? } }` (mime: png/jpeg/webp).
- 200: `{ records, usage, provider: 'vlm', engine: 'vlm-fallback' }`.
- Errores: `{ error, code }` con los códigos VLM_* (400/401/429/502/503/504).

## Env vars

Sin prefijo `VITE_`: nunca llegan al bundle cliente. Ver `.env.example`.

`VLM_PROVIDER` (`openai-compatible` | `fake`), `VLM_API_KEY`, `VLM_API_URL` (URL completa), `VLM_MODEL`, `VLM_TIMEOUT_MS` (30000), `VLM_MAX_FILE_MB` (4), `VLM_MAX_PAGES` (3). `VLM_FAKE_BEHAVIOR`/`VLM_FAKE_DELAY_MS` solo dev/test.

## Privacidad

Processing efímero: el servidor no persiste el documento, el base64 ni la respuesta cruda del proveedor. Logs estructurados sin PII: `{ event: 'vlm_fallback', requestId, orgId, mimePages, bytes, durationMs, status, records, usage }`. Los documentos de turnos contienen datos laborales: no se usan para FormatProfiles globales ni para training.

## Límites de coste

Solo fallback (nunca si el determinista es fiable), 1 llamada por análisis (multi-página en un único request), 0 retries automáticos, dedup in-flight por fingerprint de fichero en cliente, abort en cancel/unmount, rate limit por org, timeout y cap de tamaño/páginas. Token usage capturado en log server-side si el proveedor lo devuelve.

## PDF multipágina

Estrategia B acotada: el cliente rasteriza hasta `VLM_MAX_PAGES` (3) páginas con pdf.js (ya en el bundle) a PNG y las envía en una sola request; el proveedor recibe una única llamada multi-imagen. Duplicados entre páginas los resuelve la dedup semántica existente (`fingerprintShift` / `classifyImportChanges`).

## Fallos controlados

Si el VLM falla, se conserva el diagnóstico determinista y se añade un diagnóstico no bloqueante `diagnosis.vlm.<code>` (i18n es/en): `VLM_UNAVAILABLE`, `VLM_TIMEOUT`, `VLM_RATE_LIMITED`, `VLM_INVALID_RESPONSE`, `VLM_PROVIDER_ERROR`, `VLM_FILE_TOO_LARGE`. Retry = botón "Procesar"; el archivo seleccionado se conserva. Sin pantalla blanca ni persistencia parcial.

## Tests y QA

- Unitarios: `api/_lib/vlm/vlm.test.js`, `api/ingestion/vlm.test.js` (auth, tenant isolation, mime/size/payload, 429/500/timeout, respuesta inválida, rate limit), `src/ingestion/vlm-trigger.test.ts`, `vlm-client.test.ts`, `vlm-fallback.test.ts`.
- Corpus de aceptación: `test-data/scenarios/anclora-group-shift-ingestion/vlm/` (casos A–G, regenerable con `node scripts/generate-vlm-fixtures.mjs`) + `src/ingestion/vlm-acceptance-corpus.test.ts`.
- QA visual: `scripts/capture-vlm-fallback-qa.mjs` contra `vercel dev` con `VLM_PROVIDER=fake`; screenshots en `qa/vlm-fallback/`.

## Pendiente

Validación contra proveedor real: no ejecutada por ausencia de credenciales (`REAL_PROVIDER_VALIDATION=NOT_RUN_NO_CREDENTIALS`). Basta configurar `VLM_API_KEY`/`VLM_API_URL`/`VLM_MODEL` y repetir el caso B.
