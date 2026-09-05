import { createHash } from 'node:crypto';
import { loadConcepts } from '../vocabulary.js';
import { ensure } from '../errors.js';
import { transaction } from '../db.js';

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
