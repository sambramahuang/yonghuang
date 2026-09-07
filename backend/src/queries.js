import { ensure } from './errors.js';

export async function artefactDetail(pool,id) {
  const artefact = (await pool.query('SELECT * FROM artefacts WHERE id=$1', [id])).rows[0];
  ensure(artefact,404,'Artefact not found');
  const versions = (await pool.query('SELECT * FROM artefact_versions WHERE artefact_id=$1 ORDER BY version DESC', [id])).rows;
  const segments = (await pool.query('SELECT * FROM artefact_segments WHERE version_id=$1 ORDER BY ordinal', [artefact.analysis_version_id])).rows;
  const rules = (await pool.query(`SELECT r.* FROM internal_rules r JOIN artefact_segments s ON s.id=r.segment_id WHERE s.version_id=$1 ORDER BY r.id`, [artefact.analysis_version_id])).rows;
  return { ...artefact, current_version: versions[0], versions, segments, rules,
    analysis_is_stale: artefact.current_version_id !== artefact.analysis_version_id };
}

export async function impactDetail(pool,id) {
  const row = (await pool.query(`SELECT i.*,to_jsonb(c) AS change,to_jsonb(u)-'payload_hash' AS regulatory_update,
    to_jsonb(s) AS segment,to_jsonb(r) AS rule,a.id AS artefact_id,a.name,a.format,a.current_version_id,v.raw_text AS evidence_raw_text
    FROM impact_results i JOIN regulatory_changes c ON c.id=i.change_id JOIN regulatory_updates u ON u.id=c.update_id
    JOIN artefact_segments s ON s.id=i.segment_id JOIN artefact_versions v ON v.id=s.version_id
    JOIN artefacts a ON a.id=v.artefact_id LEFT JOIN internal_rules r ON r.id=i.rule_id WHERE i.id=$1`, [id])).rows[0];
  ensure(row,404,'Impact not found');
  const start = row.rule?.evidence_start ?? row.segment.char_start;
  const end = row.rule?.evidence_end ?? row.segment.char_end;
  const audit = (await pool.query(`SELECT e.*,u.name AS actor_name FROM audit_events e JOIN users u ON u.id=e.actor_id WHERE impact_id=$1 ORDER BY e.id`, [id])).rows;
  return { ...row, evidence: { start,end,quote: row.evidence_raw_text.slice(start,end),locator: row.segment.locator,version_id: row.segment.version_id }, audit };
}

/**
 * Everything a compliance certificate needs for one artefact version, drawn
 * straight from data that already exists: the version's own record, and the
 * findings resolved against it (ACCEPTED is the only resolution that names a
 * resolving_version_id) with their regulatory source and full audit trail.
 */
export async function certificateForVersion(pool,artefactId,versionNumber) {
  const artefact = (await pool.query('SELECT * FROM artefacts WHERE id=$1', [artefactId])).rows[0];
  ensure(artefact,404,'Artefact not found');
  const version = (await pool.query(`SELECT v.*,creator.name AS created_by_name,approver.name AS approved_by_name
    FROM artefact_versions v JOIN users creator ON creator.id=v.created_by
    LEFT JOIN users approver ON approver.id=v.approved_by
    WHERE v.artefact_id=$1 AND v.version=$2`,
  [artefactId, versionNumber ?? (await pool.query('SELECT version FROM artefact_versions WHERE id=$1', [artefact.current_version_id])).rows[0].version])).rows[0];
  ensure(version,404,'Version not found');

  const findings = (await pool.query(`SELECT i.id,i.system_status,i.evidence_tier,i.resolved_at,
      c.concept,c.change_type,c.old_value,c.new_value,c.unit,
      ru.title AS update_title,ru.provider_ref,ru.effective_date,
      approver.name AS approved_by_name,resolver.name AS resolved_by_name
    FROM impact_results i
    JOIN regulatory_changes c ON c.id=i.change_id
    JOIN regulatory_updates ru ON ru.id=c.update_id
    LEFT JOIN users approver ON approver.id=i.approved_by
    LEFT JOIN users resolver ON resolver.id=i.resolved_by
    WHERE i.resolving_version_id=$1 AND i.resolution='ACCEPTED'
    ORDER BY i.id`, [version.id])).rows;

  const events = findings.length ? (await pool.query(`SELECT e.impact_id,e.action,e.created_at,u.name AS actor_name
    FROM audit_events e JOIN users u ON u.id=e.actor_id
    WHERE e.impact_id=ANY($1::bigint[]) ORDER BY e.id`, [findings.map(f => f.id)])).rows : [];
  const auditByImpact = new Map();
  for (const event of events) {
    const key = String(event.impact_id);
    if (!auditByImpact.has(key)) auditByImpact.set(key,[]);
    auditByImpact.get(key).push(event);
  }

  const resolvedByNames = [...new Set(findings.flatMap(f => [f.approved_by_name,f.resolved_by_name]).filter(Boolean))];
  return { artefact,version,
    findings: findings.map(f => ({ ...f,audit: auditByImpact.get(String(f.id)) ?? [] })),
    resolved_by_names: resolvedByNames };
}

export async function listImpacts(pool,query) {
  const statuses = ['CURRENT','UPDATE_NEEDED','POSSIBLE_IMPACT','LEGAL_REVIEW_REQUIRED'];
  ensure(!query.status || statuses.includes(query.status),400,'Invalid status filter');
  ensure(!query.update_id || /^\d+$/.test(query.update_id),400,'Invalid update_id');
  ensure(!query.open || ['true','false'].includes(query.open),400,'open must be true or false');
  return (await pool.query(`SELECT i.*,a.id AS artefact_id,a.name,s.locator,s.text AS segment_text,c.concept,c.update_id
    FROM impact_results i JOIN artefact_segments s ON s.id=i.segment_id JOIN artefact_versions v ON v.id=s.version_id
    JOIN artefacts a ON a.id=v.artefact_id JOIN regulatory_changes c ON c.id=i.change_id
    WHERE ($1::bigint IS NULL OR c.update_id=$1) AND ($2::text IS NULL OR i.system_status=$2)
      AND ($3::boolean IS DISTINCT FROM true OR (i.resolution IS NULL AND i.system_status<>'CURRENT'))
    ORDER BY i.evidence_tier DESC,a.name,s.ordinal,i.id`, [query.update_id || null,query.status || null,query.open === 'true'])).rows;
}
