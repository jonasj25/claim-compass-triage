// Quality measurement on the labelled test set that ships with the repo (same files the Python
// report uses): 14 provided dev cases + 37 hand-labelled edge cases, with expected_v1 and expected_v2.
// Scored the way the judges describe it: v1 on all cases; v2 on OPEN cases only (closed claims must
// keep their v1 decision and are checked separately); changed and blank-field cases reported apart.
import devCsv from "../../data/dev_cases.csv?raw";
import edgeCsv from "../../data/synthetic_edge_cases.csv?raw";
import volumeCsv from "../../data/synthetic_volume.csv?raw";
import { BATCH_POLICY_V1, BATCH_POLICY_V2, evaluateClaim } from "./batch";
import { isClosed, parseClaimsCsv, type ParsedClaim } from "./csv";
import { decide, type Claim, type Policy, type Recommendation } from "./triage";

export const RECS: Recommendation[] = ["routine_processing", "request_information", "human_review"];

export interface Metrics {
  n: number;
  correct: number;
  wrongRoutine: number; // recommended routine, label is not: the expensive error
  unnecessaryReview: number; // recommended review, label is not
}
export type Confusion = Record<Recommendation, Record<Recommendation, number>>; // [expected][predicted]

export interface Mistake {
  case_id: string;
  set: string;
  expected: Recommendation;
  got: Recommendation;
  rule: string;
  why: string;
}

export interface QualityReport {
  sets: string[];
  total: number;
  v1: Metrics; // v1 engine vs expected_v1, all cases
  keepV1: Metrics; // v1 engine vs expected_v2, open cases (what happens if nobody updates the rules)
  v2: Metrics; // v2 engine vs expected_v2, open cases
  changedKeepV1: Metrics; // open cases whose label changed v1 -> v2
  changedV2: Metrics;
  blankV1: Metrics;
  blankV2: Metrics;
  confusionV2: Confusion;
  mistakesV2: Mistake[];
  mistakesKeepV1: Mistake[];
  closed: { n: number; kept: number };
  recheck: string[]; // open cases flagged needs_recheck
}

const empty = (): Metrics => ({ n: 0, correct: 0, wrongRoutine: 0, unnecessaryReview: 0 });
const emptyConfusion = (): Confusion =>
  Object.fromEntries(
    RECS.map((e) => [e, Object.fromEntries(RECS.map((p) => [p, 0]))]),
  ) as Confusion;

function add(m: Metrics, got: Recommendation, label: Recommendation) {
  m.n++;
  if (got === label) m.correct++;
  if (got === "routine_processing" && label !== "routine_processing") m.wrongRoutine++;
  if (got === "human_review" && label !== "human_review") m.unnecessaryReview++;
}

export const rate = (x: number, n: number) => (n ? x / n : 0);

const FIELDS = [
  "case_status",
  "policy_active_on_incident",
  "claim_type",
  "repair_type",
  "quote_eur",
  "incident_report_present",
  "itemized_quote_present",
  "injury_reported",
  "liability_disputed",
  "duplicate_flag",
  "evidence_conflict",
];
export const hasBlank = (c: ParsedClaim) => FIELDS.some((f) => (c.raw[f] ?? "").trim() === "");

export const LABELLED_SETS: Record<string, string> = {
  "Provided dev cases": devCsv,
  "Hand-labelled edge cases": edgeCsv,
};

export function scoreClaims(
  sets: Record<string, ParsedClaim[]>,
  p1: Policy = BATCH_POLICY_V1,
  p2: Policy = BATCH_POLICY_V2,
): QualityReport {
  const r: QualityReport = {
    sets: Object.keys(sets),
    total: 0,
    v1: empty(),
    keepV1: empty(),
    v2: empty(),
    changedKeepV1: empty(),
    changedV2: empty(),
    blankV1: empty(),
    blankV2: empty(),
    confusionV2: emptyConfusion(),
    mistakesV2: [],
    mistakesKeepV1: [],
    closed: { n: 0, kept: 0 },
    recheck: [],
  };
  for (const [set, claims] of Object.entries(sets)) {
    for (const c of claims) {
      r.total++;
      const e1 = c.raw.expected_v1 as Recommendation | undefined;
      const e2 = c.raw.expected_v2 as Recommendation | undefined;
      const row = evaluateClaim(c, p1, p2);
      const d2 = decide(c, p2);
      if (e1) {
        add(r.v1, row.recommendation_v1, e1);
        if (hasBlank(c)) add(r.blankV1, row.recommendation_v1, e1);
      }
      if (isClosed(c.case_status)) {
        r.closed.n++;
        if (row.recommendation_v2 === row.recommendation_v1 && !row.needs_recheck) r.closed.kept++;
        continue;
      }
      if (row.needs_recheck) r.recheck.push(c.case_id);
      if (!e2) continue;
      add(r.keepV1, row.recommendation_v1, e2);
      add(r.v2, row.recommendation_v2, e2);
      r.confusionV2[e2][row.recommendation_v2]++;
      if (hasBlank(c)) add(r.blankV2, row.recommendation_v2, e2);
      if (e1 && e1 !== e2) {
        add(r.changedKeepV1, row.recommendation_v1, e2);
        add(r.changedV2, row.recommendation_v2, e2);
      }
      if (row.recommendation_v2 !== e2)
        r.mistakesV2.push({
          case_id: c.case_id,
          set,
          expected: e2,
          got: row.recommendation_v2,
          rule: row.rule_v2,
          why: d2.reasons.join("; "),
        });
      if (row.recommendation_v1 !== e2)
        r.mistakesKeepV1.push({
          case_id: c.case_id,
          set,
          expected: e2,
          got: row.recommendation_v1,
          rule: row.rule_v1,
          why: decide(c, p1).reasons.join("; "),
        });
    }
  }
  return r;
}

export function labelledReport(which: string[] = Object.keys(LABELLED_SETS)): QualityReport {
  return scoreClaims(Object.fromEntries(which.map((k) => [k, parseClaimsCsv(LABELLED_SETS[k])])));
}

// ---------- Mix on the 500-claim synthetic volume set (unlabelled) ----------

export interface Mix {
  n: number;
  open: number;
  counts: Record<Recommendation, number>; // open claims
  share: Record<Recommendation, number>;
  staleWrongRoutine: number; // open claims routine under v1 but review under v2 (wrong if rules stay stale)
  changed: number; // open claims whose recommendation changes v1 -> v2
}

export const VOLUME_CLAIMS: ParsedClaim[] = parseClaimsCsv(volumeCsv);

export function volumeMix(
  policy: Policy,
  prev: Policy = BATCH_POLICY_V1,
  claims: Claim[] = VOLUME_CLAIMS,
): Mix {
  const counts = { routine_processing: 0, request_information: 0, human_review: 0 } as Record<
    Recommendation,
    number
  >;
  let open = 0;
  let stale = 0;
  let changed = 0;
  for (const c of claims) {
    if (isClosed(c.case_status)) continue;
    open++;
    const now = decide(c, policy).recommendation;
    const before = decide(c, prev).recommendation;
    counts[now]++;
    if (now !== before) changed++;
    if (before === "routine_processing" && now === "human_review") stale++;
  }
  const share = Object.fromEntries(RECS.map((k) => [k, rate(counts[k], open)])) as Record<
    Recommendation,
    number
  >;
  return { n: claims.length, open, counts, share, staleWrongRoutine: stale, changed };
}
