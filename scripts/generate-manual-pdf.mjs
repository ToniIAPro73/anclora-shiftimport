/**
 * Genera el PDF del manual de usuario de Anclora ShiftImport (español).
 *
 * Uso: node scripts/generate-manual-pdf.mjs
 * Salida: public/manuals/anclora-shiftimport-manual-usuario-es.pdf
 *
 * Requiere: Chromium de Playwright (ya instalado en
 * qa/e2e-acceptance/node_modules) + poppler (pdfinfo, pdftotext) para
 * calcular la numeración de páginas del índice.
 *
 * Renderiza en dos pasadas: la primera para averiguar en qué página
 * empieza cada sección (vía pdftotext), la segunda ya con el índice
 * completo y la numeración de página estampada en cada página (footer
 * de Playwright).
 */
import { chromium } from '../qa/e2e-acceptance/node_modules/playwright-core/index.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const manualDir = path.join(root, 'docs', 'manual');
const manualsOutDir = path.join(root, 'public', 'manuals');
const inputPath = path.join(manualDir, 'manual-usuario.md');
const outputPath = path.join(manualsOutDir, 'anclora-shiftimport-manual-usuario-es.pdf');
const tmpDir = path.join(root, 'tmp', 'manual-pdf');
const passPdfPath = path.join(tmpDir, 'manual-es-pass.pdf');

