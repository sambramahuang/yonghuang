import { ensure } from '../errors.js';

export function numericTokens(text) {
  return [...text.matchAll(/(?<![\w.,+-])\d+(?:,\d{3})*(?:\.\d+)?(?![\w,]|\.\d)/g)];
}

export function proposePatch(rule, change, segment, rawText) {
  const quote = rawText.slice(rule.evidence_start, rule.evidence_end);
  let start, end;
  if (segment.value_start != null) {
    start = segment.value_start; end = segment.value_end;
    if (start < rule.evidence_start || end > rule.evidence_end || Number(rawText.slice(start,end)) !== Number(rule.value)) return null;
  } else {
    const tokens = numericTokens(quote).filter(m => Number(m[0].replaceAll(',', '')) === Number(rule.value));
    if (tokens.length !== 1) return null;
    start = rule.evidence_start + tokens[0].index;
    end = start + tokens[0][0].length;
  }
  // kind/verified distinguish this deterministic replacement from a model-drafted
  // TEXT patch. Both travel the same approval path; only this one is checkable.
  return { kind: 'VALUE', old: rawText.slice(start,end), new: String(change.new_value), start, end,
    base_version_id: segment.version_id, verified: true };
}

// Rebase an evidence-anchored patch through every already-approved version.
// Audit positions are relative to the previous current version, in approval order.
export function rebasePatch(patch, appliedPatches, currentText) {
  let start = patch.start, end = patch.end;
  for (const applied of appliedPatches) {
    if (applied.end <= start) {
      const delta = applied.new.length - (applied.end - applied.start);
      start += delta; end += delta;
    } else if (applied.start < end) {
      ensure(false, 409, 'This evidence overlaps an approved change; a fresh legal assessment is required');
    }
  }
  ensure(currentText.slice(start,end) === patch.old, 409, 'Evidence no longer matches the current version');
  return { ...patch, start, end };
}
