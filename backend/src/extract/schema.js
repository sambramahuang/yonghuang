import Ajv from 'ajv';
import { cachedConcepts } from '../vocabulary.js';

// Built per call: the vocabulary grows at runtime as concepts are discovered,
// so a schema frozen at import time would reject newly added concepts.
const buildProperties = (ids) => ({
  concept: { type: ['string','null'], enum: [...ids, null] },
  modality: { type: 'string', enum: ['IS','MUST','MUST_NOT','MAY'] },
  operator: { type: ['string','null'], enum: ['=','>=','<=','>','<',null] },
  value: { type: ['number','null'] }, unit: { type: ['string','null'] },
  assertion_type: { type: 'string', enum: ['STATES_LAW','STATES_POLICY','STATES_BOTH'] },
  temporal_frame: { type: 'string', enum: ['PRESENT','HISTORICAL','FUTURE'] },
  applies_to_condition: { type: ['string','null'] }, evidence_quote: { type: 'string' },
  extraction_confidence: { type: 'string', enum: ['HIGH','LOW'] },
});

export const ruleSchemaFor = (ids) => {
  const properties = buildProperties(ids);
  return { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) };
};
export const responseSchemaFor = (ids) => ({ type: 'object', additionalProperties: false,
  properties: { rules: { type: 'array', items: ruleSchemaFor(ids) } }, required: ['rules'] });

// Compiled per distinct vocabulary; the set of ids changes rarely.
const validators = new Map();
export function validateRulesFor(ids) {
  const key = [...ids].sort().join('|');
  if (!validators.has(key)) {
    validators.set(key, new Ajv({ strict: true }).compile({ type: 'array', maxItems: 20, items: ruleSchemaFor(ids) }));
  }
  return validators.get(key);
}

// Back-compatible views over the currently cached vocabulary.
export const ruleSchema = ruleSchemaFor([...cachedConcepts().keys()]);
export const responseSchema = responseSchemaFor([...cachedConcepts().keys()]);
export const validateRules = rules => validateRulesFor([...cachedConcepts().keys()])(rules);