// Playwright's page.setContent() loads the page with an opaque/about:blank
// origin, which cannot reliably fetch local file:// assets even with a
// <base> tag pointing at the manual directory — embedding every image as a
// base64 data URI sidesteps that entirely (and makes the intermediate HTML
// self-contained).
const IMAGE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
function dataUriForImage(relPath) {
  const absPath = path.join(manualDir, relPath);
  const ext = path.extname(absPath).toLowerCase();
  const mime = IMAGE_MIME[ext] ?? 'image/png';
  const bytes = readFileSync(absPath);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

if (!existsSync(inputPath)) {
  throw new Error(`Archivo de entrada no encontrado: ${inputPath}`);
}

mkdirSync(tmpDir, { recursive: true });
mkdirSync(manualsOutDir, { recursive: true });

const source = readFileSync(inputPath, 'utf8');
const manual = extractSections(source);

const browser = await chromium.launch({ headless: true });

await renderPdf({});
const sectionPages = extractSectionPages();
await renderPdf(sectionPages);

await browser.close();
console.log(`Manual generado: ${path.relative(root, outputPath)}`);

// ─── Extracción de secciones ────────────────────────────────────────────────
function extractSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const coverEnd = lines.findIndex((line) => line.trim() === '<div class="page-break"></div>');
  if (coverEnd === -1) throw new Error('No se encontró el salto de página tras la portada.');

  const cover = lines.slice(0, coverEnd).join('\n')
    .replace('src="screenshots/logo.png"', `src="${dataUriForImage('screenshots/logo.png')}"`);
  const afterCover = lines.slice(coverEnd + 1);
  const tocIndex = afterCover.findIndex((line) => line.trim() === '## Índice');
  if (tocIndex === -1) throw new Error('No se encontró el encabezado "## Índice".');

  const afterToc = afterCover.slice(tocIndex + 1);
  const contentStart = afterToc.findIndex((line) => line.trim() === '<div class="page-break"></div>');
  if (contentStart === -1) throw new Error('No se encontró el salto de página tras el índice.');

  const contentLines = afterToc.slice(contentStart + 1);
  const sections = [];
  let current = null;

  for (const line of contentLines) {
    const match = line.match(/^##\s+(\d+)\.\s+(.+)$/);
    if (match) {
      if (current) sections.push(current);
      current = { number: match[1], title: match[2].trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) sections.push(current);

  return { cover, sections };
}

// ─── Renderizado del PDF ────────────────────────────────────────────────────
async function renderPdf(sectionPages) {
  const page = await browser.newPage();
  await page.setContent(buildHtml(sectionPages), { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });

  const isFinalPass = Object.keys(sectionPages).length > 0;
  const outFile = isFinalPass ? outputPath : passPdfPath;

  await page.pdf({
    path: outFile,
    format: 'A4',
    printBackground: true,
    margin: { top: '24mm', bottom: '20mm', left: '18mm', right: '18mm' },
    displayHeaderFooter: isFinalPass,
    headerTemplate: '<span></span>',
    footerTemplate: isFinalPass ? footerTemplate() : '<span></span>',
  });
  await page.close();
}

function footerTemplate() {
  // Chromium injects the real page number as text into .pageNumber once the
  // template is laid out; a footer template can carry its own inline script,
  // which runs once per page — used here only to hide the footer on the
  // cover page (page 1), since Playwright's footerTemplate has no built-in
  // "skip first page" option.
  return `
<div id="manualFooter" style="width:100%; font-size:7.5pt; font-family: Inter, sans-serif; color:#182a4a; display:flex; justify-content:space-between; padding:0 18mm; opacity: 0.82;">
  <span style="font-weight:700;">Anclora ShiftImport</span>
  <span class="pageNumber"></span>
</div>
<script>
  (function () {
    var el = document.querySelector('.pageNumber');
    if (el && el.textContent.trim() === '1') {
      document.getElementById('manualFooter').style.visibility = 'hidden';
    }
  })();
</script>`;
}

// ─── Numeración de páginas del índice (dos pasadas) ─────────────────────────
function extractSectionPages() {
  const info = execFileSync('pdfinfo', [passPdfPath], { encoding: 'utf8' });
  const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
  const map = {};

  for (let p = 1; p <= pages; p += 1) {
    const pageText = execFileSync('pdftotext', ['-f', String(p), '-l', String(p), passPdfPath, '-'], { encoding: 'utf8' })
      .replace(/\s+/g, ' ');
    for (const section of manual.sections) {
      const marker = `${section.number}. ${section.title}`;
      if (!map[section.number] && pageText.includes(marker)) {
        map[section.number] = p;
      }
    }
  }
  return map;
}

// ─── Construcción del HTML ──────────────────────────────────────────────────
function buildHtml(sectionPages) {
  const toc = manual.sections.map((section) => {
    const page = sectionPages[section.number] ?? '';
    return `<a class="toc-row" href="#section-${section.number}">
      <span class="toc-num">${section.number.padStart(2, '0')}</span>
      <span class="toc-title">${escapeHtml(section.title)}</span>
      <span class="toc-rule"></span>
      <span class="toc-pageno">${page}</span>
    </a>`;
  }).join('\n');

  const body = manual.sections.map((section) => `
    <section id="section-${section.number}" class="manual-section">
      <h2>${section.number}. ${escapeHtml(section.title)}</h2>
      ${markdownToHtml(section.lines.join('\n'))}
    </section>
  `).join('\n');

  const cover = injectCoverVisual(manual.cover);

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<base href="file://${manualDir}/" />
<title>Anclora ShiftImport - Manual de Usuario</title>
<style>${styles()}</style>
</head>
<body>
${cover}
<section class="toc-page">
  <p class="kicker">Manual de Usuario</p>
  <h1>Índice</h1>
  <p class="toc-intro">Una guía ordenada para recorrer ShiftImport desde la primera importación hasta la gestión completa de una organización.</p>
  <nav class="toc-list">${toc}</nav>
</section>
${body}
</body>
</html>`;
}

// ─── Textura decorativa de portada (cuadrante de turnos, fondo) ────────────
function injectCoverVisual(coverHtml) {
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const codes = ['08:00', 'M', '16:00', 'T', 'L', '23:00', 'N', '—', '07:00', 'L', '15:00', 'M'];
  const headerRow = `<div class="sheet-row sheet-head">${days.map((d) => `<span>${d}</span>`).join('')}</div>`;
  const bodyRows = Array.from({ length: 9 }, (_, r) =>
    `<div class="sheet-row">${days.map((_, c) => `<span>${codes[(r * 7 + c) % codes.length]}</span>`).join('')}</div>`).join('');

  const sheet = `
<div class="cover-sheet-bg" aria-hidden="true">
  <div class="sheet-card">
    ${headerRow}
    ${bodyRows}
  </div>
</div>`;

  return coverHtml.replace('<div class="cover-disclaimer">', `${sheet}\n<div class="cover-disclaimer">`);
}

// ─── Conversor Markdown → HTML (mínimo, propio del manual) ─────────────────
function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  let html = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed === '---' || trimmed === '<div class="page-break"></div>') {
      i += 1;
      continue;
    }

    if (trimmed.startsWith('<div class="footer-brand">')) {
      while (i < lines.length) {
        if (lines[i].trim() === '</div>') break;
        i += 1;
      }
      i += 1;
      continue;
    }

    const image = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (image) {
      const src = dataUriForImage(image[2]);
      const alt = image[1];
      html += `<figure><img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" /><figcaption>${escapeHtml(alt)}</figcaption></figure>`;
      i += 1;
      continue;
    }

    if (/^###\s+/.test(trimmed)) {
      html += `<h3>${inline(trimmed.replace(/^###\s+/, ''))}</h3>`;
      i += 1;
      continue;
    }

    if (/^>\s+/.test(trimmed)) {
      const quote = [];
      while (i < lines.length && /^>\s+/.test(lines[i].trim())) {
        quote.push(lines[i].trim().replace(/^>\s+/, ''));
        i += 1;
      }
      html += `<blockquote>${quote.map(inline).join('<br>')}</blockquote>`;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^[-*]\s+/, ''))}</li>`);
        i += 1;
      }
      html += `<ul>${items.join('')}</ul>`;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^\d+\.\s+/, ''))}</li>`);
        i += 1;
      }
      html += `<ol>${items.join('')}</ol>`;
      continue;
    }

    if (trimmed.startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      html += tableToHtml(tableLines);
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i].trim())) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    html += `<p>${inline(paragraph.join(' '))}</p>`;
  }

  return html;
}

