// One claim mix for every page that shows automation, reviewer load or money: Workload & flow,
// Business case and Investor view. Built from the live claims in the system the way Workload & flow
// counts them (open claims, the recommendation in force incl. reviewer overrides, flagged second checks),
// under the ACTIVE policy. The 500 synthetic demo claims are only used when the system has no claims,
// or when the Business case page is switched to them explicitly.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { BATCH_POLICY_V1, BATCH_POLICY_V2 } from "./batch";
import { isClosed } from "./csv";
import { activePolicyQuery, casesQuery, type CaseRow } from "./data";
import { effectiveRec } from "./effective";
import { RECS, rate, volumeMix, VOLUME_CLAIMS, type Mix } from "./quality";
import { secondCheckReason } from "./second-check";
import { decide, type Claim, type Policy, type Recommendation } from "./triage";

export interface ClaimMix extends Mix {
  /** Open claims flagged for a second check (auto-processed, near the limit) */
  second: number;
  secondShare: number;
}

/**
 * Mix of the live claims. With `whatIf`, claims nobody overrode are re-decided under that policy
 * (the quote limit explorer); claims a reviewer overrode keep the reviewer's decision.
 */
export function caseMix(
  cases: CaseRow[],
  policy: Policy,
  prev: Policy = BATCH_POLICY_V1,
  whatIf?: Policy,
): ClaimMix {
  const counts = { routine_processing: 0, request_information: 0, human_review: 0 } as Record<
    Recommendation,
    number
  >;
  let open = 0;
  let stale = 0;
  let changed = 0;
  let second = 0;
  const target = whatIf ?? policy;
  for (const c of cases) {
    if (isClosed(c.claim.case_status)) continue;
    open++;
    const rec =
      whatIf && !c.override
        ? decide(c.claim, whatIf).recommendation
        : (effectiveRec(c) ?? decide(c.claim, policy).recommendation);
    counts[rec]++;
    const now = decide(c.claim, target).recommendation;
    const before = decide(c.claim, prev).recommendation;
    if (now !== before) changed++;
    if (before === "routine_processing" && now === "human_review") stale++;
    const flagged = whatIf ? true : !!c.workflow?.qa_sample;
    if (flagged && secondCheckReason(c.claim, target, rec)) second++;
  }
  const share = Object.fromEntries(RECS.map((k) => [k, rate(counts[k], open)])) as Record<
    Recommendation,
    number
  >;
  return {
    n: cases.length,
    open,
    counts,
    share,
    staleWrongRoutine: stale,
    changed,
    second,
    secondShare: rate(second, open),
  };
}

/** Mix of a claim list without stored decisions (the synthetic demo set): every claim is decided now. */
export function claimListMix(
  claims: Claim[],
  policy: Policy,
  prev: Policy = BATCH_POLICY_V1,
): ClaimMix {
  const m = volumeMix(policy, prev, claims);
  let second = 0;
  for (const c of claims)
    if (!isClosed(c.case_status) && secondCheckReason(c, policy, decide(c, policy).recommendation))
      second++;
  return { ...m, second, secondShare: rate(second, m.open) };
}

export type MixSource = "live" | "demo";

/** The shared mix for a page. `source` defaults to the live claims when there are any. */
export function useClaimMix(source?: MixSource) {
  const { data: cases = [], isLoading } = useQuery(casesQuery);
  const { data: active } = useQuery(activePolicyQuery);
  const policy = active ?? BATCH_POLICY_V2;
  const hasLive = cases.length > 0;
  const use: MixSource = source === "demo" || !hasLive ? "demo" : "live";
  const mix = useMemo(
    () => (use === "live" ? caseMix(cases, policy) : claimListMix(VOLUME_CLAIMS, policy)),
    [use, cases, policy],
  );
  return { mix, policy, source: use, hasLive, cases, isLoading, liveCount: cases.length };
}
