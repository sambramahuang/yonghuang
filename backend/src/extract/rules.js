import { configFields, qualifierPattern } from '../config.js';

// Punctuation that differs only in shape between a Word document and a model's
// reproduction of it. Replacements are single characters so offsets are
// preserved exactly: index i in the normalised string is index i in the original.
const PUNCTUATION = /[\u2018\u2019\u201B\u2032]|[\u201C\u201D\u201F\u2033]|[\u2010-\u2015\u2212]|\u00A0/g;
const normalise = text => String(text).replace(PUNCTUATION, ch =>
  ('\u2018\u2019\u201B\u2032'.includes(ch) ? "'" : '\u201C\u201D\u201F\u2033'.includes(ch) ? '"' : ch === '\u00A0' ? ' ' : '-'));

/** Index of `quote` in `text`, ignoring punctuation shape. -1 when absent. */
function locateQuote(text, quote, from = 0) {
  if (typeof quote !== 'string' || !quote) return -1;
  const direct = text.indexOf(quote, from);
  if (direct >= 0) return direct;
  return normalise(text).indexOf(normalise(quote), from);
}
import { validateRulesFor } from './schema.js';

// Text that names a topic or catalogues statutory references rather than
// stating an obligation. The model is told to skip these, but it sees the
// surrounding document and does not do so reliably, so the check is here where
// it is deterministic.
const HEADING = /^\s*(?:\d+(?:\.\d+)*\.?\s+)?[A-Z][^.!?]{0,60}$/;
const CITATION_LIST = /\b(?:statutory anchors|drafted against|key statutory|source basis|this precedent (?:is|has been))\b/i;

// A quantity means the line states something, however tersely - a table cell
// reading "Within 30 days after completion" is a value, not a heading.
const QUANTITY = /\b\d+\s*(?:hour|day|week|month|year|minute)s?\b/i;

function isNonOperative(text) {
  const trimmed = String(text).trim();
  if (QUANTITY.test(trimmed)) return CITATION_LIST.test(trimmed);
  if (trimmed.length <= 70 && HEADING.test(trimmed)) return true;
  return CITATION_LIST.test(trimmed);
}

export async function extractRules(segment, { name, format, extractor, concepts }) {
  if (format !== 'JSON' && isNonOperative(segment.text)) {
    return { rules: [], confidence: 'LOW', error: 'Heading or citation list; states no obligation' };
  }
  const conceptList = [...concepts.values()];
  const validateRules = validateRulesFor(conceptList.map(c => c.id));
  let rules;
  try {
    if (format === 'JSON') {
      const mapping = configFields[name]?.[segment.locator];
      // JSON semantics are hand-declared, never inferred from an arbitrary field name.
      if (!mapping || typeof segment.scalar_value !== 'number') return { rules: [], confidence: 'LOW', error: 'No numeric statutory field mapping' };
      rules = [{ concept: mapping.concept, modality: 'IS', operator: '=', value: segment.scalar_value,
        unit: concepts.get(mapping.concept).unit, assertion_type: mapping.assertion_type,
        temporal_frame: 'PRESENT', applies_to_condition: null, evidence_quote: segment.text, extraction_confidence: 'HIGH' }];
    } else { rules = await extractor(segment, conceptList); }
    // Unknown concepts abstain. Everything else must satisfy the exact schema.
    if (Array.isArray(rules)) rules = rules.map(r => r && typeof r.concept === 'string' && !concepts.has(r.concept) ? { ...r, concept: null } : r);
    if (!validateRules(rules)) return { rules: [], confidence: 'LOW', error: 'Invalid extraction schema' };
    const accepted = [];
    for (const rule of rules) {
      const quote = rule.evidence_quote;
      // Word documents carry typographic quotes and dashes; a model reproducing
      // a clause faithfully may still return the ASCII form, or the reverse.
      // Locating the quote through a normalised view keeps the check honest -
      // the text must still be present, character for character apart from
      // punctuation shape - while not discarding a correct rule over an
      // apostrophe. Offsets are taken from the ORIGINAL text either way.
      const relative = locateQuote(segment.text, quote);
      if (!quote || relative < 0 || locateQuote(segment.text, quote, relative + 1) !== -1 ||
          // IS must carry a comparator, MAY must not; a duty may either way.
          (rule.modality === 'IS' && rule.operator === null) ||
          (rule.modality === 'MAY' && rule.operator !== null) ||
          (rule.applies_to_condition !== null && (!rule.applies_to_condition || locateQuote(segment.text, rule.applies_to_condition) < 0))) {
        continue;
      }
      // A rule with a concept but no value states nothing actionable - it is
      // almost always a heading or a table label naming the topic.
      if (rule.concept !== null && rule.value === null) continue;
      const { evidence_quote, ...fields } = rule;
      accepted.push({ ...fields, has_qualifier: qualifierPattern.test(segment.text),
        evidence_start: segment.char_start + relative, evidence_end: segment.char_start + relative + quote.length,
        extraction_confidence: rule.assertion_type === 'STATES_BOTH' ? 'LOW' : rule.extraction_confidence });
    }
    const discarded = accepted.length !== rules.length;
    // A partly invalid segment cannot retain a high-confidence patchable rule.
    if (discarded) accepted.forEach(rule => { rule.extraction_confidence = 'LOW'; });
    return { rules: accepted, confidence: discarded || accepted.some(r => r.extraction_confidence === 'LOW') ? 'LOW' : 'HIGH',
      error: discarded ? 'Unverifiable evidence discarded' : null };
  } catch (error) {
    // The cause is recorded: a provider outage and a bug in this module are
    // both "extraction unavailable" to the caller, but only one is actionable.
    if (process.env.EXTRACTION_DEBUG) console.error('extractRules failed:', error);
    return { rules: [], confidence: 'LOW', error: 'Extraction unavailable or invalid; lexical review only' };
  }
}
