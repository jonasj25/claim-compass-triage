// Policy advisor: searches policy variants on the claims we have and suggests the best one per goal.
// Deterministic optimisation, not an AI decision. Suggestions are only drafts: the policy owner checks
// them on Change impact and approves them before anything changes. Locked rules (red flags, claim types,
// EV rule, documents, blank handling) are never touched; only these levers move:
//   * quote limit (routine up to this amount)
//   * second-check margin (routine claims within this amount below the limit get a person's check afterwards)
//   * random QA share (share of other routine claims checked afterwards)
import { hourlyCost, type Inputs } from "./business";
import { isClosed } from "./csv";
import { SECOND_CHECK } from "./second-check";
import { decide, type Claim, type Policy, type Recommendation } from "./triage";

export const ADVISOR_ASSUMPTIONS = {
  hiddenIssueAt1000: 0.015, // chance an auto-processed €1,000 claim really needed a person; scales with the amount
  checkCatch: 0.7, // share of hidden issues a second check / QA check catches
  daysAuto: 0.2, // customer waits ~same day
  daysInfo: 4, // until the customer sends what is missing
  daysReview: 1.5, // 24h review SLA plus handling
} as const;

export type Goal = "financial" | "customer" | "time";
export const GOALS: { key: Goal; title: string; blurb: string }[] = [
  {
    key: "financial",
    title: "Financial optimum",
    blurb: "Lowest total of reviewer cost and expected losses from claims that slip through.",
  },
  {
    key: "customer",
    title: "Customer optimum",
    blurb: "Fastest decisions for customers, without more expected losses than today.",
  },
  {
    key: "time",
    title: "Least reviewer time",
    blurb: "Fewest reviewer hours, without more expected losses than today.",
  },
];

export interface Levers {
  limit: number;
  margin: number;
  qa: number;
}

export interface Score extends Levers {
  hours: number; // reviewer hours per year
  reviewerCost: number; // €/year
  risk: number; // expected avoidable loss €/year from auto-processed claims
  total: number; // reviewerCost + risk
  days: number; // average days to a decision per claim
  shares: Record<Recommendation, number>;
  checks: number; // share of open claims that get a second check
}

export interface AdvisorResult {
  claims: number;
  baseline: Score;
  best: Record<Goal, Score>;
  candidates: Score[]; // best (by total) per limit, for the trade-off chart
  relaxes: (s: Levers) => boolean;
  evaluated: number;
}

const pIssue = (q: number) => Math.min(0.5, ADVISOR_ASSUMPTIONS.hiddenIssueAt1000 * (q / 1000));

interface PerLimit {
  limit: number;
  counts: Record<Recommendation, number>;
  routineQuotes: number[]; // quotes of claims that are routine at this limit
}

function prepare(
  claims: Claim[],
  policy: Policy,
  limits: number[],
): { open: number; per: PerLimit[] } {
  const open = claims.filter((c) => !isClosed(c.case_status));
  const per = limits.map((limit) => {
    const pol: Policy = {
      ...policy,
      human_review: { ...policy.human_review, quote_limit_eur: limit },
    };
    const counts = { routine_processing: 0, request_information: 0, human_review: 0 } as Record<
      Recommendation,
      number
    >;
    const routineQuotes: number[] = [];
    for (const c of open) {
      const r = decide(c, pol).recommendation;
      counts[r]++;
      if (r === "routine_processing" && c.quote_eur !== null && c.quote_eur !== undefined)
        routineQuotes.push(c.quote_eur);
    }
    return { limit, counts, routineQuotes };
  });
  return { open: open.length, per };
}

