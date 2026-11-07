# Business case (skeleton)

Owner: Person 4. Every number needs a **source or a stated assumption**. Judges review the assumptions.
A spreadsheet or an app page is fine; keep this file as the written explanation.

## 1. Inputs (fill in with sourced figures for a mid-sized European motor insurer)

| Assumption | Value | Source / reasoning |
|---|---|---|
| Motor own-damage claims per year | | |
| Avg. reviewer minutes per claim today (triage step only) | | |
| Fully loaded reviewer cost per hour (EUR) | | |
| Share of claims the system routes to routine | | from our v1/v2 runs |
| Minutes per claim with the system (routine / info / review) | | |
| Build + run cost of the system per year | | |
| Cost of a wrong routine recommendation (leakage, fraud, rework) | | |
| Cost of an unnecessary escalation (reviewer time) | | |
| Cost of a policy change today (spec, IT, testing, re-review) | | |
| Cost of a policy change with our system (config + automated replay) | | |

## 2. Outputs

- Annual triage cost today vs with the system
- Net annual benefit and payback period (months)
- Cost of errors under v1 and v2, using **measured** error rates from `engine/report.py`
- Threshold logic: because wrong routine ≫ unnecessary escalation, show the cost curve for a stricter vs looser quote limit
- Cost of the v2 change today vs with the system

## 3. Sensitivity

Show best / base / worst cases for the 2–3 assumptions that move the result most.

## 4. Second check near the limit (threshold logic)

Routine claims just under the quote limit stay routine (the policy decides), but are flagged for a person to double-check. The band and its justification live in `src/lib/second-check.ts`. **The figures below are placeholders: replace them with sourced numbers.**

| Assumption | Value now | Meaning |
|---|---|---|
| `ESTIMATE_UPLIFT` | 20% | How much a first repair quote can grow once the car is opened up. Band = limit / (1 + uplift) … limit, so €1,000.01–€1,200 under v2 and €1,250.01–€1,500 under v1. |
| `REVIEW_COST_EUR` | €15 | Reviewer time for one second check |
| `WRONG_ROUTINE_COST_EUR` | €300 | Average loss when a claim that needed review goes routine |

The check pays off when at least REVIEW_COST / WRONG_ROUTINE_COST (now 5%, i.e. 1 in 20) of the claims in the band would have needed review. Show this break-even in the pitch, plus the volume it adds for reviewers (count of flagged claims on the volume set).
