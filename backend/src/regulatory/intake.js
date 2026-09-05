import { createHash } from 'node:crypto';
import { loadConcepts } from '../vocabulary.js';
import { ensure, HttpError } from '../errors.js';
import { transaction } from '../db.js';
import { extractRegulatoryChanges } from './extract.js';
import { analyse } from '../impact/match.js';

const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function validateUpdate(body, concepts) {
  ensure(body && typeof body === 'object', 400, 'An update object is required');
  ensure(typeof body.provider_ref === 'string' && body.provider_ref.length > 0 && body.provider_ref.length <= 200, 400, 'provider_ref is required (max 200 characters)');
  ensure(typeof body.title === 'string' && body.title.length > 0 && body.title.length <= 1000, 400, 'title is required (max 1000 characters)');
  ensure(isDate(body.effective_date), 400, 'effective_date must be a valid YYYY-MM-DD date');
  ensure(body.gazetted_date == null || isDate(body.gazetted_date), 400, 'gazetted_date must be a valid date');
  if (body.source_url != null) {
    let url;
    try { url = new URL(body.source_url); } catch { /* validated below */ }
    ensure(url && ['https:','http:'].includes(url.protocol), 400, 'source_url must be HTTP or HTTPS');
  }
  ensure(Array.isArray(body.changes) && body.changes.length > 0 && body.changes.length <= 20, 400, 'changes must contain 1–20 changes');
  const seen = new Set();
  const changes = body.changes.map(c => {
    ensure(c && concepts.has(c.concept) && !seen.has(c.concept), 400, 'Each change must use a distinct supported concept');
    seen.add(c.concept);
    ensure(['VALUE_CHANGED','DUTY_ADDED','DUTY_REMOVED','SCOPE_CHANGED'].includes(c.change_type), 400, 'Unsupported change_type');
    ensure(c.unit === concepts.get(c.concept).unit, 400, 'Change unit does not match the concept');
    ensure(typeof c.source_span === 'string' && c.source_span.trim().length > 0 && c.source_span.length <= 10000, 400, 'source_span is required (max 10000 characters)');
    for (const field of ['old_value','new_value']) {
      ensure(c[field] == null || (typeof c[field] === 'number' && Number.isFinite(c[field]) && c[field] >= 0), 400, `${field} must be a non-negative number or null`);
    }
    if (c.change_type === 'VALUE_CHANGED') ensure(c.old_value != null && c.new_value != null && c.old_value !== c.new_value, 400, 'VALUE_CHANGED requires distinct old_value and new_value');
    return { concept: c.concept, change_type: c.change_type, old_value: c.old_value ?? null, new_value: c.new_value ?? null, unit: c.unit, source_span: c.source_span };
  }).sort((a,b) => a.concept.localeCompare(b.concept));
  return { provider_ref: body.provider_ref, title: body.title, source_url: body.source_url ?? null,
    gazetted_date: body.gazetted_date ?? null, effective_date: body.effective_date, changes };
}

export async function intake(pool, body) {
  // Validate against the live vocabulary, which grows as concepts are discovered.
  const update = validateUpdate(body, await loadConcepts(pool));
  const hash = createHash('sha256').update(JSON.stringify(update)).digest('hex');
  return transaction(pool, async db => {
    const inserted = await db.query(`INSERT INTO regulatory_updates(provider_ref,payload_hash,title,source_url,gazetted_date,effective_date)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(provider_ref) DO NOTHING RETURNING *`,
    [update.provider_ref,hash,update.title,update.source_url,update.gazetted_date,update.effective_date]);
    if (!inserted.rowCount) {
      const existing = (await db.query('SELECT * FROM regulatory_updates WHERE provider_ref=$1', [update.provider_ref])).rows[0];
      ensure(existing.payload_hash === hash, 409, 'provider_ref already exists with different content');
      return { id: existing.id, created: false };
    }
    const id = inserted.rows[0].id;
    for (const c of update.changes) {
      await db.query(`INSERT INTO regulatory_changes(update_id,concept,change_type,old_value,new_value,unit,source_span)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [id,c.concept,c.change_type,c.old_value,c.new_value,c.unit,c.source_span]);
    }
    return { id, created: true };
  });
}

/**
 * The end-to-end path behind "upload a change in law": read the document,
 * have the model propose the structured changes `intake()` requires, store
 * them, and immediately analyse — so one upload is enough to flag every
 * document in the system that the change actually affects, the same
 * end-to-end action a human otherwise performs by hand (read the source,
 * write the structured update, submit it, run the analysis).
 *
 * Every fact the model states is still re-validated by `intake()` exactly as
 * a hand-written submission would be; nothing here relaxes that check.
 */
export async function intakeFromDocument(pool, { text, name, drafter, regulatoryExtractor }) {
  const concepts = await loadConcepts(pool);
  const extracted = await extractRegulatoryChanges(text, { extractor: regulatoryExtractor, concepts });
  if (extracted.error) throw new HttpError(422, `Could not read this document: ${extracted.error}`);
  if (!extracted.changes.length) {
    return { created: false, update_id: null, title: extracted.title, changes_found: 0,
      unmapped: extracted.unmapped, message: 'No changes matching a known concept were found in this document.' };
  }
  // The source text rarely carries a stable external reference the way a
  // gazette notice does, so identity is the document's own content — a
  // second upload of the same file is then a genuine no-op, not a duplicate.
  const provider_ref = `UPLOAD-${createHash('sha256').update(text).digest('hex').slice(0, 32)}`;
  const payload = {
    provider_ref,
    title: extracted.title || name,
    effective_date: extracted.effective_date ?? new Date().toISOString().slice(0, 10),
    changes: extracted.changes,
  };
  const { id, created } = await intake(pool, payload);
  // A change dated ahead of today is logged now and analysed later, on or
  // after its own effective date — exactly the same rule a hand-written
  // submission is held to. That is a legitimate outcome, not a failure.
  let analysis = { created: 0, not_actioned: [], gaps: [] };
  let deferredUntil = null;
  try {
    analysis = await analyse(pool, id, undefined, drafter);
  } catch (e) {
    if (e.status === 409 && /effective date/.test(e.message)) deferredUntil = payload.effective_date;
    else throw e;
  }
  return { created, update_id: id, title: payload.title, effective_date: payload.effective_date,
    changes_found: extracted.changes.length, unmapped: extracted.unmapped, deferred_until: deferredUntil,
    findings_created: analysis.created, not_actioned: analysis.not_actioned, gaps: analysis.gaps };
}
