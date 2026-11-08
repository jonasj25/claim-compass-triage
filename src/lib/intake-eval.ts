// End-to-end quality test: from what a customer says and uploads to the next step.
// Each case in data/intake_eval_cases.json is played through the same steps as a real report:
//   Mia asks the open questions in her order and reads each reply with her rules (interpretReply +
//   extractFromUtterance); uploaded documents are read with the document rules (scanDocumentText) and
//   fill or correct answers the way the report page does; a document that contradicts the customer is an
//   evidence conflict; the claim is built like the submit step builds it; decide() gives the next step.
// The result is compared with the next step a claims expert gave for the same material.
// Documents are read with the text rules only: the AI reader (photos, scans) is not part of this test.
import casesJson from "../../data/intake_eval_cases.json";
import { scanDocumentText } from "./document-scan";
import {
  activeQuestions,
  answerDiffers,
  EMPTY_ANSWERS,
  extractFromUtterance,
  fieldState,
  interpretReply,
  isUnknownText,
  toClaimFields,
  type AnswerKey,
  type Question,
  type ReportAnswers,
} from "./report-intake";
import { decide, type Claim, type Policy, type Recommendation } from "./triage";

export interface EvalCase {
  id: string;
  tags: string[];
  policy_number: string;
  duplicate?: boolean;
  replies: Partial<Record<AnswerKey, string>>;
  docs?: { kind: "incident_report" | "quote" | "photos"; name: string; text: string }[];
  expected: Recommendation;
  why: string;
}

export const EVAL_ABOUT: string = (casesJson as { about: string }).about;
export const EVAL_CASES = (casesJson as { cases: EvalCase[] }).cases;
const TODAY = new Date("2026-11-08T12:00:00");

/** Mia's order: the story first, then open required questions, then open optional ones. Each asked once. */
function nextQuestion(a: ReportAnswers, asked: Set<AnswerKey>): Question | undefined {
  const open = activeQuestions(a)
    .filter(
      (q) =>
        !["name", "email", "plate"].includes(q.key) &&
        !asked.has(q.key) &&
        fieldState(q, a) === "missing",
    )
    .sort((x, y) => Number(y.key === "what_happened") - Number(x.key === "what_happened"));
  return open.find((q) => !q.optional) ?? open[0];
}

export interface Simulated {
  answers: ReportAnswers;
  claim: Claim;
  got: Recommendation;
  rule: string;
  reasons: string[];
  conflicts: AnswerKey[];
}

export function simulateIntake(c: EvalCase, policy: Policy): Simulated {
  let a: ReportAnswers = {
    ...EMPTY_ANSWERS,
    name: "Test Customer",
    email: "test@example.com",
    plate: "M-AB 1234",
    policy_number: c.policy_number,
  };
  const said: Partial<Record<AnswerKey, string>> = {};
  const asked = new Set<AnswerKey>();

  // The conversation
  for (let q = nextQuestion(a, asked); q; q = nextQuestion(a, asked)) {
    asked.add(q.key);
    const text = c.replies[q.key];
    if (!text) continue; // nothing useful to say: the question stays open
    const found: Partial<ReportAnswers> = {
      ...interpretReply(q, text, TODAY),
      ...extractFromUtterance(text, TODAY),
    };
    if (!a.what_happened && text.split(/\s+/).length >= 6 && !found.what_happened)
      found.what_happened = text;
    a = { ...a, ...found };
    Object.assign(said, found);
  }

  // Uploaded documents: what they state wins over what was said (except the story)
  const docFacts: Partial<Record<AnswerKey, string>> = {};
  for (const d of c.docs ?? []) {
    const readable = d.text.replace(/\s+/g, "").length >= 40;
    const scan = scanDocumentText(readable ? d.text : "", d.kind);
    const base: Partial<ReportAnswers> =
      d.kind === "incident_report" ? { incident_report: "yes" } : {};
    const fresh = Object.fromEntries(
      Object.entries({ ...scan.answers, ...base }).filter(
        ([k, v]) =>
          v && (k !== "what_happened" || !a.what_happened || a.what_happened === "unsure"),
      ),
    ) as Partial<ReportAnswers>;
    for (const [k, v] of Object.entries(fresh)) docFacts[k as AnswerKey] = String(v);
    a = { ...a, ...fresh };
  }
  const conflicts = (Object.entries(docFacts) as [AnswerKey, string][])
    .filter(([k, v]) => k !== "what_happened" && said[k] && answerDiffers(k, String(said[k]), v))
    .map(([k]) => k);

  // The claim, built like the submit step builds it
  const claim: Claim = {
    case_id: c.id,
    case_status: "open",
    policy_active_on_incident: isUnknownText(a.policy_number) ? null : true,
    duplicate_flag: !!c.duplicate,
    evidence_conflict: conflicts.length > 0,
    ...toClaimFields(a),
  };
  const d = decide(claim, policy);
  return {
    answers: a,
    claim,
    got: d.recommendation,
    rule: d.rule_id,
    reasons: d.reasons,
    conflicts,
  };
}

export interface EvalMiss {
  id: string;
  tags: string[];
  expected: Recommendation;
  got: Recommendation;
  why: string;
  reasons: string[];
}

export interface EvalReport {
  n: number;
  correct: number;
  /** Auto-processed, but the expert says a person or more information was needed: the costly error */
  wrongRoutine: number;
  /** Sent to a person without need: costs reviewer time */
  unnecessaryReview: number;
  /** Asked the customer for something although the expert had what was needed: costs the customer time */
  unnecessaryRequest: number;
  confusion: Record<Recommendation, Record<Recommendation, number>>;
  byTag: Record<string, { n: number; correct: number }>;
  misses: EvalMiss[];
}

const RECS: Recommendation[] = ["routine_processing", "request_information", "human_review"];

export function runIntakeEval(policy: Policy, cases: EvalCase[] = EVAL_CASES): EvalReport {
  const r: EvalReport = {
    n: 0,
    correct: 0,
    wrongRoutine: 0,
    unnecessaryReview: 0,
    unnecessaryRequest: 0,
    confusion: Object.fromEntries(
      RECS.map((e) => [e, Object.fromEntries(RECS.map((g) => [g, 0]))]),
    ) as EvalReport["confusion"],
    byTag: {},
    misses: [],
  };
  for (const c of cases) {
    const s = simulateIntake(c, policy);
    const ok = s.got === c.expected;
    r.n++;
    if (ok) r.correct++;
    if (s.got === "routine_processing" && c.expected !== "routine_processing") r.wrongRoutine++;
    if (s.got === "human_review" && c.expected !== "human_review") r.unnecessaryReview++;
    if (s.got === "request_information" && c.expected !== "request_information")
      r.unnecessaryRequest++;
    r.confusion[c.expected][s.got]++;
    for (const t of c.tags) {
      const b = (r.byTag[t] ??= { n: 0, correct: 0 });
      b.n++;
      if (ok) b.correct++;
    }
    if (!ok)
      r.misses.push({
        id: c.id,
        tags: c.tags,
        expected: c.expected,
        got: s.got,
        why: c.why,
        reasons: s.reasons,
      });
  }
  return r;
}
