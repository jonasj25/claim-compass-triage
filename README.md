# Clearpath: trustworthy motor claims triage

Taktile case · thinc! Munich hackathon · 7–8 November 2026

Clearpath reads a motor claim and recommends one next step: **routine processing**, **request information** or **human review**. Every recommendation shows the facts and the rule behind it and records the policy version. Reviewers can correct any decision with a recorded reason. When the policy changes, open claims are re-checked and closed claims stay exactly as they were decided.

The rules decide; people confirm. AI helps people talk to customers and explains numbers, but it never makes or changes a decision.

> **Live app:** _add the published Lovable URL before submission_ · **Editor:** [Lovable project](https://lovable.dev/projects/8e82261d-79e5-4656-b04c-79ad82115985)

---

## For the judges: the batch run

Requires Python 3.9+, no dependencies.

```bash
python engine/triage.py path/to/claims.csv output/results.csv
```

It writes `case_id, recommendation_v1, recommendation_v2, needs_recheck, rule_v1, rule_v2, explanation`.
For closed claims `recommendation_v2` repeats the v1 decision and `needs_recheck` is `False`. Policies come from `policies/v1.json` and `policies/v2.json`.

**Same thing in the browser, no sign-in:** open **`/batch`** in the app, upload the CSV, and download the identical results file. Nothing is stored.

**Quality report (before/after):**

```bash
python engine/report.py data/dev_cases.csv
```

---

## Results

Measured on the labelled claims that ship with the repo: 14 provided dev cases and 37 hand-labelled edge cases.

| | Correct | Wrong routine (costly) | Unnecessary review |
|---|---|---|---|
| v1 rules, v1 labels (all 51) | **51 / 51** | 0 | 0 |
| v1 rules kept after the change (48 open) | 40 / 48 | 7 | 0 |
| **v2 rules, v2 labels (48 open)** | **48 / 48** | **0** | **0** |
| Only the claims whose label changed | 0 / 8 → **8 / 8** | | |
| Claims with blank fields | **all correct** under v1 and v2 | | |
| Closed claims | **3 / 3 keep their v1 decision** | | |

On the provided practice cases, v2 flags PRA-003 (€1,201), PRA-004 (€1,450), PRA-005 (EV) and PRA-006 (EV with a missing quote) for recheck. PRA-002 (exactly €1,200) stays routine; the closed PRA-009 and PRA-010 stay frozen.

The browser engine (TypeScript) and the batch engine (Python) give identical recommendations, rules and recheck flags on all 589 test claims. A test enforces this.

---

## The policy

Rules apply in order; the first match decides.

1. **Human review** if any of these is true: the policy was not active on the incident date; the claim is not motor own damage; an injury is reported, liability is disputed, the claim is a possible duplicate, or the evidence conflicts; the quote is above the limit; **(v2)** the repair is EV high-voltage battery work.
2. **Request information** if any field the policy uses is blank or unreadable. A blank is never guessed as yes or no.
3. **Request information** if the incident report or an itemized quote is missing.
4. **Routine processing** otherwise. This is not a payment approval.

| | v1 | v2 (change notice, Sat 18:00) |
|---|---|---|
| Quote limit | €1,500 (exactly €1,500 is routine) | **€1,200** (exactly €1,200 is routine) |
| EV high-voltage battery repairs | routine like any other | **always human review**, also when documents are missing |

- `needs_recheck` = an open claim whose next step changes between v1 and v2.
- Under v2 `repair_type` is a field the policy uses, so a blank repair type means "request information".
- Full reference: [`docs/POLICY.md`](docs/POLICY.md).

---

## What's in the app

### Customers (public, no sign-in)
- **Report a claim** (`/report`): by voice with **Mia**, an ElevenLabs voice agent that fills in the claim checklist live, or by form. The claim is triaged the moment it's submitted.
- **My claims** (`/status`): enter the number plate to see all your claims, where each one stands (**In review · Information needed · Accepted · Rejected**), what happens next and a customer-safe history.
- **Claim page** (`/claim/<id>`): rings when a reviewer starts a follow-up call; Mia asks only for the missing items and the claim is checked again automatically.

### Reviewer
- **To review:** a personal workstream grouped by reason, with priority, triggers like "€X over auto-limit", and a **Mine · Everyone · Unassigned** filter.
- **Case page:** decision with the rule and policy version, evidence and checklist, timeline, **override with a required reason** (recorded with reviewer, policy version and time), "Assign to me", what the customer sees.
- **Customer conversation** (pop-up, email): accept, deny, request documents, remind, all from templates; simulate the customer's reply to show the automatic re-check.
- **Automatic assignment:** every claim that needs a person goes straight to the reviewer with the fewest open claims.

### Policy owner
- **Policy:** the active rules in plain language, plus **New policy version** (a form, no JSON).
- **Change impact:** replays every claim under the draft, showing automation, reviewer load, quality against labels, open claims to recheck and closed claims kept. **Activate** re-decides open claims and flags the changed ones; rollback means activating the old version again.
- **Policy advisor:** tries every combination of quote limit and second-check margin on the current claims and recommends the one that is **no worse than today on cost, reviewer time, customer wait and expected losses**. Locked rules are never touched; raising the limit is marked as needing approval. An AI memo explains the result.
- **Versions:** every version with a plain-language diff; drafts can be deleted.

### Ops lead
- **Workload & flow:** queues, automation rate, why claims go to a person, claims received per day, decisions by policy version, and **assignment** (load per reviewer, even distribution of the backlog, assign a claim to a worker).
- **Quality:** the before/after report above, labelled-vs-recommended grid, mistakes, reviewer overrides, late outcomes, a **live monitoring plan** (signal, trigger, owner, next step), and an audit log export.
- **Business case:** see below.

### Data
- **Import CSV:** triages with the active policy and shows a window with only that file's claims. Optional extra columns `customer_name`, `plate` and `received_at` are stored; the batch ignores them.
- **Second check near the limit:** routine claims within **€70** of the quote limit stay routine, as the policy says, and get a person's check afterwards.

---

## Business case

**Value & ROI** (`/pitch`) answers the three questions of the brief on one page; **Business case** (`/business-case`) has every input editable. Both use the same model (`src/lib/business.ts`), and every input is tagged **sourced** (with link), **measured** (from this system) or **assumption**. Full write-up: [`docs/BUSINESS_CASE.md`](docs/BUSINESS_CASE.md).

Base case: a mid-sized insurer with 100,000 small own-damage claims a year (glass, parking, minor bodywork).

| | |
|---|---|
| Triage cost today → with Clearpath | **€1.12M → €625k per year** |
| Net benefit · payback | **€492k per year · 3.7 months** (conservative: €156k · 15 months) |
| Handled without a reviewer | **58%** of claims, 8.6 FTE freed |
| Wrong routine vs unnecessary review | **€275 vs €11** → escalate above a **3.9%** chance that a person is needed |
| Error cost per 1,000 claims (measured) | v1 rules kept after the change **€40k** · v2 **€0** |
| Cost of the v2 change | **€263k today** (6 weeks of stale rules + IT) vs **€8k** with the system |

---

## Architecture

```
            policies/v1.json, v2.json  (rules as data)
               /                         \
  engine/triage.py (Python)          src/lib/triage.ts (TypeScript)
  judges' batch CLI                  app + /batch page
        \                                /
         data/golden/decisions.json  ←  parity test: both engines must agree
                                          |
                     TanStack Start app (Lovable)  ──  Supabase (claims, decisions,
                                          |              overrides, outcomes, events,
                server functions ─────────┤              policy versions)
                  · public claim status / report intake (admin client, server-side)
                  · AI memo via Lovable AI gateway (LOVABLE_API_KEY, server only)
                  · voice via ElevenLabs (ELEVENLABS_API_KEY, server only)
```

### Guardrails
- Decisions come only from `decide()` with the active policy JSON; no rule exists outside the policy files.
- Blank or unreadable fields stay `null` from CSV to UI and are shown as "unknown".
- Every decision stores its policy version and rule ID; overrides, outcomes, events and comments are append-only.
- AI (memo, voice) explains and collects; it never chooses a recommendation.
- Closed claims are never re-evaluated.

---

## Running it

```bash
npm install          # or bun install
npm run dev          # the app
npm test             # app tests (117), including TypeScript ↔ Python parity
python tests/test_engine.py   # Python engine tests
```

Secrets are managed in Lovable: `SUPABASE_*`, `LOVABLE_API_KEY` (AI memo), `ELEVENLABS_API_KEY` and optionally `ELEVENLABS_VOICE_ID` (voice). Without the AI or voice keys those features fall back gracefully.

### Demo accounts (password `demo1234`)

| Role | Accounts |
|---|---|
| Reviewer | mara@demo.com · jonas@demo.com · lea@demo.com · ben@demo.com · aylin@demo.com · noah@demo.com · clara@demo.com |
| Policy owner | tobias@demo.com |
| Ops lead | sofia@demo.com |

Clicking the Clearpath logo signs you out and returns to the login page, which is a quick way to switch roles.

---

## Changing the policy

1. Edit `policies/v2.json`. This updates the Python batch **and** the `/batch` page.
2. In the app: **Policy → New policy version**, then check it on **Change impact** and **Activate**.
3. Add `expected_v2` labels to the labelled CSVs and run `python engine/report.py …`.
4. Run `python engine/export_golden.py`, then `python tests/test_engine.py && npm test`. Both must pass.

If a new kind of rule can't be expressed in the JSON, change **both** `engine/triage.py` and `src/lib/triage.ts`; the parity test proves they still match.

---

## Repo layout

```
engine/                Python engine: batch CLI, quality report, golden export, volume generator
policies/              policy versions as JSON
data/                  dev (14 labelled), practice (12), edge cases (37 hand-labelled), volume (500), golden/
tests/                 Python tests
docs/                  plan, policy reference, business case notes
src/lib/               engine (triage.ts), batch, quality, business model, advisor, assignment, statuses
src/routes/            pages: public (report, status, claim, batch) and signed-in (_authenticated/)
drizzle/, supabase/    database: managed by Lovable, do not edit by hand
```

## After launch

Second checks on every auto-processed claim within €70 of the limit; reviewer overrides and late outcomes become new labelled tests. The monitoring plan on the Quality page names the triggers (override rate, wrong routine found later, blank-field share, change in claim mix), who investigates, and who approves a policy change, which is always replayed on past claims before release. Next test before production: four weeks in shadow mode on real claims, comparing recommendations with reviewers' decisions.
