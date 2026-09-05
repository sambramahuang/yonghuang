// All persisted offsets are JavaScript UTF-16 offsets into this exact raw_text.
// Do not calculate these offsets with PostgreSQL substring (which counts Unicode code points).
export function segmentText(raw_text) {
  return [...raw_text.matchAll(/[^\r\n]+/g)].filter(m => m[0].trim()).map((m, i) => ({
    ordinal: i + 1, locator: `p.${i + 1}`, text: m[0],
    char_start: m.index, char_end: m.index + m[0].length,
    value_start: null, value_end: null,
  }));
}
