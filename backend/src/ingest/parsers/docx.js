import mammoth from 'mammoth';
import { ensure, HttpError } from '../../errors.js';
import { segmentText } from '../segment.js';

export async function parseDocx(buffer) {
  ensure(buffer.subarray(0, 2).toString() === 'PK', 400, 'Invalid DOCX archive');
  let result;
  try { result = await mammoth.extractRawText({ buffer }); }
  catch { throw new HttpError(400, 'Unable to parse this DOCX document'); }
  ensure(result.value.length <= 250000, 413, 'Extracted document exceeds 250,000 characters');
  const segments = segmentText(result.value);
  ensure(segments.length > 0 && segments.length <= 500, 400, 'Document must contain 1–500 text paragraphs');
  return { raw_text: result.value, segments, warnings: result.messages.map(m => m.message) };
}
