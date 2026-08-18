/**
 * File-based PDF parsing API (browser): loads the document with PDF.js,
 * extracts positioned text items and delegates to the pure pipeline in
 * parse-items.ts. This is the only ingestion module that touches PDF.js.
 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { CalendarImportContext, ParsedCalendarShift, PdfDocumentType } from '../../lib/import-types';
import { EmployeeSelector } from '../core/row-detection';
import { PdfTextItem, RawPdfTextItem } from '../core/text-items';
import { detectCalendarContextFromItems, parseShiftsFromItems } from './parse-items';
import { detectPdfDocumentTypeFromItems } from './detect';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type { EmployeeSelector } from '../core/row-detection';

async function extractPdfTextItems(file: File): Promise<PdfTextItem[]> {
  const buffer = await file.arrayBuffer();
  const document = await getDocument({ data: buffer }).promise;
  const items: PdfTextItem[] = [];

  for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
    const page = await document.getPage(pageIndex);
    const content = await page.getTextContent();

    for (const rawItem of content.items as RawPdfTextItem[]) {
      const text = String(rawItem.str ?? '').trim();
      if (!text) {
        continue;
      }

      items.push({
        text,
        x: rawItem.transform?.[4] ?? 0,
        y: rawItem.transform?.[5] ?? 0,
        width: rawItem.width ?? 0,
        height: rawItem.height ?? 0,
        page: pageIndex,
      });
    }
  }

  return items;
}

/** Exported so the multi-format router reuses the same PDF extraction. */
export { extractPdfTextItems };

export async function detectPdfDocumentType(file: File): Promise<PdfDocumentType> {
  const items = await extractPdfTextItems(file);
  return detectPdfDocumentTypeFromItems(items);
}

export async function detectPdfCalendarContext(file: File): Promise<CalendarImportContext> {
  const items = await extractPdfTextItems(file);
  return detectCalendarContextFromItems(items);
}

export async function parseEmployeeShiftsFromPdf(
  file: File,
  context: CalendarImportContext,
  selector: EmployeeSelector,
): Promise<ParsedCalendarShift[]> {
  const allItems = await extractPdfTextItems(file);
  return parseShiftsFromItems(allItems, context, selector);
}
