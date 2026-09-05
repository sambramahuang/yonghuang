# Fixtures

Write these **before** building the UI. They are the demo and they are the test suite.

Keep the prose short and plausible — a paragraph or two of surrounding text each. What matters is
that each file contains its **required sentence verbatim**, because the expected behaviour is
asserted against it.

## Internal artefacts

| file | type | must contain (verbatim) | why |
|---|---|---|---|
| `employee-handbook.docx` | handbook | "The statutory retirement age is 63." | the happy path — STRUCTURED → UPDATE_NEEDED → patch |
| `employee-handbook.docx` | " | "Before 1 July 2026, the statutory retirement age was 63." | **adversarial 1** — HISTORICAL, must not be patched |
| `offer-letter-template.docx` | template | "Employment continues until the statutory retirement age of 63." | second artefact for the same concept |
| `offer-letter-template.docx` | " | "Refer to clause 63 of the Staff Manual." | **adversarial 2** — bare number, must produce no finding |
| `hr-faq.docx` | faq | "Our policy is to offer re-employment until age 70." | **adversarial 3** — STATES_POLICY, flagged not patched |
| `hr-faq.docx` | " | "Re-employment is offered at 63, unless the employee is medically unfit." | **adversarial 4** — qualifier → LEGAL_REVIEW_REQUIRED |
| `hr-system-config.json` | config | `{ "hr": { "retirementAge": 63, "reemploymentAge": 68 } }` | **the differentiator** — a config field lighting up beside prose |

Optional fifth artefact if there is time: `onboarding-briefing.docx` (a "training material" —
author it as a DOCX with speaker notes, not a PPTX; PPTX parsing is out of scope).

## Regulatory updates

| file | change types | status |
|---|---|---|
| `regulatory/sg-rra-2026.json` | 2 × VALUE_CHANGED (retirement 63→64, re-employment 68→69) | **primary demo payload** |

Optional second payload if there is time: CPF Ordinary Wage ceiling $7,400 → $8,000, effective
1 January 2026 (source: CPF Board contribution rate table). It exercises `direction: CEILING`, and
the unchanged annual ceiling of $102,000 is a built-in false-positive trap.

## Expected findings for `sg-rra-2026.json`

Assert exactly this in integration test 1:

```
UPDATE_NEEDED         employee-handbook.docx      "The statutory retirement age is 63."
UPDATE_NEEDED         offer-letter-template.docx  "...statutory retirement age of 63."
UPDATE_NEEDED         hr-system-config.json       $.hr.retirementAge
UPDATE_NEEDED         hr-system-config.json       $.hr.reemploymentAge
POSSIBLE_IMPACT       hr-faq.docx                 "...re-employment until age 70."
LEGAL_REVIEW_REQUIRED hr-faq.docx                 "...at 63, unless the employee is medically unfit."

not actioned (HISTORICAL): employee-handbook.docx  "Before 1 July 2026..."
no finding at all:         offer-letter-template.docx "clause 63"
```

Any deviation from this list is a bug, not a judgement call.
