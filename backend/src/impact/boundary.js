// The competence boundary is executable code. Model output cannot bypass it.
// Historical statements are suppressed by the caller BEFORE this function runs.
export function requiresLegalReview(rule, change) {
  return change.change_type !== 'VALUE_CHANGED' || rule.has_qualifier ||
    rule.assertion_type === 'STATES_BOTH' || rule.temporal_frame !== 'PRESENT' ||
    rule.extraction_confidence === 'LOW' || rule.applies_to_condition != null ||
    rule.modality !== 'IS' || rule.operator !== '=' || rule.value == null ||
    rule.unit !== change.unit;
}
