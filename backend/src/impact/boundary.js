// The competence boundary is executable code. Model output cannot bypass it.
// Historical statements are suppressed by the caller BEFORE this function runs.
export function requiresLegalReview(rule, change) {
  return change.change_type !== 'VALUE_CHANGED' || rule.has_qualifier ||
    rule.assertion_type === 'STATES_BOTH' || rule.temporal_frame !== 'PRESENT' ||
    rule.extraction_confidence === 'LOW' || rule.applies_to_condition != null ||
    // A duty with a threshold is patchable in the same way a statement is:
    // "must submit within 30 days" carries a value the regulator can change.
    // MAY grants a permission rather than setting one, so it never patches.
    !['IS','MUST','MUST_NOT'].includes(rule.modality) ||
    !['=','<=','>='].includes(rule.operator) || rule.value == null ||
    rule.unit !== change.unit;
}
