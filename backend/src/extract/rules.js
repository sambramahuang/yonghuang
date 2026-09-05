import { concepts, configFields, qualifierPattern } from '../config.js';
import { validateRules } from './schema.js';

export async function extractRules(segment, { name, format, extractor }) {
  let rules;
  try {
    if (format === 'JSON') {
      const mapping = configFields[name]?.[segment.locator];
      // JSON semantics are hand-declared, never inferred from an arbitrary field name.
      if (!mapping || typeof segment.scalar_value !== 'number') return { rules: [], confidence: 'LOW', error: 'No numeric statutory field mapping' };
      rules = [{ concept: mapping.concept, modality: 'IS', operator: '=', value: segment.scalar_value,
        unit: concepts.get(mapping.concept).unit, assertion_type: mapping.assertion_type,
        temporal_frame: 'PRESENT', applies_to_condition: null, evidence_quote: segment.text, extraction_confidence: 'HIGH' }];
    } else { rules = await extractor(segment); }
    // Unknown concepts abstain. Everything else must satisfy the exact schema.
    if (Array.isArray(rules)) rules = rules.map(r => r && typeof r.concept === 'string' && !concepts.has(r.concept) ? { ...r, concept: null } : r);
    if (!validateRules(rules)) return { rules: [], confidence: 'LOW', error: 'Invalid extraction schema' };
    const accepted = [];
    for (const rule of rules) {
      const quote = rule.evidence_quote;
      const relative = segment.text.indexOf(quote);
      if (!quote || relative < 0 || segment.text.indexOf(quote, relative + 1) !== -1 ||
          (rule.modality === 'IS') !== (rule.operator !== null) ||
          (rule.applies_to_condition !== null && (!rule.applies_to_condition || !segment.text.includes(rule.applies_to_condition)))) {
        continue;
      }
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
  } catch {
    return { rules: [], confidence: 'LOW', error: 'Extraction unavailable or invalid; lexical review only' };
  }
}
