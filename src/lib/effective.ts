// The recommendation a claim is handled under: the reviewer's override if there is one for the claim's
// current decision, otherwise the system's decision. Overrides stay in their own append-only table; this
// only decides what lists show and count. An override made on an earlier decision (before a policy
// change or a reopening) no longer applies once the claim has a new decision.
import type { Recommendation } from "./triage";

export interface OverrideRow {
  case_id: string;
  decision_id: string | null;
  original_recommendation: string | null;
  new_recommendation: string;
  reviewer: string | null;
  reason_code: string | null;
  reason_text: string | null;
  created_at: string;
}

/** Latest override that belongs to this decision. Overrides must be oldest first. */
export function overrideFor<T extends { decision_id?: unknown }>(
  decisionId: string | null | undefined,
  overrides: T[],
): T | null {
  for (let i = overrides.length - 1; i >= 0; i--) {
    const d = overrides[i].decision_id;
    if (d === null || d === undefined || d === decisionId) return overrides[i];
  }
  return null;
}

export function effectiveRec(row: {
  decision: { recommendation: Recommendation } | null;
  override?: { new_recommendation: string } | null;
}): Recommendation | null {
  return (
    (row.override?.new_recommendation as Recommendation | undefined) ??
    row.decision?.recommendation ??
    null
  );
}
