Corpus de aceptación del fallback VLM (spec Parte 17)
=====================================================

Regeneración determinística: `node scripts/generate-vlm-fixtures.mjs`
(no editar los binarios a mano). Verificación en node:
`npx vitest run src/ingestion/vlm-acceptance-corpus`.

El provider VLM real NO se ejercita en node: se cubre en E2E/QA visual con
`VLM_PROVIDER=fake` (api/_lib/vlm/provider-fake.js) o con credenciales
reales (`VLM_PROVIDER=openai-compatible` + endpoint). En node se verifica la
parte determinista y la decisión del trigger (`src/ingestion/vlm-trigger.ts`).

Casos
-----

A. `A_legible.pdf` — PDF con capa de texto (jsPDF, layout TYPE_A: cabecera
   PERIODO SEPTIEMBRE 2026, columnas de día 01/09–05/09, filas de empleado;
   selección: Ana Martinez / 1001).
   Esperado: el parser determinista extrae los 5 turnos (estado CORRECT),
   VLM NO llamado (trigger: VLM_NOT_ELIGIBLE / reliable-result).
   Verificado en node (vlm-acceptance-corpus.test.ts, caso A).
   Nota: el layout lleva 2 filas de empleado porque con una sola fila la
   detección de cabeceras no separa la banda de días y degrada a REVIEW —
   mismo mecanismo sintético probado en vlm-fallback.test.ts.

B. `B_scanned_no_text.pdf` — PDF válido SIN capa de texto (solo rectángulos
   grises, como un escaneado embebido). jsPDF sin texto.
   Esperado: cero items → determinista insuficiente (UNRECOGNIZED, 0 turnos)
   → trigger VLM_ELIGIBLE / empty-items con sesión autenticada; invitados
   nunca (VLM_NOT_ELIGIBLE / unauthenticated). La llamada VLM real y el
   mapeo de records → REVIEW están cubiertos con provider mockeado en
   src/ingestion/vlm-fallback.test.ts.
   Verificado en node (decisión del trigger); la respuesta del provider es E2E.

C. `C_rotated.jpg` — imagen rotada/skewed. Copia de
   src/ingestion/fixtures/acceptance-corpus/fixtures/GS-08_dense-image/skewed.jpg
   (no hay rasterizer en node sin dependencias nuevas; origen documentado).
   Esperado: clasifica como image; el determinista no extrae items sin OCR →
   VLM llamado. OCR (Tesseract spa) y VLM real: NOT_RUN en node
   (convención OCR_NOT_RUN_NODE de acceptance-corpus.test.ts) → E2E.

D. `D_low_contrast.jpg` — imagen fotografiada de bajo contraste. Copia de
   GS-08_dense-image/low-contrast.jpg (mismo origen y razón que C).
   Esperado: igual que C — fallback VLM. NOT_RUN en node → E2E.

E. `E_illegible.png` — PNG de ruido puro 96x96, generado a mano (zlib + CRC32
   manual, PRNG con semilla fija → byte-determinista). Ilegible para
   cualquier OCR/VLM.
   Esperado: el fallback falla (VLM_* no bloqueante) o devuelve records
   inservibles; NUNCA se inventan turnos — el resultado determinista (vacío,
   UNRECOGNIZED) se preserva. Contrato verificado con provider fake en
   vlm-fallback.test.ts (VLM_TIMEOUT / VLM_RATE_LIMITED); con provider real
   es E2E/QA visual. En node solo se verifica que el fichero es un PNG
   válido clasificado como image (OCR_NOT_RUN_NODE).

F. Empleado ambiguo — caso de COMPORTAMIENTO del matcher sobre salida VLM,
   sin fixture propio: cualquier PDF degradado (B/C/D) cuyo texto extraído
   por el VLM no resuelve un empleado único.
   Esperado: VLM extrae texto, pero `employeeName: null` o ambiguo →
   employeeMatch none → estado UNRECOGNIZED, las filas se muestran para
   revisión, la ambigüedad NO se resuelve silenciosamente.
   Cubierto por vlm-fallback.test.ts ("a null employeeName preserves the
   ambiguity"); con provider real → E2E.

G. Área desconocida — caso de COMPORTAMIENTO sobre salida VLM
   (`records.areaName` sin correspondencia en el directorio de la org).
   Esperado: NO auto-crear área ni empleado; el área queda sin asignar y el
   usuario decide en la preview. El cliente VLM solo transporta `areaName`
   (vlm-client.ts, VlmRecords); la resolución contra el directorio vive en el
   flujo de importación autenticado → E2E con sesión y org real.

Umbrales de aceptación (heredados del manifiesto M0): cero asignaciones al
empleado equivocado, cero corrupción silenciosa; salida VLM siempre con techo
REVIEW (nunca CORRECT) — vlm-fallback.test.ts lo fuerza.
