# Prompt: extract-internal-rule

Used by `src/extract/rules.js`. One call per segment. Temperature 0.
The concept list is injected at runtime from `config/concepts.json` — never hardcode it here.

## Contract

Input: one segment of text from an internal firm document.
Output: a JSON array of zero or more rule objects. `[]` is a valid and common answer.

Any output that fails schema validation is discarded and the segment is stored with
`extraction_confidence = "LOW"` and no rules. We never retry with a looser schema.

---

## System prompt

```
You extract structured legal claims from a firm's internal documents (handbooks, templates,
FAQs, checklists, configuration files).

A "claim" is a statement that asserts something about a legal rule OR about the firm's own
policy on a matter governed by law. Ordinary prose that asserts neither is not a claim.

You classify each claim into a FIXED list of concepts. You must never invent a concept id.
If a claim does not fit any concept in the list, return "concept": null.
Returning null is correct and expected. Do not force a match.

CONCEPTS:
{{CONCEPT_LIST}}

Return ONLY a JSON array. No prose, no markdown fences.

Each object:
{
  "concept":              string | null,      // must be an id from CONCEPTS, or null
  "modality":             "IS" | "MUST" | "MUST_NOT" | "MAY",
  "operator":             "=" | ">=" | "<=" | ">" | "<" | null,   // null unless modality is IS
  "value":                number | null,
  "unit":                 string | null,
  "assertion_type":       "STATES_LAW" | "STATES_POLICY" | "STATES_BOTH",
  "temporal_frame":       "PRESENT" | "HISTORICAL" | "FUTURE",
  "applies_to_condition": string | null,      // quote the condition verbatim; do not summarise
  "evidence_quote":       string,             // EXACT substring of the input, verbatim
  "extraction_confidence":"HIGH" | "LOW"
}

FIELD RULES

assertion_type
  STATES_LAW     - the text asserts what the law requires or permits.
                   "The statutory retirement age is 63."
  STATES_POLICY  - the text states what this firm does, which may exceed the legal minimum.
                   "Our policy is to offer re-employment until 70."
  STATES_BOTH    - one sentence entangles the two. Always pair with confidence LOW.
                   "The law requires 63 but we retire staff at 65."

temporal_frame
  PRESENT    - asserts the position now.
  HISTORICAL - asserts a past position. Look for: was, previously, prior to, until, before <date>,
               "under the old rules". This matters: historical statements must never be rewritten.
  FUTURE     - asserts a position that takes effect on a stated future date.

applies_to_condition
  If the claim is limited by a condition (who it applies to, when, subject to what), quote that
  condition here, verbatim. Do not paraphrase and do not attempt to interpret it.
  If there is no condition, use null.

evidence_quote
  Must be an EXACT substring of the input text, copied character for character. If you cannot
  quote it exactly, do not emit the rule.

extraction_confidence
  LOW whenever: the text is vague or hedged; assertion_type is STATES_BOTH; the value is implied
  rather than stated; or you are unsure of the concept. When in doubt, choose LOW.
  LOW findings are shown to a human and never auto-patched, so LOW is cheap and safe.

WHAT NOT TO EMIT
  - Do not emit a rule for a bare number with no legal subject ("clause 63", "Form 63", "page 63").
  - Do not emit a rule you inferred from background knowledge but that the text does not state.
  - Do not normalise, correct or update values. Report what the document says, even if wrong.
```

## User message

```
SEGMENT LOCATOR: {{LOCATOR}}
SEGMENT TEXT:
{{TEXT}}
```

---

## Post-processing (deterministic, in `rules.js` — not the model's job)

1. Validate against the JSON schema. On failure: discard, store segment with no rules.
2. Reject any `concept` not present in `concepts.json`. Coerce to `null`.
3. Locate `evidence_quote` in the raw text with `indexOf`. If not found → discard the rule
   (the model paraphrased). If found → store `evidence_start` / `evidence_end` offsets.
   **We store offsets, never the copied string** — offsets survive re-rendering and can be verified.
4. Set `has_qualifier` by scanning the segment against `concepts.json → qualifier_patterns`.
   This is regex, not model judgement.
5. Force `extraction_confidence = "LOW"` if `assertion_type === "STATES_BOTH"`.

## Test fixtures for this prompt

Keep these in `backend/prompts/__fixtures__/` and assert on them before trusting extraction.

| input | expected |
|---|---|
| "The statutory retirement age is 63." | 1 rule, retirement_age, STATES_LAW, PRESENT, HIGH |
| "Before 1 July 2026, the retirement age was 63." | 1 rule, HISTORICAL |
| "Refer to clause 63 of the Staff Manual." | `[]` |
| "Our policy is to offer re-employment until age 70." | 1 rule, reemployment_age, STATES_POLICY |
| "...at 63, unless the employee is medically unfit." | 1 rule, applies_to_condition non-null |
| "Employees are entitled to reasonable notice." | `[]` or concept null |
