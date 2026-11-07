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

## v2 (announced Sat 18:00)

_To be filled in at 18:00._ Edit `policies/v2.json`, then add an `expected_v2` column to the labelled data and run the report.

Hypotheses from the data (do **not** hardcode before the announcement):

- the quote limit may drop to €1,200 (PRA-002 = €1,200, PRA-003 = €1,201, DEV-010 says "original €1,500 boundary")
- `ev_high_voltage_battery` repairs may require human review (DEV-011, PRA-005, PRA-006, PRA-010)
- closed cases PRA-009 (€1,350) and PRA-010 (EV) would change under either rule. They must stay frozen.

Questions for the mentor at 18:00:

1. Does `needs_recheck` mean "the recommendation changed", or also "the changed rule touched the case but the outcome stayed the same"?
2. How should a blank `case_status` be treated? (Current choice: as open, so it is rechecked rather than silently frozen.)
