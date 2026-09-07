const date = d => d.toISOString().slice(0,10);

/**
 * Renders certificateForVersion's data as a plain-text certificate. This adds
 * no new facts: every line is a formatted read of artefact_versions,
 * impact_results and the append-only audit_events trail.
 */
export function formatCertificate({ artefact,version,findings,resolved_by_names }) {
  const lines = [];
  lines.push('COMPLIANCE CERTIFICATE');
  lines.push('');
  lines.push(`Artefact: ${artefact.name} (version ${version.version})`);
  lines.push(`Verified current as of: ${date(version.created_at)}`);
  lines.push('');

  if (findings.length === 0) {
    lines.push('No regulatory changes have been resolved against this version.');
  } else {
    lines.push(`Verified against ${findings.length} regulatory change${findings.length === 1 ? '' : 's'}:`);
    for (const [index,f] of findings.entries()) {
      const valueChange = f.old_value != null ? ` (${f.old_value} to ${f.new_value}${f.unit ? ` ${f.unit}` : ''})` : '';
      lines.push('');
      lines.push(`${index + 1}. ${f.update_title} [${f.provider_ref}], effective ${date(f.effective_date)}`);
      lines.push(`   Concept: ${f.concept}${valueChange}`);
      lines.push(`   Finding status: ${f.system_status} (${f.evidence_tier} evidence)`);
      lines.push(`   Resolved ${date(f.resolved_at)} by ${f.resolved_by_name}${f.approved_by_name && f.approved_by_name !== f.resolved_by_name ? `, approved by ${f.approved_by_name}` : ''}`);
      lines.push('   Audit trail:');
      for (const event of f.audit) lines.push(`     ${event.created_at.toISOString()}  ${event.action}  ${event.actor_name}`);
    }
  }

  lines.push('');
  lines.push(`Resolved by: ${resolved_by_names.length ? resolved_by_names.join(', ') : 'n/a'}`);
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()} from this system's immutable audit_events log.`);
  lines.push('This certificate states nothing beyond what that log records.');
  return lines.join('\n');
}
