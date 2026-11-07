// Browser version of the judges' batch path: same input CSV, same results CSV as `python engine/triage.py`.
// Mirrors evaluate() in engine/triage.py. Policies come from the same files: policies/v1.json, policies/v2.json.
// parity.test.ts checks every column except the free-text explanation against the Python engine.
import v1Json from "../../policies/v1.json";
import v2Json from "../../policies/v2.json";
import { isClosed, toCsv, type ParsedClaim } from "./csv";
import { decide, type Policy, type Recommendation } from "./triage";

export const BATCH_POLICY_V1 = v1Json as Policy;
export const BATCH_POLICY_V2 = v2Json as Policy;

export const BATCH_COLUMNS = [
  "case_id",
  "recommendation_v1",
  "recommendation_v2",
  "needs_recheck",
  "rule_v1",
  "rule_v2",
  "explanation",
] as const;

export interface BatchRow {
  case_id: string;
  recommendation_v1: Recommendation;
  recommendation_v2: Recommendation;
  needs_recheck: boolean;
  rule_v1: string;
  rule_v2: string;
  explanation: string;
  closed: boolean;
}

export function evaluateClaim(c: ParsedClaim, p1: Policy, p2: Policy): BatchRow {
  const d1 = decide(c, p1);
  const why1 = `[${p1.version}] ${d1.reasons.join("; ")}`;
  if (isClosed(c.case_status)) {
    return {
      case_id: c.case_id,
      recommendation_v1: d1.recommendation,
      recommendation_v2: d1.recommendation,
      needs_recheck: false,
      rule_v1: d1.rule_id,
      rule_v2: d1.rule_id,
      explanation: `${why1} || [closed] ${p1.version} decision retained; not re-evaluated`,
      closed: true,
    };
  }
  // Open, or blank status (treated as open so it is not silently frozen) - same as Python.
  const d2 = decide(c, p2);
  return {
    case_id: c.case_id,
    recommendation_v1: d1.recommendation,
    recommendation_v2: d2.recommendation,
    needs_recheck: d2.recommendation !== d1.recommendation,
    rule_v1: d1.rule_id,
    rule_v2: d2.rule_id,
    explanation: `${why1} || [${p2.version}] ${d2.reasons.join("; ")}`,
    closed: false,
  };
}

export function runBatch(
  claims: ParsedClaim[],
  p1 = BATCH_POLICY_V1,
  p2 = BATCH_POLICY_V2,
): BatchRow[] {
  return claims.map((c) => evaluateClaim(c, p1, p2));
}

/** Results CSV in the exact format the Python batch writes (booleans as True/False). */
export function batchToCsv(rows: BatchRow[]): string {
  return toCsv(
    rows.map((r) => ({ ...r, needs_recheck: r.needs_recheck ? "True" : "False" })),
    [...BATCH_COLUMNS],
  );
}
