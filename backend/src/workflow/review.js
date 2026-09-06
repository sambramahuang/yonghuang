import { transaction } from '../db.js';
import { ensure } from '../errors.js';
import { rebasePatch } from '../impact/patch.js';

const reasons = ['NOT_APPLICABLE','WRONG_MATCH','POLICY_EXCEEDS','NEEDS_COUNSEL','OTHER'];
async function audit(db, impactId, actorId, action, details) {
  await db.query('INSERT INTO audit_events(impact_id,actor_id,action,details) VALUES($1,$2,$3,$4)', [impactId,actorId,action,details]);
}
async function lockImpact(db, id, revision) {
  const impact = (await db.query('SELECT * FROM impact_results WHERE id=$1 FOR UPDATE', [id])).rows[0];
  ensure(impact, 404, 'Impact not found');
  ensure(impact.resolution === null, 409, 'Impact has already been resolved');
  ensure(Number.isInteger(revision) && revision === impact.revision, 409, 'Impact revision is stale; reload the finding');
  return impact;
}
const getImpact = async (db, id) => (await db.query('SELECT * FROM impact_results WHERE id=$1', [id])).rows[0];

export async function editPatch(pool, id, user, { revision, new: replacement }) {
  return transaction(pool, async db => {
    const impact = await lockImpact(db, id, revision);
    // A drafted TEXT patch is editable wherever it exists, including on a
    // legal-review finding: rewriting the draft is the point of that review.
    const editable = impact.system_status === 'UPDATE_NEEDED'
      || (impact.system_status === 'LEGAL_REVIEW_REQUIRED' && impact.proposed_patch?.kind === 'TEXT');
    ensure(editable && impact.proposed_patch, 409, 'This finding cannot receive a patch');
    const isText = impact.proposed_patch?.kind === 'TEXT';
    ensure(typeof replacement === 'string', 400, 'new must be a string');
    if (isText) {
      // Prose replacement: a reviewer may rewrite the model's draft freely.
      ensure(replacement.trim().length > 0 && replacement.length <= 4000, 400, 'new must be 1-4000 characters');
    } else {
      ensure(/^(0|[1-9]\d*)(\.\d+)?$/.test(replacement) && replacement.length <= 30 && Number.isFinite(Number(replacement)), 400, 'new must be a non-negative numeric string');
    }
    ensure(Number(replacement) !== Number(impact.proposed_patch.old.replaceAll(',', '')), 400, 'Replacement must change the value');
    const patch = { ...impact.proposed_patch, new: replacement,
      ...(isText ? { drafted_by: 'HUMAN' } : {}) };
    await db.query("UPDATE impact_results SET proposed_patch=$2,edited_by=$3,submitted_by=NULL,workflow_state='DRAFT',revision=revision+1 WHERE id=$1", [id,patch,user.id]);
    await audit(db,id,user.id,'PATCH_EDITED',{ before: impact.proposed_patch, after: patch });
    return getImpact(db,id);
  });
}

export async function submit(pool, id, user, { revision }) {
  return transaction(pool, async db => {
    const impact = await lockImpact(db,id,revision);
    ensure(impact.proposed_patch && impact.workflow_state === 'DRAFT', 409, 'Only a draft patch can be submitted');
    await db.query("UPDATE impact_results SET submitted_by=$2,workflow_state='SUBMITTED',revision=revision+1 WHERE id=$1", [id,user.id]);
    await audit(db,id,user.id,'SUBMITTED',{ patch: impact.proposed_patch });
    return getImpact(db,id);
  });
}

