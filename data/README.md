# Demo data

Organised by role in the demo, not by area of law — on stage you open one
folder and everything in it is safe to pick.

## `firm-documents/`

The six documents the firm already holds. Seeded before the demo starts by
`npm run demo:reset`; they are not uploaded on stage.

Three employment, three cybersecurity. Two of them — the junior staff
agreement and the vendor checklist — are expected to stay unflagged, which is
the point: the system does not flag what a change does not touch.

## `amendments/`

The two changes in law uploaded during the demo, numbered in running order.
Both are short notices in Word, read by the model at upload.

| | affects |
|---|---|
| 1 — Restraint of Trade (MoneySmart 2024) | executive agreement, practice playbook |
| 2 — Cybersecurity Audit Deadline (Act 19 of 2024) | outsourcing agreement, compliance manual |

## `reference/`

Everything not used on stage: spare cybersecurity precedents, the notice-period
scenario, and the full 84-page Cybersecurity (Amendment) Act. The Act exceeds
the 500-paragraph ingestion limit, which is why the demo uploads a short notice
quoting it rather than the Act itself.
