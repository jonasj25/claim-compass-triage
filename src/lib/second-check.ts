// Second check for routine claims just under the quote limit.
//
// This is operational quality control, NOT a triage rule: the recommendation stays exactly what the
// written policy says (routine_processing). The claim is only flagged so a person double-checks it
// after the fact, using the same flow as a random QA sample.
//
// Where the threshold comes from (all figures are stated assumptions, replace with sourced ones in
// docs/BUSINESS_CASE.md):
//   * A first repair quote often grows once the car is opened up (hidden damage). We assume final
//     costs can be up to ESTIMATE_UPLIFT above the quote. A quote q is "at risk" if q x (1 + uplift)
//     would cross the limit, i.e. q > limit / (1 + uplift). With a EUR 1,200 limit and 20% uplift
//     the band is EUR 1,000.01 - 1,200.
//   * A second check costs about REVIEW_COST_EUR of reviewer time. Letting through a claim that should
//     have gone to a person costs about WRONG_ROUTINE_COST_EUR. The check pays off when at least
//     REVIEW_COST / WRONG_ROUTINE_COST (here 1 in 20) of the claims in the band would have needed review.
import type { Claim, Policy, Recommendation } from "./triage";

export const SECOND_CHECK = {
  ESTIMATE_UPLIFT: 0.2,
  REVIEW_COST_EUR: 15,
  WRONG_ROUTINE_COST_EUR: 300,
} as const;

export const breakEvenShare = SECOND_CHECK.REVIEW_COST_EUR / SECOND_CHECK.WRONG_ROUTINE_COST_EUR;

export interface Band {
  from: number; // exclusive
  to: number; // inclusive (the limit itself)
}

export function secondCheckBand(policy: Policy): Band | null {
  const limit = policy.human_review.quote_limit_eur;
  if (limit === null || limit === undefined) return null;
  return { from: Math.round((limit / (1 + SECOND_CHECK.ESTIMATE_UPLIFT)) * 100) / 100, to: limit };
}

const eur = (n: number) => "€" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Reason text if this claim should get a second check, otherwise null. */
export function secondCheckReason(
  claim: Pick<Claim, "quote_eur">,
  policy: Policy,
  rec: Recommendation,
): string | null {
  const band = secondCheckBand(policy);
  const q = claim.quote_eur;
  if (!band || rec !== "routine_processing" || q === null || q === undefined) return null;
  if (q <= band.from || q > band.to) return null;
  const pct = Math.round(SECOND_CHECK.ESTIMATE_UPLIFT * 100);
  return `Quote ${eur(q)} is close to the ${eur(band.to)} limit: a ${pct}% cost increase during repair would cross it. Routine as the policy says, plus a second check.`;
}
