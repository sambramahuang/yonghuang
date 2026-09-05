import Ajv from 'ajv';

// Built per call: the vocabulary grows at runtime, same reasoning as
// extract/schema.js — a schema frozen at import time would reject concepts
// discovered after startup.
const buildChangeProperties = (ids) => ({
  concept: { type: ['string', 'null'], enum: [...ids, null] },
  change_type: { type: 'string', enum: ['VALUE_CHANGED', 'DUTY_ADDED', 'DUTY_REMOVED', 'SCOPE_CHANGED'] },
  old_value: { type: ['number', 'null'] },
  new_value: { type: ['number', 'null'] },
  source_span: { type: 'string' },
});

export const changeSchemaFor = (ids) => {
  const properties = buildChangeProperties(ids);
  return { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) };
};

export const responseSchemaFor = (ids) => ({
  type: 'object',
  additionalProperties: false,
  required: ['title', 'effective_date', 'changes'],
  properties: {
    title: { type: 'string' },
    // The model states its own confidence about the date rather than
    // guessing one: null means the source text never gave an effective
    // date, and the caller decides the fallback, not the model.
    effective_date: { type: ['string', 'null'] },
    changes: { type: 'array', maxItems: 20, items: changeSchemaFor(ids) },
  },
});

const validators = new Map();
export function validateExtractionFor(ids) {
  const key = [...ids].sort().join('|');
  if (!validators.has(key)) {
    validators.set(key, new Ajv({ strict: true }).compile(responseSchemaFor(ids)));
  }
  return validators.get(key);
}
