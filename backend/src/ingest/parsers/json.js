import { ensure, HttpError } from '../../errors.js';

// Canonical pretty JSON remains valid JSON, with authoritative offsets for every scalar.
export function parseJson(buffer) {
  let value;
  try { value = JSON.parse(buffer.toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid JSON file'); }
  ensure(value !== null && typeof value === 'object', 400, 'JSON root must be an object or array');
  let raw_text = '';
  const segments = [];
  const append = text => { raw_text += text; };
  function write(node, locator, depth, start = raw_text.length) {
    ensure(depth <= 30, 400, 'JSON nesting exceeds 30 levels');
    if (node === null || typeof node !== 'object') {
      const value_start = raw_text.length;
      const literal = JSON.stringify(node);
      ensure(literal !== 'null' || node === null, 400, 'JSON contains a non-finite number');
      append(literal);
      segments.push({ ordinal: segments.length + 1, locator, char_start: start,
        char_end: raw_text.length, text: raw_text.slice(start), value_start, value_end: raw_text.length,
        scalar_value: node });
      return;
    }
    const array = Array.isArray(node);
    const entries = Object.entries(node);
    append(array ? '[' : '{');
    entries.forEach(([key, child], index) => {
      append(`\n${'  '.repeat(depth + 1)}`);
      const childStart = raw_text.length;
      if (!array) append(`${JSON.stringify(key)}: `);
      const path = array ? `${locator}[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? `${locator}.${key}` : `${locator}[${JSON.stringify(key)}]`;
      write(child, path, depth + 1, childStart);
      if (index < entries.length - 1) append(',');
    });
    if (entries.length) append(`\n${'  '.repeat(depth)}`);
    append(array ? ']' : '}');
  }
  write(value, '$', 0);
  ensure(raw_text.length <= 250000 && segments.length <= 500, 413, 'JSON exceeds 250,000 characters or 500 scalar fields');
  ensure(segments.length > 0, 400, 'JSON contains no scalar fields');
  return { raw_text, segments, warnings: [] };
}
