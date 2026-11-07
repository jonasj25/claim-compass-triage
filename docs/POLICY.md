# Policy reference

## v1 (in force from the start)

Rules run in order; the first match wins. Every decision records the policy version and the rule.

| Rule | Outcome | Condition |
|---|---|---|
| v1.R1 | `human_review` | policy not active on incident date; OR claim_type ≠ `motor_own_damage`; OR injury_reported / liability_disputed / duplicate_flag / evidence_conflict = True; OR quote_eur **>** €1,500 |
| v1.BLANK | `request_information` | a field the policy uses is blank/unreadable, and no known R1 trigger exists |
| v1.R2 | `request_information` | incident_report_present = False OR itemized_quote_present = False |
| v1.R3 | `routine_processing` | otherwise (enters the normal downstream process; **not** a payment approval) |

Key points:

- Structured fields are the source of truth. `claim_summary` is descriptive only.
- A known human-review reason beats a missing document.
- Blank = absent fact. Never turn it into False or 0. Ask for information unless a known fact already requires human review.
- €1,500 exactly → routine. €1,500.01 → human review.
- v1 ignores `repair_type` (EV battery work is routine under v1).
- `case_status` does not change the v1 decision. It matters for the policy change: closed cases keep their v1 decision.

## v2 (change notice, released Sat 18:00)

Two changes. All other v1 rules and their order stay in force.

1. The routine quote limit falls from €1,500 to €1,200. Exactly €1,200 is still routine; €1,201 needs human review.
2. Any claim with `repair_type = ev_high_voltage_battery` needs human review, whatever the quote. This known trigger beats missing documents.

Effective for all open claims (after being processed by v1). Closed claims keep their historical v1 decision and must not be rewritten. Judges do not count closed claims in the v2 accuracy score; they check that closed claims still show their v1 decision.

Consequence of our blank-field rule: `repair_type` is now a field the policy uses, so a blank repair type is an absent fact → request information (unless another known trigger requires human review).

`needs_recheck` = open claim whose next-step recommendation changes between v1 and v2 (the notice: "identify open claims whose next-step recommendation changes").

Where v2 lives:
- `policies/v2.json` → Python batch (`engine/triage.py`) and the website's `/batch` page
- The app's database → create it on the Policy page (limit 1200, tick "The repair is EV high-voltage battery work"), then activate it on Change impact

Labels: `expected_v2` in `data/dev_cases.csv` and `data/synthetic_edge_cases.csv`, written by hand from the notice. `python engine/report.py data/dev_cases.csv` shows the before/after comparison.
