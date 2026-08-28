/**
 * Regenera los fixtures del corpus de aceptación del fallback VLM (Parte 17).
 *
 * Uso: node scripts/generate-vlm-fixtures.mjs
 * Salida: test-data/scenarios/anclora-group-shift-ingestion/vlm/
 *
 * Fixtures generados (ver README.md del corpus para el contrato de cada caso):
 * - A_legible.pdf        PDF con capa de texto (jsPDF, layout TYPE_A probado
 *                        por vlm-fallback.test.ts) — el determinista gana.
 * - B_scanned_no_text.pdf PDF válido SIN capa de texto (solo un rectángulo
 *                        gris, simulando un escaneado) — cero items → VLM.
 * - C_rotated.jpg        copia de GS-08_dense-image/skewed.jpg (imagen real
 *                        sintética rotada; no hay rasterizer en node sin deps).
 * - D_low_contrast.jpg   copia de GS-08_dense-image/low-contrast.jpg.
 * - E_illegible.png      PNG de ruido generado a mano (zlib + CRC32 manual,
 *                        PRNG con semilla fija) — byte-determinista.
 *
 * Determinismo: los PNG son byte-deterministas. Los PDFs de jsPDF incrustan
 * un CreationDate y un /ID aleatorio; el script los normaliza a valores fijos
 * (mismo número de bytes) para que regenerar no ensucie el árbol de git.
 */
import { deflateSync } from 'node:zlib';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsPDF } from 'jspdf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-data', 'scenarios', 'anclora-group-shift-ingestion', 'vlm');
const gs08Dir = path.join(root, 'src', 'ingestion', 'fixtures', 'acceptance-corpus', 'fixtures', 'GS-08_dense-image');

mkdirSync(outDir, { recursive: true });

/**
 * jsPDF estampa /CreationDate con la hora actual y un /ID aleatorio en el
 * trailer: ambos se normalizan a valores fijos (mismo número de bytes).
 */
function pdfBytesDeterministic(doc) {
  const raw = Buffer.from(doc.output('arraybuffer'));
  const text = raw.toString('latin1');
  const fixed = text
    .replace(/D:\d{14}/g, 'D:20260901000000')
    .replace(/<[0-9A-F]{32}> <[0-9A-F]{32}>/, `<${'0'.repeat(32)}> <${'0'.repeat(32)}>`);
  return Buffer.from(fixed, 'latin1');
}

/**
 * Caso A: cuadrante TYPE_A, septiembre 2026, con capa de texto. Mismo layout
 * que el PDF sintético de vlm-fallback.test.ts (probado CORRECT por el
 * pipeline determinista). Lleva DOS filas de empleado: con una sola fila la
 * detección de cabeceras de día no separa la banda de cabecera y los tokens
 * "01/09"… se reportan como UNKNOWN_SHIFT_TOKEN (REVIEW). La selección del
 * corpus es Ana Martinez (1001); Carlos Ruiz (1002) actúa como fila de
 * contexto sin celdas.
 */
function buildLegiblePdf() {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(10);
  doc.text('PERIODO: SEPTIEMBRE 2026', 500, 60);
  doc.text('01/09', 120, 110);
  doc.text('02/09', 260, 110);
  doc.text('03/09', 400, 110);
  doc.text('04/09', 540, 110);
  doc.text('05/09', 680, 110);
  doc.text('Carlos Ruiz', 20, 210);
  doc.text('(1002)', 20, 215);
  doc.text('Ana Martinez', 20, 310);
  doc.text('(1001)', 20, 315);
  doc.text('17:00-01:00', 120, 310);
  doc.text('OFF', 260, 310);
  doc.text('OFF', 400, 310);
  doc.text('OFF', 540, 310);
  doc.text('08:00-16:00', 680, 310);
  return pdfBytesDeterministic(doc);
}

/**
 * Caso B: PDF válido sin capa de texto — una mancha gris (el "escaneado")
 * y nada de texto, como haría un escáner que embebe una imagen.
 */
function buildScannedPdf() {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFillColor(210, 210, 210);
  doc.rect(40, 40, 760, 480, 'F');
  doc.setFillColor(160, 160, 160);
  doc.rect(80, 80, 680, 400, 'F');
  return pdfBytesDeterministic(doc);
}

/* --- PNG mínimo a mano (sin dependencias de rasterizado) ---------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** PRNG determinista (LCG) con semilla fija. */
function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 8; // 24 bits útiles
  };
}

/**
 * Caso E: PNG grayscale 96x96 de ruido puro — ilegible para cualquier OCR/VLM.
 * Byte-determinista (semilla fija).
 */
function buildNoisePng() {
  const width = 96;
  const height = 96;
  const next = lcg(0x5eed17);
  const scanlines = Buffer.alloc(height * (1 + width));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width);
    scanlines[rowStart] = 0; // filtro None
    for (let x = 0; x < width; x += 1) {
      scanlines[rowStart + 1 + x] = next() & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: grayscale
  // compression 0, filter 0, interlace 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --- Generación ---------------------------------------------------------- */

const written = [];
function emit(name, bytes) {
  writeFileSync(path.join(outDir, name), bytes);
  written.push(`${name} (${bytes.length} bytes)`);
}

emit('A_legible.pdf', buildLegiblePdf());
emit('B_scanned_no_text.pdf', buildScannedPdf());
emit('E_illegible.png', buildNoisePng());

for (const [source, target] of [
  ['skewed.jpg', 'C_rotated.jpg'],
  ['low-contrast.jpg', 'D_low_contrast.jpg'],
]) {
  copyFileSync(path.join(gs08Dir, source), path.join(outDir, target));
  written.push(`${target} (copia de GS-08_dense-image/${source})`);
}

console.log(`Fixtures VLM regenerados en ${path.relative(root, outDir)}/:`);
for (const line of written) {
  console.log(`  - ${line}`);
}
