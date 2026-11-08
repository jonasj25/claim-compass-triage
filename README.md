# Clearpath: trustworthy motor claims triage

Taktile case · thinc! Munich hackathon · 7–8 November 2026

Clearpath reads a motor claim and recommends one next step: **routine processing**, **request information** or **human review**. Every recommendation shows the facts and the rule behind it, and records the policy version it was made under. Reviewers can correct any decision with a recorded reason. When the policy changes, open claims are checked again and closed claims stay exactly as they were decided.

The rules decide; people confirm. AI helps us talk to customers and read documents, but it never makes or changes a decision.

## Submission

| | |
|---|---|
| **Team name** | Wallah, We Code |
| **Case** | Taktile: Trustworthy claims triage |
| **GitHub repository** | https://github.com/jonasj25/claim-compass-triage (public) |

Lovable editor (team access only): [Lovable project](https://lovable.dev/projects/8e82261d-79e5-4656-b04c-79ad82115985)

---

## For the judges: three things to try

1. **Report a claim as a customer**, by form or by talking to our voice agent Mia. Use one of the three registered customers below.
2. **Run your own CSV** through our engine with the **Judges: batch run** button. No sign-in needed.
3. **Sign in** with one of the three demo accounts and look around each role's part of the app.

### 1. Report a claim as a customer

On the login page, click **Customer view: report a claim**. You can fill in the form or talk to **Mia**, an AI voice agent who asks the questions and fills in the claim checklist as you speak.

Only registered customers can report a claim. Use one of these three:

| Name | Email | Number plate |
|---|---|---|
| John | john123@gmail.com | M-JO 4821 |
| Anna | anna123@gmail.com | M-AN 2735 |
| Marko | marko123@gmail.com | M-MK 9164 |

- **The form** asks for your name and email first, then your number plate. It only continues when all three match a registered customer.
- **Mia** asks for your name and number plate.
- The number plate is never filled in for you. You have to type it or say it, which is how we check that you are who you say you are.
- You can upload documents (repair quote, police report). Clearpath reads them and fills in the claim details it finds. Name, email and number plate are never taken from a document.

The claim is triaged the moment it's submitted. Afterwards, open **My claims** (`/status`) and enter the number plate to see where the claim stands, what happens next, and to upload anything that's still missing.

### 2. Run your own CSV: Judges batch run

Click **Judges: batch run without signing in** on the login page (or open `/batch`; signed-in users also find **Batch run (judges)** in the sidebar).

1. Upload your claims CSV in the format from the case brief.
2. Every claim is triaged under policy **v1** and **v2**. Closed claims keep their v1 decision.
3. Click **Download results CSV**. It has the columns `case_id, recommendation_v1, recommendation_v2, needs_recheck, rule_v1, rule_v2, explanation`.

Your file is processed in your browser. Nothing is uploaded or stored. The page uses the same rules and gives the same results as our Python batch script (see [For developers](#for-developers)).

### 3. Demo accounts (password `demo1234`)

| Role | Account |
|---|---|
| Reviewer | Mara Klein · mara@demo.com |
| Policy owner | Tobias Brandt · tobias@demo.com |
| Ops lead | Sofia Lang · sofia@demo.com |

Click the account on the login page to sign in. Access follows the hierarchy: the **ops lead** can open every section, the **policy owner** the policy owner and reviewer sections, a **reviewer** only the reviewer section. The role tabs at the top are always visible; opening a section your account can't see tells you which role to sign in as. Click the Clearpath logo at the top left to sign out and switch accounts.

---

## A tour of the app

### Customer side (no sign-in)
- **Report a claim** (`/report`): the form or Mia, described above.
- **My claims** (`/status`): all claims for a number plate, each with its status (**In review · Information needed · Accepted · Rejected**), what happens next, and an upload for missing documents. A new document is read, stored with the claim, and the claim is checked again.
- **Follow-up call**: when a reviewer needs more information, Mia calls the customer back, asks only for the missing items, and the claim is checked again automatically.

### Reviewer
- **Workstream (To review)**: your claims, grouped by why they need a person, sorted by priority, with the reason in plain words (for example "€230 over the auto-limit"). Filter by **Mine · Everyone · Unassigned**.
- **All claims**: every claim in the system, whatever its status, including auto-processed and closed ones.
- **Case page**: what happened, the policy checklist with the rule and version that decided, the evidence and where each fact came from, comments and a timeline. From here a reviewer can:
  - **override** the recommendation (a reason is required; the override is recorded and shown everywhere the claim appears)
  - talk to the customer from templates (accept, deny, request documents, remind) or start Mia's follow-up call
  - **reopen** a finished claim with a reason
- **Automatic assignment**: every claim that needs a person goes to the reviewer with the fewest open claims.

### Policy owner
- **Policy**: the active rules in plain language ("How a claim is decided"), and **New policy version**, a simple form to change a rule (no code, no JSON). It is saved as a draft and changes nothing yet.
- **Change impact**: replays every claim under the draft and shows what would change: how many claims are auto-processed, the load on reviewers, open claims whose next step changes (flagged for recheck), and closed claims that are kept. **Activate** makes the draft live.
- **Quality**: the before-and-after quality report on the labelled test claims. Per policy version it shows the share of correct next steps, wrong auto-processing and unnecessary escalations, with the claims the change affects and the claims with blank fields shown separately. It lists every claim the rules get wrong (wrong auto-processing marked), how often reading real customer reports leads to a wrong step, and how quality keeps being measured after launch: second checks, reviewer corrections, outcomes that arrive later, and replaying every policy change before release.
- **Policy advisor**:
  - The **Quote limit explorer** shows what a different auto-processing limit would mean for automation, reviewer workload and net benefit.
  - The advisor tries every combination of quote limit and second-check margin, and recommends one that is **no worse than today on cost, reviewer time, customer wait and expected losses**.
  - Rules about red flags, claim types and documents are locked. Raising the limit above the written policy is marked as needing approval.
  - An AI memo explains the result in words; the numbers come from the calculation, not from the AI.
- **Versions**: every policy version with a plain-language list of what changed.

### Ops lead
- **Workload & flow**: open claims by queue, the share handled without a reviewer, why claims go to a person, claims received per day, decisions by policy version, claims to recheck after a policy change, and how work is spread across reviewers.
- **Value & ROI**: the three questions of the business case on one page: what triage costs today, what it costs with Clearpath, and what a policy change costs.
- **Business case**: the same model with every input editable. Each number is marked **sourced** (with a link), **measured** (from this system) or **assumed**, and the page recalculates as you change them.

### Data (sidebar, every role)
- **Import CSV**: adds claims to the system, triaged with the active policy and routed to the right queue. Closed claims keep their decision.
- **Export results CSV**: downloads every claim with its current recommendation, including reviewer overrides.
- **Batch run (judges)**: the judges' page from step 2.

---

## How a claim is decided

The rules apply in order; the first one that matches decides.

1. **Human review** if any of these is true: the policy was not active on the incident date; the claim is not motor own damage; an injury is reported, liability is disputed, the claim is a possible duplicate, or the evidence conflicts; the repair quote is above the limit; **(v2)** the repair is EV high-voltage battery work.
2. **Request information** if any field the policy uses is blank or unreadable. A blank is never guessed as yes or no.
3. **Request information** if the incident report or an itemized quote is missing.
4. **Routine processing** otherwise. This is not a payment approval.

| | v1 | v2 (change notice, Saturday 18:00) |
|---|---|---|
| Quote limit | €1,500 (exactly €1,500 is routine) | **€1,200** (exactly €1,200 is routine) |
| EV high-voltage battery repairs | routine like any other | **always human review**, also when documents are missing |

- `needs_recheck` means an open claim whose next step changes between v1 and v2.
- Routine claims within **€70** of the quote limit stay routine, as the policy says, and get a second check by a person afterwards.
- Full reference: [`docs/POLICY.md`](docs/POLICY.md).

### Guardrails
- Decisions come only from the rules in the active policy; no rule exists outside the policy files.
- Blank or unreadable fields stay blank all the way through and are shown as "unknown".
- Every decision stores its policy version and rule. Overrides, outcomes, events and comments can be added, never edited or deleted.
- AI (Mia, the document reader, the advisor memo) explains and collects information. It never chooses a recommendation.
- Closed claims are never re-decided.

---

## For developers

### The batch run on the command line

Requires Python 3.9+, no dependencies.

```bash
python engine/triage.py path/to/claims.csv output/results.csv   # same output as the /batch page
python engine/report.py data/dev_cases.csv                      # quality report against the labelled claims
```

Policies come from `policies/v1.json` and `policies/v2.json`.

### Architecture

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
                  · public claim status / report intake (server-side only)
                  · document reading and advisor memo via the Lovable AI gateway
                  · voice via ElevenLabs
```

### Running it locally

```bash
npm install          # or bun install
npm run dev          # the app
npm test             # app tests, including the TypeScript ↔ Python parity test
python tests/test_engine.py   # Python engine tests
```

Secrets are managed in Lovable: `SUPABASE_*`, `LOVABLE_API_KEY` (AI), `ELEVENLABS_API_KEY` and optionally `ELEVENLABS_VOICE_ID` (voice). Without the AI or voice keys those features fall back gracefully.

### Changing the policy

1. Edit `policies/v2.json`. This updates the Python batch **and** the `/batch` page.
2. In the app: **Policy → New policy version**, check it on **Change impact**, then **Activate**.
3. Add `expected_v2` labels to the labelled CSVs and run `python engine/report.py …`.
4. Run `python engine/export_golden.py`, then `python tests/test_engine.py && npm test`. Both must pass.

If a new kind of rule can't be expressed in the JSON, change **both** `engine/triage.py` and `src/lib/triage.ts`; the parity test proves they still match.

### Repo layout

```
engine/                Python engine: batch CLI, quality report, golden export, volume generator
policies/              policy versions as JSON
data/                  labelled dev cases, practice cases, edge cases, volume set, golden/
tests/                 Python tests
docs/                  plan, policy reference, business case notes
src/lib/               engine (triage.ts), batch, quality, business model, advisor, assignment, statuses
src/routes/            pages: public (report, status, claim, batch) and signed-in (_authenticated/)
drizzle/, supabase/    database: managed by Lovable, do not edit by hand
```

### After launch

Second checks on every auto-processed claim within €70 of the limit. Reviewer overrides and late outcomes become new labelled tests. Every policy change is replayed on past claims before it goes live. The next step before production is four weeks in shadow mode on real claims, comparing Clearpath's recommendations with reviewers' decisions.
