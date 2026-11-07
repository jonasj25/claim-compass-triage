// Change impact: replay every claim under the active policy and a candidate policy.
// Closed claims keep their decision (same rule as the batch path and engine/triage.py).
import { isClosed } from "./csv";
import { decide, type Claim, type Policy, type Recommendation } from "./triage";

export type Counts = Record<Recommendation, number>;

export interface ChangedCase {
  case_id: string;
  before: Recommendation;
  after: Recommendation;
  rule_after: string;
  reasons_after: string[];
}

export interface Quality {
  n: number;
  correct: number;
  wrongRoutine: number; // routine recommended, label is not: the expensive error
  unnecessaryReview: number; // human review recommended, label is not
}

export interface Impact {
  total: number;
  open: number;
  closed: number;
  before: Counts; // all claims under the active policy
  after: Counts; // all claims after the change (closed ones keep their decision)
  automationBefore: number; // share handled without a reviewer (routine + request info)
  automationAfter: number;
  routineBefore: number; // share fully automatic (routine)
  routineAfter: number;
  changed: ChangedCase[]; // open claims whose recommendation changes → need a recheck
  closedWouldChange: number; // closed claims the new rules would change, left untouched
  labelKey: string; // e.g. expected_v2
  quality: {
    before: Quality;
    after: Quality;
    changedBefore: Quality;
    changedAfter: Quality;
  } | null;
}

const zero = (): Counts => ({ routine_processing: 0, request_information: 0, human_review: 0 });
const emptyQ = (): Quality => ({ n: 0, correct: 0, wrongRoutine: 0, unnecessaryReview: 0 });

function score(q: Quality, got: Recommendation, label: string) {
  q.n++;
  if (got === label) q.correct++;
  if (got === "routine_processing" && label !== "routine_processing") q.wrongRoutine++;
  if (got === "human_review" && label !== "human_review") q.unnecessaryReview++;
}

type LabelledClaim = Claim & { raw?: Record<string, unknown> | null };

export function computeImpact(claims: LabelledClaim[], active: Policy, candidate: Policy): Impact {
  const before = zero();
  const after = zero();
  const changed: ChangedCase[] = [];
  let closed = 0;
  let closedWouldChange = 0;

  const labelKey = `expected_${candidate.version}`;
  const prevLabelKey = `expected_${active.version}`;
  const q = { before: emptyQ(), after: emptyQ(), changedBefore: emptyQ(), changedAfter: emptyQ() };

  for (const c of claims) {
    const d1 = decide(c, active);
    const frozen = isClosed(c.case_status);
    const d2raw = decide(c, candidate);
    const d2 = frozen ? d1 : d2raw;
    before[d1.recommendation]++;
    after[d2.recommendation]++;
    if (frozen) {
      closed++;
      if (d2raw.recommendation !== d1.recommendation) closedWouldChange++;
    } else if (d2.recommendation !== d1.recommendation) {
      changed.push({
        case_id: c.case_id,
        before: d1.recommendation,
        after: d2.recommendation,
        rule_after: d2.rule_id,
        reasons_after: d2.reasons,
      });
    }

    const label = c.raw?.[labelKey];
    if (typeof label === "string" && label) {
      score(q.before, d1.recommendation, label);
      score(q.after, d2.recommendation, label);
      const prev = c.raw?.[prevLabelKey];
      if (typeof prev === "string" && prev && prev !== label) {
        score(q.changedBefore, d1.recommendation, label);
        score(q.changedAfter, d2.recommendation, label);
      }
    }
  }

  const total = claims.length || 1;
  const share = (n: number) => n / total;
  return {
    total: claims.length,
    open: claims.length - closed,
    closed,
    before,
    after,
    automationBefore: share(before.routine_processing + before.request_information),
    automationAfter: share(after.routine_processing + after.request_information),
    routineBefore: share(before.routine_processing),
    routineAfter: share(after.routine_processing),
    changed,
    closedWouldChange,
    labelKey,
    quality: q.after.n ? q : null,
  };
}
