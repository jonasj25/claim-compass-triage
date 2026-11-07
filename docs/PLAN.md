# Team plan

Hand-in: **Sunday 15:00**. Policy change: **Saturday 18:00**.

## Roles

| Who | Owns |
|---|---|
| Tech lead | Rules engine and batch CLI (`engine/`), tests, policy-change implementation, repo/README, integration |
| Dev 2 | Lovable frontend: Reviewer queue + case detail + override form; Policy owner editor + impact diff; Ops quality dashboard |
| Dev 3 | Supabase (schema managed by Lovable in `drizzle/migrations`), override audit trail, outcomes table, LLM assist via the Lovable AI gateway (fact extraction + explanation drafts, never decides) |
| Person 4 | Business case (25% of score!), monitoring plan, demo script, pitch |

## Timeline

**Saturday**

- 14:00–15:00: kickoff, Supabase project, Lovable project connected to this repo, schema applied, questions for the mentor
- 15:00–18:00: core flow. Batch passes all tests; UI shows queue, case detail and override; decisions/overrides are written to Supabase; business-case skeleton
- **18:00–19:00: policy change.** Write `policies/v2.json`, hand-label `expected_v2` for all dev and practice cases plus ~10 synthetic edge cases, run `engine/report.py`, check the impact diff
- 19:00–23:30: change-control screen, before/after quality report, LLM assist, error rates fed into the business case
- Sleep (minimum 5 hours)

**Sunday**

- 08:30–12:00: bug fixes; fresh clean checkout plus new synthetic CSV run; README; final business case and monitoring plan
- **12:00: feature freeze**
- 12:00–14:00: rehearse the demo twice, record a backup video
- 14:00–15:00: buffer, submit the repo link

## Demo script (Sunday)

1. Easy case → routine, with rule trace and policy version
2. Incomplete case → request information (including a blank-field case)
3. Case affected by v2 → needs recheck; closed case shown as frozen
4. Live override: correction + reason + reviewer + policy version recorded
5. Before/after quality report (changed cases shown separately; wrong-routine rate highlighted)
6. Business case
7. Key trade-off (escalate when unsure: wrong routine ≫ unnecessary escalation) and the next test before production

## Guardrails

- The LLM never changes a recommendation. It suggests facts (marked unconfirmed, with the source snippet) and drafts text.
- Blank fields are never defaulted.
- Overrides and outcomes are append-only.
- Every decision row carries `policy_version` and `rule_id`.
