import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJson } from '../src/ingest/parsers/json.js';
import { segmentText } from '../src/ingest/segment.js';
import { extractRules } from '../src/extract/rules.js';
import { requiresLegalReview } from '../src/impact/boundary.js';
import { numericTokens, rebasePatch } from '../src/impact/patch.js';
import { validateUpdate } from '../src/regulatory/intake.js';
import { liveExtractor } from '../src/extract/providers.js';
import { readFileSync } from 'node:fs';

const update = JSON.parse(readFileSync(new URL('../../fixtures/regulatory/sg-rra-2026.json',import.meta.url)));
const text = 'The statutory retirement age is 63.';
const rule = { concept: 'retirement_age',modality: 'IS',operator: '=',value: 63,unit: 'years',assertion_type: 'STATES_LAW',
  temporal_frame: 'PRESENT',applies_to_condition: null,evidence_quote: text,extraction_confidence: 'HIGH' };
const extract = (rules,raw = text) => extractRules(segmentText(raw)[0],{ name: 'test.docx',format: 'DOCX',extractor: async () => rules });

test('JSON canonicalization retains nested and escaped paths with exact UTF-16 offsets',() => {
  const value = { 'a.b': { 'quote"key': ['😀',63] },hr: { retirementAge: 63 } };
  const parsed = parseJson(Buffer.from(JSON.stringify(value)));
  assert.deepEqual(JSON.parse(parsed.raw_text),value);
  assert.equal(parsed.segments[0].locator,'$["a.b"]["quote\\"key"][0]');
  for (const s of parsed.segments) {
    assert.equal(parsed.raw_text.slice(s.char_start,s.char_end),s.text);
    assert.deepEqual(JSON.parse(parsed.raw_text.slice(s.value_start,s.value_end)),s.scalar_value);
  }
});
test('numeric matching excludes larger values, fractions, negatives and identifiers',() => {
  assert.deepEqual(numericTokens('63. 163 63.5 -63 A63 63A 7,400 63,000').map(m => m[0]),['63','163','63.5','7,400','63,000']);
});
test('unknown model concept abstains while malformed schema is discarded',async () => {
  assert.equal((await extract([{ ...rule,concept: 'invented' }])).rules[0].concept,null);
  for (const invalid of [{ ...rule,concept: 99 },{ ...rule,value: '63' },{ ...rule,extra: true }]) {
    const result = await extract([invalid]);
    assert.equal(result.rules.length,0); assert.equal(result.confidence,'LOW');
  }
});
test('paraphrased, repeated and fabricated-condition evidence cannot be trusted',async () => {
  for (const bad of [{ ...rule,evidence_quote: 'Age 63' },{ ...rule,applies_to_condition: 'if approved' },{ ...rule,evidence_quote: '' }]) {
    assert.equal((await extract([bad])).rules.length,0);
  }
  assert.equal((await extract([rule],`${text} ${text}`)).rules.length,0);
});
test('partial invalid extraction downgrades otherwise valid rules',async () => {
  const result = await extract([rule,{ ...rule,evidence_quote: 'invented' }]);
  assert.equal(result.rules[0].extraction_confidence,'LOW');
});
test('qualifier scan is deterministic regardless of model confidence',async () => {
  const raw = `${text} Unless otherwise agreed.`;
  const result = await extract([rule],raw);
  assert.equal(result.rules[0].has_qualifier,true);
  assert.equal(requiresLegalReview(result.rules[0],update.changes[0]),true);
});
test('every declared competence boundary refuses machine patches',() => {
  const base = { ...rule,has_qualifier: false };
  for (const fields of [{ has_qualifier: true },{ assertion_type: 'STATES_BOTH' },{ temporal_frame: 'HISTORICAL' },{ temporal_frame: 'FUTURE' },
    { extraction_confidence: 'LOW' },{ applies_to_condition: 'if eligible' },{ modality: 'MUST',operator: null },{ operator: '>=' },{ unit: 'months' }]) {
    assert.equal(requiresLegalReview({ ...base,...fields },update.changes[0]),true);
  }
  assert.equal(requiresLegalReview(base,{ ...update.changes[0],change_type: 'DUTY_ADDED' }),true);
  assert.equal(requiresLegalReview(base,update.changes[0]),false);
});
test('patch offsets rebase across length changes and reject overlapping edits',() => {
  const patch = { start: 5,end: 7,old: '68',new: '69' };
  const applied = { start: 0,end: 2,old: '63',new: '100' };
  assert.equal(rebasePatch(patch,[applied],'100 x 68').start,6);
  assert.throws(() => rebasePatch(patch,[{ start: 5,end: 7,new: '69' }],'63 x 69'),/overlaps/);
  assert.throws(() => rebasePatch(patch,[],'63 x 99'),/no longer matches/);
});
test('intake validates dates, units, concept uniqueness and source protocols',() => {
  for (const fields of [{ effective_date: '2026-02-30' },{ source_url: 'javascript:alert(1)' },
    { changes: [update.changes[0],update.changes[0]] },{ changes: [{ ...update.changes[0],unit: 'months' }] }]) {
    assert.throws(() => validateUpdate({ ...update,...fields }));
  }
});
test('Responses adapter sends strict structured output, handles completion and refuses partial output',async () => {
  let request;
  const extractor = liveExtractor({ apiKey: 'test-key',model: 'test-model',fetchImpl: async (url,options) => {
    request = { url,...JSON.parse(options.body) };
    return { ok: true,json: async () => ({ status: 'completed',output: [{ type: 'message',content: [{ type: 'output_text',text: JSON.stringify({ rules: [rule] }) }] }] }) };
  } });
  assert.deepEqual(await extractor({ text,locator: 'p.1' }),[rule]);
  assert.equal(request.text.format.strict,true); assert.equal(request.store,false);
  for (const response of [{ status: 'incomplete' },{ status: 'completed',output: [{ type: 'message',content: [{ type: 'refusal' }] }] }]) {
    const refusing = liveExtractor({ apiKey: 'test-key',model: 'test-model',fetchImpl: async () => ({ ok: true,json: async () => response }) });
    await assert.rejects(refusing({ text,locator: 'p.1' }));
  }
});
