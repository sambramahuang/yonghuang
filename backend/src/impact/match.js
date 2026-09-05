import { transaction } from '../db.js';
import { ensure } from '../errors.js';
import { requiresLegalReview } from './boundary.js';
import { proposePatch } from './patch.js';
import { proposeExplanation, proposeTextPatch } from './draft.js';

// One candidate query: structured concept matching plus alias AND literal-old-value fallback.
// Aliases intentionally contain stems (e.g. re-employ); literal matching uses numeric boundaries.
export const candidateQuery = `
WITH changes AS (
 SELECT c.*,v.aliases,v.direction FROM regulatory_changes c JOIN concepts v ON v.id=c.concept WHERE c.update_id=$1
), segments AS (
 SELECT s.*,a.name,a.id AS artefact_id,a.current_version_id,v.raw_text FROM artefact_segments s
 JOIN artefacts a ON a.analysis_version_id=s.version_id JOIN artefact_versions v ON v.id=s.version_id
)
SELECT c.id AS change_id,s.id AS segment_id,'STRUCTURED' AS tier,
 to_jsonb(c) AS change,to_jsonb(s) AS segment,r.rules
FROM changes c CROSS JOIN segments s
JOIN LATERAL (SELECT jsonb_agg(to_jsonb(ir) ORDER BY ir.id) AS rules
 FROM internal_rules ir WHERE ir.concept=c.concept AND ir.segment_id=s.id) r ON r.rules IS NOT NULL
UNION ALL
SELECT c.id,s.id,'LEXICAL',to_jsonb(c),to_jsonb(s),'[]'::jsonb
FROM changes c CROSS JOIN segments s
WHERE NOT EXISTS(SELECT 1 FROM internal_rules r WHERE r.segment_id=s.id AND r.concept IS NOT NULL)
 AND c.old_value IS NOT NULL
 AND EXISTS(SELECT 1 FROM unnest(c.aliases) alias WHERE strpos(lower(s.text),lower(alias))>0)
 AND EXISTS(SELECT 1 FROM regexp_matches(s.text,'(?<![[:alnum:]_.,+-])([0-9]+(?:,[0-9]{3})*(?:[.][0-9]+)?)(?![[:alnum:]_,]|[.][0-9])','g') AS token
   WHERE replace(token[1],',','')::numeric=c.old_value)
`;

function classify(candidate) {
  const { change, segment } = candidate;
  if (candidate.tier === 'LEXICAL') return { status: 'POSSIBLE_IMPACT', patch: null, rule: null, explanation: 'A concept alias and the old value occur together. No structured claim supports a patch.' };
  const presentRules = candidate.rules.filter(r => r.temporal_frame !== 'HISTORICAL');
  if (!presentRules.length) return { suppressed: 'HISTORICAL' };
  const rule = presentRules[0];
  const result = (status, explanation, patch = null) => ({ status, explanation, patch, rule });
  if (String(segment.current_version_id) !== String(segment.version_id)) {
    return result('LEGAL_REVIEW_REQUIRED', 'This artefact has an approved version that has not been re-extracted. A new regulatory change requires a fresh legal assessment.');
  }
  if (presentRules.length > 1 || requiresLegalReview(rule, change)) {
    // Still beyond deterministic patching, but a drafter may offer replacement
    // wording for a reviewer to accept, rewrite or reject.
    return { ...result('LEGAL_REVIEW_REQUIRED', 'This claim crosses the competence boundary: qualifications, conditions, tense, uncertainty, units, modality, or multiple claims require legal review. Any replacement wording is a model draft, not a verified patch.'), draftable: true };
  }
  if (rule.assertion_type === 'STATES_POLICY') {
    const generous = change.direction === 'FLOOR' ? Number(rule.value) > Number(change.new_value) : Number(rule.value) < Number(change.new_value);
    const requirementWord = change.direction === 'FLOOR' ? 'minimum' : 'maximum';
    return result('POSSIBLE_IMPACT', generous
      ? `This firm policy states ${rule.value} ${rule.unit}, which already exceeds the new legal ${requirementWord} of ${change.new_value} ${change.unit}. A human must confirm whether this is deliberate.`
      : `This firm policy states ${rule.value} ${rule.unit}, but the new legal ${requirementWord} is ${change.new_value} ${change.unit} — the policy no longer meets it. This is a firm policy choice rather than a restatement of law, so no patch is proposed automatically; a human must assess the regulatory impact.`);
  }
  if (Number(rule.value) === Number(change.new_value)) return result('CURRENT', 'The extracted claim already states the new value.');
  if (Number(rule.value) !== Number(change.old_value)) return result('LEGAL_REVIEW_REQUIRED', 'The claim states neither the supplied old value nor the new value. No replacement can be inferred safely.');
  const patch = proposePatch(rule, change, segment, segment.raw_text);
  if (!patch) return result('LEGAL_REVIEW_REQUIRED', 'The numeric evidence is missing or ambiguous. An exact replacement cannot be proposed.');
  return result('UPDATE_NEEDED', `The present statement of law says ${rule.value} ${rule.unit}; the supplied update changes it to ${change.new_value} ${change.unit}.`, patch);
}

