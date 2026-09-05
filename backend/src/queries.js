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
