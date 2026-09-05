import Ajv from 'ajv';
import { concepts } from '../config.js';

const properties = {
  concept: { type: ['string','null'], enum: [...concepts.keys(), null] },
  modality: { type: 'string', enum: ['IS','MUST','MUST_NOT','MAY'] },
  operator: { type: ['string','null'], enum: ['=','>=','<=','>','<',null] },
  value: { type: ['number','null'] }, unit: { type: ['string','null'] },
  assertion_type: { type: 'string', enum: ['STATES_LAW','STATES_POLICY','STATES_BOTH'] },
  temporal_frame: { type: 'string', enum: ['PRESENT','HISTORICAL','FUTURE'] },
  applies_to_condition: { type: ['string','null'] }, evidence_quote: { type: 'string' },
  extraction_confidence: { type: 'string', enum: ['HIGH','LOW'] },
};
export const ruleSchema = { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) };
export const responseSchema = { type: 'object', additionalProperties: false,
  properties: { rules: { type: 'array', items: ruleSchema } }, required: ['rules'] };
export const validateRules = new Ajv({ strict: true }).compile({ type: 'array', maxItems: 20, items: ruleSchema });