function isBlockStart(line) {
  return /^###\s+/.test(line)
    || /^!\[/.test(line)
    || /^[-*]\s+/.test(line)
    || /^\d+\.\s+/.test(line)
    || /^>\s+/.test(line)
    || line.startsWith('|')
    || line === '---'
    || line === '<div class="page-break"></div>'
    || line.startsWith('<div class="footer-brand">');
}

function tableToHtml(lines) {
  const rows = lines
    .filter((line) => !/^\|\s*-+/.test(line))
    .map((line) => line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  if (rows.length === 0) return '';
  const [head, ...body] = rows;
  return `<table><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function inline(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

// ─── Estilos (paleta real de Anclora ShiftImport) ───────────────────────────
function styles() {
  return `
/* El margen de página real lo controla la opción "margin" de
   page.pdf() (24mm/18mm/20mm/18mm), no una regla @page — evita el
   conflicto entre ambos mecanismos en Chromium. */
* { box-sizing: border-box; }
body {
  margin: 0;
  color: #0f1a2e;
  background: #fff;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 10.3pt;
  line-height: 1.48;
}
a { color: inherit; text-decoration: none; }

/* ─── PORTADA ─────────────────────────────────────────────────────────────── */
.cover-page {
  width: 100%;
  min-height: 253mm;
  margin: 0;
  padding: 22mm 22mm 20mm;
  color: #f4f2e8;
  background:
    radial-gradient(ellipse 92% 58% at 50% 38%, rgba(25, 35, 80, 0.62) 0%, transparent 70%),
    linear-gradient(135deg, #18224d 0%, #101733 55%, #0b1126 100%);
  page-break-after: always;
  position: relative;
  overflow: hidden;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.cover-page::before {
  content: "";
  position: absolute;
  inset: 8mm 8mm;
  border: 1px solid rgba(212, 175, 55, 0.55);
  border-radius: 1.5mm;
  pointer-events: none;
  z-index: 2;
}
.cover-page::after {
  content: "";
  position: absolute;
  right: -20mm;
  bottom: -26mm;
  width: 110mm;
  height: 110mm;
  border: 1px solid rgba(106, 173, 73, 0.22);
  border-radius: 50%;
  z-index: 0;
}
.cover-logo, .cover-brand, .cover-title, .cover-subtitle, .cover-meta, .cover-disclaimer {
  position: relative;
  z-index: 3;
}
.cover-logo { display: flex; justify-content: center; }
.cover-logo img {
  width: 34mm;
  height: auto;
  margin-bottom: 10mm;
  filter: drop-shadow(0 4mm 12mm rgba(212, 175, 55, 0.30)) drop-shadow(0 6mm 14mm rgba(0, 0, 0, 0.5));
}
.cover-brand {
  color: #d4af37;
  font-size: 12pt;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.cover-brand::after {
  content: "";
  display: block;
  width: 40mm;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.7), transparent);
  margin: 4.5mm auto 0;
}
.cover-title {
  margin: 4mm auto 0;
  max-width: 150mm;
  font-family: Fraunces, Georgia, "Times New Roman", serif;
  font-size: 42pt;
  line-height: 1.0;
  font-weight: 600;
  color: #f8f6ee;
  text-shadow: none;
}
.cover-subtitle {
  margin: 7mm auto 0;
  max-width: 128mm;
  color: rgba(228, 236, 226, 0.86);
  font-size: 14.5pt;
  line-height: 1.32;
}
.cover-meta { display: flex; justify-content: center; gap: 7mm; margin-top: 13mm; color: #0f1a2e; font-size: 9.5pt; font-weight: 700; background: transparent; }
.cover-meta div {
  min-width: 40mm;
  padding: 3mm 6mm;
  background: #e0c472;
  border-radius: 999px;
  box-shadow: none;
  filter: none;
  opacity: 1;
  letter-spacing: 0.03em;
}
.cover-disclaimer {
  position: absolute;
  left: 16mm; right: 16mm; bottom: 16mm;
  color: rgba(200, 210, 220, 0.72);
  font-size: 8pt;
  text-align: center;
  line-height: 1.4;
  z-index: 3;
}

/* Fondo decorativo: cuadrante de turnos en muy baja opacidad, nunca sobre
   el bloque central de texto (queda cubierto por el degradado radial de
   .cover-page y por debajo del marco dorado). */
.cover-sheet-bg {
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: 0.16;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 6mm;
  pointer-events: none;
}
.sheet-card {
  width: 168mm;
  border: 1px solid rgba(212, 175, 55, 0.5);
  border-radius: 1.5mm;
  overflow: hidden;
  transform: perspective(900px) rotateX(2deg);
}
.sheet-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.sheet-row span {
  padding: 2.6mm 0;
  border: 0.5px solid rgba(244, 242, 232, 0.28);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 6.5pt;
  color: rgba(244, 242, 232, 0.85);
  text-align: center;
}
.sheet-row.sheet-head span {
  background: rgba(212, 175, 55, 0.22);
  font-weight: 700;
  letter-spacing: 0.06em;
}

/* ─── ÍNDICE ──────────────────────────────────────────────────────────────── */
.toc-page { page-break-after: always; }
.kicker { color: #9a7a31; font-size: 8pt; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
.toc-page h1 { margin: 0 0 3mm; color: #0f1a2e; font-family: Fraunces, Georgia, serif; font-size: 28pt; font-weight: 600; }
.toc-intro { width: 126mm; margin-bottom: 7mm; color: #48586b; font-size: 10.3pt; }
.toc-list { border-top: 1px solid #c7a451; }
.toc-row {
  display: grid;
  grid-template-columns: 13mm auto 1fr 12mm;
  align-items: baseline;
  gap: 3mm;
  min-height: 5mm;
  padding: 1.8mm 0;
  border-bottom: 1px solid #e4ddd1;
  color: #0f1a2e;
}
.toc-num { color: #9a7a31; font-size: 8pt; font-weight: 800; letter-spacing: 0.1em; }
.toc-title { font-family: Fraunces, Georgia, serif; font-size: 11pt; }
.toc-rule { border-bottom: 1px dotted #b8c0c5; transform: translateY(-1.5mm); }
.toc-pageno { color: #0f1a2e; font-weight: 800; text-align: right; }

/* ─── SECCIONES ───────────────────────────────────────────────────────────── */
.manual-section { page-break-before: always; }
.manual-section h2 {
  margin: 0 0 8mm;
  padding: 0 0 4mm;
  color: #0f1a2e;
  border-bottom: 1px solid #c7a451;
  font-family: Fraunces, Georgia, serif;
  font-size: 23pt;
  line-height: 1.1;
  font-weight: 600;
}
h3 { margin: 7mm 0 3mm; color: #192350; font-size: 13pt; line-height: 1.2; }
p { margin: 0 0 3.6mm; }
strong { color: #0f1a2e; font-weight: 800; }
ul, ol { margin: 1mm 0 4mm 6mm; padding-left: 4mm; }
li { margin: 1.4mm 0; }
table { width: 100%; margin: 4mm 0 6mm; border-collapse: collapse; page-break-inside: avoid; font-size: 8.8pt; }
th { color: #0f1a2e; background: #f3ead8; border-top: 1px solid #c7a451; border-bottom: 1px solid #c7a451; font-weight: 800; }
td, th { padding: 2.5mm 3mm; border-bottom: 1px solid #dfe5e8; vertical-align: top; }
td:first-child, th:first-child { border-left: 1px solid #e7ecef; }
td:last-child, th:last-child { border-right: 1px solid #e7ecef; }
blockquote {
  margin: 5mm 0; padding: 4mm 5mm; color: #21324a;
  background: #f5f6fb; border-left: 2mm solid #6AAD49; page-break-inside: avoid;
}

/* ─── IMÁGENES ────────────────────────────────────────────────────────────── */
figure { margin: 5mm 0 7mm; page-break-inside: avoid; }
figure img {
  display: block; width: 100%; height: auto; border-radius: 2mm;
  border: 1.5px solid #182a4a;
  box-shadow: 0 4mm 16mm rgba(6, 12, 30, 0.32), 0 1mm 4mm rgba(6, 12, 30, 0.2);
}
figcaption { margin-top: 1.8mm; padding: 0 1mm; color: #5a6a7c; font-size: 8pt; line-height: 1.35; }

/* ─── PIE (footer estampado por Playwright) ─────────────────────────────── */
.footer-brand {
  margin-top: 14mm; padding-top: 5mm; border-top: 1px solid #c7a451;
  color: #51646f; text-align: center;
}
`;
}
