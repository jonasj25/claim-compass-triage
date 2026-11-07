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

Routine claims just under the quote limit stay routine (the policy decides), but are flagged for a person to double-check. Setting: `MARGIN_EUR = 50` in `src/lib/second-check.ts`.

- Band: quote within €50 below the limit. v2: €1,150.01–€1,200; v1: €1,450.01–€1,500.
- Why: a small correction to the quote after the car is opened up would push these claims over the limit, so they are the routine claims most likely to have needed a person.
- For the pitch: show how many claims this adds for reviewers (count flagged on the volume set) against the cost of one wrong routine decision. The check pays off if (cost of a check) / (cost of a wrong routine decision) is smaller than the share of flagged claims that really needed review.