export async function analyse(pool, updateId, today = new Date().toISOString().slice(0,10), drafter = null) {
  return transaction(pool, async db => {
    const update = (await db.query('SELECT *,effective_date::text AS date FROM regulatory_updates WHERE id=$1 FOR UPDATE', [updateId])).rows[0];
    ensure(update, 404, 'Regulatory update not found');
    ensure(update.date <= today, 409, 'Future-effective updates can be stored, but analysis is deferred until their effective date');
    const { rows: candidates } = await db.query(candidateQuery, [updateId]);
    let created = 0;
    const not_actioned = [];
    for (const candidate of candidates) {
      const { change } = candidate;
      const verdict = classify(candidate);
      if (verdict.suppressed) {
        not_actioned.push({ segment_id: candidate.segment_id, artefact_id: candidate.segment.artefact_id,
          name: candidate.segment.name, locator: candidate.segment.locator, text: candidate.segment.text, reason: verdict.suppressed });
        continue;
      }
      // Drafting runs outside the deterministic path: a failure or refusal
      // simply leaves the finding without a patch.
      if (verdict.draftable && drafter) {
        const segmentRef = { ...candidate.segment, id: candidate.segment_id, version_id: candidate.segment.version_id };
        if (!verdict.patch) {
          verdict.patch = await proposeTextPatch({ segment: segmentRef, change, update, drafter });
        }
        // The generic boundary sentence says WHY a human is needed in the
        // abstract; a reviewer needs to know what THIS clause says and how
        // the update bears on it. A decline or error leaves classify()'s
        // explanation in place rather than blocking the finding.
        const explanation = await proposeExplanation({ segment: segmentRef, change, update, drafter });
        if (explanation) verdict.explanation = explanation;
      }
      const inserted = await db.query(`INSERT INTO impact_results(change_id,segment_id,rule_id,evidence_tier,system_status,explanation,proposed_patch)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(change_id,segment_id) DO NOTHING RETURNING id`,
      [candidate.change_id,candidate.segment_id,verdict.rule?.id ?? null,candidate.tier,verdict.status,verdict.explanation,verdict.patch]);
      created += inserted.rowCount;
    }
    const gaps = (await db.query(`SELECT c.id AS change_id,c.concept FROM regulatory_changes c
      WHERE c.update_id=$1 AND c.change_type='DUTY_ADDED' AND NOT EXISTS(
        SELECT 1 FROM internal_rules r JOIN artefact_segments s ON s.id=r.segment_id
        JOIN artefacts a ON a.analysis_version_id=s.version_id WHERE r.concept=c.concept)`, [updateId])).rows;
    return { update_id: updateId, created, not_actioned, gaps: gaps.map(g => ({ ...g, system_status: 'POSSIBLE_IMPACT', explanation: 'No internal structured claim addresses the new duty. Manual gap assessment required.' })) };
  });
}
