import { ensure, HttpError } from '../../errors.js';
import { segmentText } from '../segment.js';

// PDF.js is loaded lazily: it is a large module and only uploads of PDFs need it.
let getDocument;
async function loadPdfjs() {
  if (!getDocument) ({ getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs'));
  return getDocument;
}

/**
 * A PDF carries positioned text runs, not paragraphs. We rebuild lines by
 * grouping runs that share a baseline, then join lines into paragraphs on blank
 * vertical gaps. The result feeds the same segmenter as DOCX, so offsets,
 * evidence spans and patches behave identically downstream.
 */
function itemsToText(items) {
  const lines = [];
  let current = null;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    // transform[5] is the text run's baseline y-coordinate in PDF user space.
    const y = Math.round(item.transform[5]);
    if (!current || Math.abs(current.y - y) > 2) {
      current = { y, parts: [] };
      lines.push(current);
    }
    current.parts.push(item.str);
  }
  return lines
    .map(line => line.parts.join('').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export async function parsePdf(buffer) {
  ensure(buffer.subarray(0, 5).toString() === '%PDF-', 400, 'Invalid PDF file');
  const load = await loadPdfjs();
  let doc;
  try {
    doc = await load({
      data: new Uint8Array(buffer),
      // A demo ingests its own fixtures; disable network and font work entirely.
      disableFontFace: true,
      useSystemFonts: false,
      isEvalSupported: false,
    }).promise;
  } catch {
    throw new HttpError(400, 'Unable to parse this PDF document');
  }

  try {
    ensure(doc.numPages <= 100, 413, 'PDF exceeds 100 pages');
    const pages = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(itemsToText(content.items));
      page.cleanup();
    }
    const raw_text = pages.filter(Boolean).join('\n');
    ensure(raw_text.trim().length > 0, 400, 'No extractable text in this PDF; scanned images are not supported');
    ensure(raw_text.length <= 250000, 413, 'Extracted document exceeds 250,000 characters');
    const segments = segmentText(raw_text);
    ensure(segments.length > 0 && segments.length <= 500, 400, 'Document must contain 1–500 text paragraphs');
    return { raw_text, segments, warnings: [] };
  } finally {
    await doc.destroy();
  }
}
