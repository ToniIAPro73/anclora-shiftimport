/**
 * Rasterization for the VLM fallback: turns a PDF page or an image into a
 * PNG base64 payload the server endpoint accepts. Browser-only (canvas /
 * pdf.js rendering) — unit tests mock this module.
 *
 * Same pdf.js worker setup as parsers/pdf.ts. Pages are downscaled to a
 * maximum width so the payload stays within the endpoint's per-page budget.
 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface VlmPageImage {
  imageBase64: string;
  mimeType: 'image/png';
}

const MAX_PAGES = 3;
const MAX_WIDTH_PX = 1600;

const dataUrlToPage = (dataUrl: string): VlmPageImage => ({
  imageBase64: dataUrl.slice(dataUrl.indexOf(',') + 1),
  mimeType: 'image/png',
});

const makeCanvas = (width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context unavailable');
  }
  return { canvas, context };
};

async function rasterizePdf(file: File): Promise<VlmPageImage[]> {
  const buffer = await file.arrayBuffer();
  const pdfDocument = await getDocument({ data: buffer }).promise;
  const pages: VlmPageImage[] = [];
  try {
    const pageCount = Math.min(pdfDocument.numPages, MAX_PAGES);
    for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
      const page = await pdfDocument.getPage(pageIndex);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(2, MAX_WIDTH_PX / baseViewport.width);
      const viewport = page.getViewport({ scale });
      const { canvas, context } = makeCanvas(viewport.width, viewport.height);
      await page.render({ canvasContext: context, viewport }).promise;
      pages.push(dataUrlToPage(canvas.toDataURL('image/png')));
    }
  } finally {
    void pdfDocument.destroy();
  }
  return pages;
}

async function rasterizeImage(file: File): Promise<VlmPageImage[]> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_WIDTH_PX / bitmap.width);
    const { canvas, context } = makeCanvas(bitmap.width * scale, bitmap.height * scale);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return [dataUrlToPage(canvas.toDataURL('image/png'))];
  } finally {
    bitmap.close();
  }
}

/**
 * Rasterizes the document for visual analysis: up to 3 pages for PDFs,
 * a single downscaled frame for images. Output is always PNG.
 */
export async function rasterizeFileForVlm(file: File): Promise<VlmPageImage[]> {
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type.toLowerCase().includes('pdf');
  return isPdf ? rasterizePdf(file) : rasterizeImage(file);
}
