// Second check for routine claims just under the quote limit.
//
// This is operational quality control, NOT a triage rule: the recommendation stays exactly what the
// written policy says (routine_processing). The claim is only flagged so a person double-checks it
// after the fact, using the same flow as a random QA sample.
//
// Threshold: a routine claim whose quote is within MARGIN_EUR below the limit (limit - 70 < quote <= limit).
// With the v2 limit of EUR 1,200 that is EUR 1,130.01 - 1,200; with v1 (EUR 1,500) EUR 1,430.01 - 1,500.
// Rationale: a small correction to the quote after the car is opened up would push these claims over
// the limit, so they are the routine claims most likely to have needed a person.
import type { Claim, Policy, Recommendation } from "./triage";

export const SECOND_CHECK = {
  MARGIN_EUR: 70,
} as const;

export interface Band {
  from: number; // exclusive
  to: number; // inclusive (the limit itself)
}

export function secondCheckBand(policy: Policy): Band | null {
  const limit = policy.human_review.quote_limit_eur;
  if (limit === null || limit === undefined) return null;
  return { from: Math.max(0, limit - SECOND_CHECK.MARGIN_EUR), to: limit };
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
  if (q === band.to)
    return `Quote ${eur(q)} is exactly at the ${eur(band.to)} limit. Auto-processed as the policy says, plus a second check.`;
  return `Quote ${eur(q)} is only ${eur(band.to - q)} under the ${eur(band.to)} limit. Auto-processed as the policy says, plus a second check.`;
}