function score(p: PerLimit, n: number, margin: number, qa: number, i: Inputs): Score {
  const A = ADVISOR_ASSUMPTIONS;
  const scale = n ? i.claimsPerYear / n : 0;
  let minutes = p.counts.human_review * i.reviewMin + p.counts.request_information * i.infoMin;
  let risk = 0;
  let checks = 0;
  for (const q of p.routineQuotes) {
    const loss = pIssue(q) * i.overpayShare * q;
    if (q > p.limit - margin) {
      checks++;
      minutes += i.checkMin;
      risk += loss * (1 - A.checkCatch);
    } else {
      minutes += qa * i.checkMin;
      risk += loss * (1 - qa * A.checkCatch);
    }
  }
  const hours = (minutes / 60) * scale;
  const reviewerCost = hours * hourlyCost(i);
  const riskYear = risk * scale;
  const days = n
    ? (p.counts.routine_processing * A.daysAuto +
        p.counts.request_information * A.daysInfo +
        p.counts.human_review * A.daysReview) /
      n
    : 0;
  return {
    limit: p.limit,
    margin,
    qa,
    hours,
    reviewerCost,
    risk: riskYear,
    total: reviewerCost + riskYear,
    days,
    shares: {
      routine_processing: n ? p.counts.routine_processing / n : 0,
      request_information: n ? p.counts.request_information / n : 0,
      human_review: n ? p.counts.human_review / n : 0,
    },
    checks: n ? checks / n : 0,
  };
}

export const MARGINS = Array.from({ length: 17 }, (_, k) => k * 25); // €0 .. €400
export const QA_SHARES = [0.03, 0.05, 0.07, 0.1, 0.15]; // ≥3%: random QA is how quality is measured after launch

export function advise(
  claims: Claim[],
  policy: Policy,
  i: Inputs,
  allowRelax = false,
): AdvisorResult {
  const current = policy.human_review.quote_limit_eur ?? 1500;
  const maxLimit = allowRelax ? 2000 : current;
  const limits = [...new Set([...Array.from({ length: 25 }, (_, k) => 800 + k * 50), current])]
    .filter((l) => l >= 800 && l <= Math.max(maxLimit, 800))
    .sort((a, b) => a - b);
  const { open, per } = prepare(claims, policy, [...new Set([...limits, current])]);
  const byLimit = new Map(per.map((p) => [p.limit, p]));

  const baseline = score(byLimit.get(current)!, open, SECOND_CHECK.MARGIN_EUR, i.qaShare, i);
  const all: Score[] = [];
  for (const l of limits)
    for (const m of MARGINS)
      for (const q of QA_SHARES) all.push(score(byLimit.get(l)!, open, m, q, i));

  const budget = baseline.risk * 1.0001; // guardrail: no more expected loss than today
  const pick = (pool: Score[], key: (s: Score) => number, tie: (s: Score) => number) =>
    pool.reduce((a, b) =>
      key(b) < key(a) - 1e-9 || (Math.abs(key(b) - key(a)) <= 1e-9 && tie(b) < tie(a)) ? b : a,
    );
  const safe = all.filter((s) => s.risk <= budget);
  const best: Record<Goal, Score> = {
    financial: pick(
      all,
      (s) => s.total,
      (s) => s.hours,
    ),
    customer: pick(
      safe.length ? safe : all,
      (s) => Math.round(s.days * 1000) / 1000,
      (s) => s.total,
    ),
    time: pick(
      safe.length ? safe : all,
      (s) => Math.round(s.hours),
      (s) => s.total,
    ),
  };
  const candidates = limits.map((l) =>
    pick(
      all.filter((s) => s.limit === l),
      (s) => s.total,
      (s) => s.hours,
    ),
  );
  return {
    claims: open,
    baseline,
    best,
    candidates,
    relaxes: (s) => s.limit > current,
    evaluated: all.length,
  };
}

/** The draft policy a suggestion becomes: only the quote limit changes; locked rules stay. */
export function draftFrom(policy: Policy, s: Levers, version: string, goal: Goal): Policy {
  const title = GOALS.find((g) => g.key === goal)?.title ?? goal;
  return {
    ...policy,
    version,
    description: `Advisor suggestion (${title}): quote limit €${s.limit.toLocaleString("en-US")}; operate with a €${s.margin} second-check margin and ${Math.round(s.qa * 100)}% random QA.`,
    human_review: { ...policy.human_review, quote_limit_eur: s.limit },
  };
}
