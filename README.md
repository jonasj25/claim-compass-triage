# Claim Compass: trustworthy claims triage

Taktile case, thinc! Munich hackathon, 7–8 November 2026.

Reads a fictional motor claim and recommends **routine_processing**, **request_information** or **human_review**. Every recommendation shows the facts and the policy rule behind it, carries its policy version, and can be overridden by a reviewer with a recorded reason. Policy changes are versioned: open cases are re-evaluated, closed cases stay frozen.

## Batch run (judging path)

Requires Python 3.9+. No dependencies.

```bash
python engine/triage.py path/to/claims.csv output/results.csv
```

This writes `case_id, recommendation_v1, recommendation_v2, needs_recheck, rule_v1, rule_v2, explanation`. For closed claims, `recommendation_v2` repeats the v1 decision and `needs_recheck` is `False`. Policies are read from `policies/v1.json` and `policies/v2.json` (override with `--v1` / `--v2`).

**Same thing in the browser, no sign-in:** open the app's **`/batch`** page (linked from the sign-in screen), upload a claims CSV, and click **Download results CSV**. The file has the same columns and values as the Python batch. Processing happens in the browser and nothing is stored. The page reads the same `policies/*.json` files, and `src/lib/parity.test.ts` checks that its recommendations, rules and `needs_recheck` match `engine/triage.py` on every case.

## Web app (reviewer, policy owner, ops lead)

Built with Lovable (TanStack Start + Supabase).

```bash
npm i        # or: bun install
npm run dev
```

Lovable editor: https://lovable.dev/projects/8e82261d-79e5-4656-b04c-79ad82115985. Changes made there are committed to this repo, and pushes to `main` sync back into Lovable.

## How the two halves fit together

| | Batch (judges) | App (people) |
|---|---|---|
| Engine | `engine/triage.py` | `src/lib/triage.ts` (`decide()`) |
| CSV parsing | `normalise()` in `engine/triage.py` | `src/lib/csv.ts` |
| Policy | `policies/v1.json`, `policies/v2.json` | `policy_versions.config` in Supabase (same JSON shape) |

The two engines must give the same answer for every claim. The parity check enforces this:

1. `python engine/export_golden.py` writes the Python decisions for every CSV in `data/` and every policy in `policies/` to `data/golden/decisions.json`.
2. `npm test` runs `src/lib/parity.test.ts`. It replays the same CSVs and policies through the TypeScript engine and fails on any difference. It also checks that `POLICY_V1` in `triage.ts` equals `policies/v1.json`.
3. `python tests/test_engine.py` fails if the golden file is stale.

Current status: both engines agree on all 589 cases (dev, practice, edge and volume) under both policy files.

## Tests and quality

```bash
python tests/test_engine.py                    # Python engine: labelled cases, edge cases, blanks, closed cases, parity file
npm test                                       # TypeScript engine + parity with Python
python engine/report.py data/dev_cases.csv     # accuracy, wrong-routine rate, unnecessary escalations, changed cases
```

## Changing the policy (e.g. v2 at Sat 18:00)

1. Edit `policies/v2.json`. This updates the Python batch **and** the website's `/batch` page.
2. Add the same config as a new version on the app's **Policy** page, so it lands in `policy_versions`.
3. Add an `expected_v2` column to the labelled CSVs, then run `python engine/report.py ...`.
4. Run `python engine/export_golden.py`, then `python tests/test_engine.py && npm test`. Both must pass.
5. Commit. Never add rules to code that are not in the policy JSON.

If v2 needs a new kind of rule that the JSON cannot express, change **both** `engine/triage.py` and `src/lib/triage.ts`. The parity test then proves they still match.

## Repo layout

```
engine/            Python engine: batch CLI, quality report, golden export, volume generator
policies/          policy versions as JSON (single source for the batch path)
data/              dev (14 labelled), practice (12), synthetic edge cases (37 hand-labelled), volume (500 unlabelled), golden/
tests/             Python tests
docs/              plan, policy reference, business case
src/lib/triage.ts  app engine (must match engine/triage.py)
src/lib/csv.ts     app CSV parsing (must match normalise())
src/routes/        app pages (claims, policy, impact, quality, business case, ...)
drizzle/, supabase/  database: managed by Lovable, do not edit by hand
```

## Design principles

- Structured fields decide. An LLM may extract facts or draft text, but never overrides the written policy.
- Blank or unreadable fields stay `null` from CSV to UI and are shown as "unknown". They are never coerced to false/0.
- Every decision carries its policy version and rule ID.
- Overrides, outcomes and case events are append-only.