export async function approve(pool, id, user, { revision }) {
  ensure(user.capability === 'APPROVER', 403, 'APPROVER capability is required');
  return transaction(pool, async db => {
    // Lock the artefact first, then its finding. Different findings on one file serialize.
    const ref = (await db.query(`SELECT v.artefact_id FROM impact_results i JOIN artefact_segments s ON s.id=i.segment_id
      JOIN artefact_versions v ON v.id=s.version_id WHERE i.id=$1`, [id])).rows[0];
    ensure(ref, 404, 'Impact not found');
    const artefact = (await db.query('SELECT * FROM artefacts WHERE id=$1 FOR UPDATE', [ref.artefact_id])).rows[0];
    const impact = await lockImpact(db,id,revision);
    const approvable = impact.system_status === 'UPDATE_NEEDED'
      || (impact.system_status === 'LEGAL_REVIEW_REQUIRED' && impact.proposed_patch?.kind === 'TEXT');
    ensure(impact.workflow_state === 'SUBMITTED' && approvable && impact.proposed_patch, 409, 'A submitted patch is required');
    // A senior partner carries the authority to review and approve their own
    // wording, so approving an edit you made yourself is permitted. The audit
    // trail still records both actions against the same name, so who did what
    // remains answerable.
    const current = (await db.query('SELECT * FROM artefact_versions WHERE id=$1', [artefact.current_version_id])).rows[0];
    const base = (await db.query('SELECT * FROM artefact_versions WHERE id=$1', [impact.proposed_patch.base_version_id])).rows[0];
    ensure(base && base.artefact_id === artefact.id && base.version <= current.version, 409, 'Invalid patch base version');
    const previous = (await db.query(`SELECT e.details FROM audit_events e JOIN impact_results i ON i.id=e.impact_id
      JOIN artefact_versions v ON v.id=i.resolving_version_id
      WHERE e.action='APPROVED' AND v.artefact_id=$1 AND v.version>$2 AND v.version<=$3 ORDER BY v.version`,
    [artefact.id,base.version,current.version])).rows;
    ensure(previous.length === current.version - base.version, 409, 'Version history cannot be verified');
    const applied = rebasePatch(impact.proposed_patch, previous.map(e => e.details.applied_patch), current.raw_text);
    const rawText = current.raw_text.slice(0,applied.start) + applied.new + current.raw_text.slice(applied.end);
    if (artefact.format === 'JSON') {
      let valid = false;
      try { JSON.parse(rawText); valid = true; } catch { /* abort transaction below */ }
      ensure(valid, 409, 'The patch would invalidate the JSON file');
    }
    await db.query("UPDATE artefact_versions SET status='SUPERSEDED' WHERE id=$1", [current.id]);
    const version = (await db.query(`INSERT INTO artefact_versions(artefact_id,version,raw_text,supersedes,status,created_by,approved_by)
      VALUES($1,$2,$3,$4,'CURRENT',$5,$6) RETURNING *`,
    [artefact.id,current.version + 1,rawText,current.id,impact.edited_by ?? impact.submitted_by,user.id])).rows[0];
    await db.query('UPDATE artefacts SET current_version_id=$2 WHERE id=$1', [artefact.id,version.id]);
    await db.query(`UPDATE impact_results SET resolution='ACCEPTED',workflow_state='RESOLVED',approved_by=$2,resolved_by=$2,
      resolving_version_id=$3,resolved_at=now(),revision=revision+1 WHERE id=$1`, [id,user.id,version.id]);
    await audit(db,id,user.id,'APPROVED',{ previous_version_id: current.id, version_id: version.id, applied_patch: applied });
    return { impact: await getImpact(db,id), version };
  });
}

/**
 * Accepts a finding that has nothing to apply.
 *
 * POSSIBLE_IMPACT findings — and any legal-review finding the drafter declined
 * to draft for — carry no proposed patch, so there is no text to write and no
 * new version to create. Accepting one records that a human read the flag and
 * that the artefact stands as it is. A finding that *does* carry a patch is
 * refused here: applying an edit still goes through submit + approve, so this
 * is never a route to resolving an edit without writing it.
 *
 * `resolving_version_id` is set to the artefact's current version — the schema
 * requires an ACCEPTED resolution to name the version it was resolved against,
 * and with no patch applied that is simply the version already in force.
 */
export async function acceptNoEdit(pool, id, user, { revision, note = '' }) {
  ensure(user.capability === 'APPROVER', 403, 'APPROVER capability is required');
  ensure(typeof note === 'string' && note.length <= 5000, 400, 'note must contain at most 5000 characters');
  return transaction(pool, async db => {
    const ref = (await db.query(`SELECT a.current_version_id FROM impact_results i
      JOIN artefact_segments s ON s.id=i.segment_id
      JOIN artefact_versions v ON v.id=s.version_id
      JOIN artefacts a ON a.id=v.artefact_id WHERE i.id=$1`, [id])).rows[0];
    ensure(ref, 404, 'Impact not found');
    const impact = await lockImpact(db, id, revision);
    ensure(!impact.proposed_patch, 409, 'This finding has a proposed patch; submit and approve it instead');
    await db.query(`UPDATE impact_results SET resolution='ACCEPTED',workflow_state='RESOLVED',approved_by=$2,resolved_by=$2,
      resolving_version_id=$3,resolved_at=now(),revision=revision+1 WHERE id=$1`, [id,user.id,ref.current_version_id]);
    await audit(db,id,user.id,'ACCEPTED_NO_EDIT',{ version_id: ref.current_version_id, note });
    return getImpact(db,id);
  });
}

export async function resolve(pool, id, user, { revision, rejection_reason, note = '' }, resolution) {
  ensure(['REJECTED','ESCALATED'].includes(resolution), 400, 'Unsupported resolution');
  if (resolution === 'REJECTED') ensure(user.capability === 'APPROVER', 403, 'APPROVER capability is required');
  const reason = resolution === 'ESCALATED' ? 'NEEDS_COUNSEL' : rejection_reason;
  ensure(reasons.includes(reason), 400, 'A valid rejection_reason is required');
  ensure(typeof note === 'string' && note.length <= 5000, 400, 'note must contain at most 5000 characters');
  return transaction(pool, async db => {
    await lockImpact(db,id,revision);
    await db.query(`UPDATE impact_results SET resolution=$2,rejection_reason=$3,resolved_by=$4,resolved_at=now(),
      workflow_state='RESOLVED',revision=revision+1 WHERE id=$1`, [id,resolution,reason,user.id]);
    await audit(db,id,user.id,resolution,{ rejection_reason: reason, note });
    return getImpact(db,id);
  });
}
