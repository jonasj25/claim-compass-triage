# Business case

The model lives in `src/lib/business.ts` (pure functions, unit-tested in `business.test.ts`). The app shows it twice from the same code:
**Value & ROI** (`/pitch`, the one-page answer) and **Business case** (`/business-case`, every input editable).
All numbers below are the defaults, on fixed inputs so they are reproducible: the 500-claim demo mix (`data/synthetic_volume.csv`, 308 open claims) under v2, and the labelled test set (14 provided + 37 hand-labelled cases).

## Who we model

A mid-sized European (German) motor insurer with **100,000 small own-damage claims a year**: glass, parking and minor bodywork, the high-volume, low-value segment where rules-based triage pays off. Anchor: German insurers pay about 2.2 million glass claims a year at roughly €900 each (GDV). Our demo claims average €856, which fits that segment. Large claims (average own-damage collision €4,000+) always go to a person anyway.

## Inputs

| Input | Value | Kind | Basis |
|---|---|---|---|
| Small own-damage claims per year | 100,000 | assumption | 2–3% market share of the segment; GDV: ~2.2M glass claims/year |
| Claims handler gross salary | €55,000 | sourced | gehalt.de median ~€62k, StepStone €40–58k |
| Employer load | ×1.3 | assumption | German social charges and workplace |
| Productive hours per handler | 1,600 h | assumption | after holidays, sickness, training |
| → Cost per handler hour | €44.69 | derived | |
| Manual triage per claim today | 15 min | sourced | industry: 15–20 min per motor FNOL by hand (low end) |
| Reviewer time per escalated claim | 15 min | assumption | escalated claims still get a full look |
| Information request | 2 min | assumption | templated, reply re-checked automatically |
| Second check near the limit | 8 min | assumption | |
| Average claim that needed a person | €1,100 | measured | average quote of claims sent to a person under v2 in the demo set (€1,094) |
| Avoidable loss if such a claim goes routine | 25% | assumption | duplicate / expired policy / not covered = full loss, inflated quote = partial; GDV: ~10% of claim reports suspicious |
| Platform and running cost | €120,000 / year | assumption | licence, hosting, monitoring, part-time rule owner |
| One-off implementation | €150,000 | assumption | integration, data mapping, testing |
| Rule change today | 6 weeks, 20 person-days at €800 | assumption | specification, IT change, test, release window |
| Rule change with the system | 2 hours | measured | v2 took minutes in the prototype (draft → replay → approve → activate) |

## 1. Annual cost of triage

| | Per year |
|---|---|
| Today: 100,000 × 15 min × €44.69/h | **€1.12M** (15.6 FTE) |
| With Clearpath: 42% reviewed (15 min), 19% info requests (2 min), 2% second checks (8 min), plus €120k platform | **€625k** (7.0 FTE) |
| **Net benefit** | **€492k per year**, 8.6 FTE freed |
| **Payback** on €150k implementation | **3.7 months** |

58% of claims need no reviewer (40% routine, 19% automatic information request).

Sensitivity:

| Scenario | Changes | Net benefit | Payback |
|---|---|---|---|
| Conservative | 12 min triage today, 8 min per info request, platform €150k, implementation €200k | €156k | 15.4 months |
| **Base** | as above | **€492k** | **3.7 months** |
| Optimistic | 18 min triage today, 12 min reviews, platform €100k | €829k | 2.2 months |

Not counted in the net benefit: error savings (section 2), faster payouts, fewer customer calls.

## 2. Cost of errors (measured error rates)

Unit costs: a **wrong routine decision costs €275** (25% of a €1,100 claim); an **unnecessary review costs €11** (15 min). Ratio about **25 : 1**.

| Rules (labelled set) | Correct | Wrong routine | Unnecessary review | Error cost per 1,000 claims |
|---|---|---|---|---|
| v1 rules, v1 labels (51) | 51 | 0 | 0 | €0 |
| v1 rules kept after the change (48 open) | 40 | 7 (14.6%) | 0 | **€40,104** |
| v2 rules (48 open) | 48 | 0 | 0 | €0 |

Caveats: 0 errors on 48 claims means the true rate is below about 6% with 95% confidence (rule of three), not zero. The labelled set is rich in edge cases; on the realistic demo mix, stale v1 rules would wrongly wave through 7.8% of claims.

**How this sets the thresholds.** Escalating pays as soon as the chance that a person is needed exceeds 11 / (11 + 275) = **3.9%**. Hence: any red flag goes to a person, a blank field is asked for (never guessed), and routine claims within €70 of the quote limit get a second check (5 of 308 demo claims), because a small correction to the quote would push them over the limit.

## 3. Cost of a policy change (v2 as the example)

v2 lowers the routine quote limit from €1,500 to €1,200 and sends every EV high-voltage battery repair to a person. Under v1, 24 of 308 open demo claims (7.8%) would be routine although v2 sends them to a person. At 100,000 claims a year that is **€41k of exposure per week** the old rules stay live.

| | Today | With Clearpath |
|---|---|---|
| Time until live | 6 weeks | same day |
| Effort | 20 person-days, €16,000 | 2 hours, €89 |
| Exposure while stale | 6 weeks × €41k = €247k | 1 working day = €8k |
| Open claims to recheck | manual search | 37 of 308 flagged automatically, closed claims untouched |
| **Total** | **€263k** | **€8.3k** |

The exposure scales with the avoidable-loss share: €115k at 10%, €511k at 50%.

## Second check near the limit

Routine claims just under the quote limit stay routine (the policy decides), but are flagged for a person to double-check. Setting: `MARGIN_EUR = 70` in `src/lib/second-check.ts`. Band: v2 €1,130.01–€1,200; v1 €1,430.01–€1,500.

## Sources

- GDV via web.de: ~2.2 million glass claims, almost €2 bn: https://web.de/magazine/auto/windschutzscheiben-bremsleuchten-glasbruch-autos-teuer-41560612
- GDV via cash-online: ~10% of claim reports suspicious, ~2.7% confirmed fraud: https://www.cash-online.de/a/5-milliarden-euro-schaeden-durch-versicherungsbetrug-671526/
- SwiftCase: 15–20 min handler time per motor FNOL: https://swiftcase.co.uk/2026/03/02/fnol-automation-guide/
- gehalt.de / StepStone: claims handler salaries (links on the Business case page)
- Ayvens/LeasePlan 2024: average own-damage rear-end collision ~€4,600 (context for large claims): https://www.ayvens.com/de-de/ueber-uns/presse/presseinformationen/presseinfos-2025/versicherungsbilanz/
