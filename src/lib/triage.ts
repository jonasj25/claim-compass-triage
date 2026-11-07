// Deterministic triage engine. Must match engine/triage.py in the backend repo exactly.
// AI never changes the output of decide().

export type Recommendation = "routine_processing" | "request_information" | "human_review";

export interface Policy {
  version: string;
  description?: string;
  human_review: {
    require_policy_active: boolean;
    allowed_claim_types: string[];
    flag_fields: string[];
    quote_limit_eur: number | null;
    review_repair_types: string[];
  };
  required_documents: string[];
}

export const POLICY_V1: Policy = {
  version: "v1",
  description: "Participant policy v1 - fictional motor claims triage",
  human_review: {
    require_policy_active: true,
    allowed_claim_types: ["motor_own_damage"],
    flag_fields: ["injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict"],
    quote_limit_eur: 1500,
    review_repair_types: [],
  },
  required_documents: ["incident_report_present", "itemized_quote_present"],
};

export interface Claim {
  case_id: string;
  case_status?: string | null;
  claim_summary?: string | null;
  policy_active_on_incident: boolean | null;
  claim_type: string | null;
  repair_type: string | null;
  quote_eur: number | null;
  incident_report_present: boolean | null;
  itemized_quote_present: boolean | null;
  injury_reported: boolean | null;
  liability_disputed: boolean | null;
  duplicate_flag: boolean | null;
  evidence_conflict: boolean | null;
  [key: string]: unknown;
}

export type CheckStatus = "pass" | "fail" | "unknown";
export type CheckStage = "R1" | "R2";

export interface Check {
  key: string;
  field: string;
  label: string;
  stage: CheckStage;
  status: CheckStatus;
  note: string;
}

export interface Decision {
  recommendation: Recommendation;
  rule_id: string;
  reasons: string[];
  missing_fields: string[];
  checklist: Check[];
  counterfactual: string;
}

export const FIELD_LABELS: Record<string, string> = {
  policy_active_on_incident: "policy status",
  claim_type: "claim type",
  repair_type: "repair type",
  quote_eur: "quote amount",
  incident_report_present: "incident report",
  itemized_quote_present: "itemized quote",
  injury_reported: "injury",
  liability_disputed: "disputed liability",
  duplicate_flag: "duplicate",
  evidence_conflict: "evidence conflict",
};

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  routine_processing: "Auto-processed",
  request_information: "Request info",
  human_review: "To review",
};

const label = (f: string) => FIELD_LABELS[f] ?? f.replace(/_/g, " ");
const eur = (n: number) =>
  "€" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

function boolField(claim: Claim, field: string): boolean | null {
  const v = claim[field];
  return typeof v === "boolean" ? v : null;
}

export function buildChecklist(claim: Claim, policy: Policy): Check[] {
  const hr = policy.human_review;
  const checks: Check[] = [];

  if (hr.require_policy_active) {
    const v = claim.policy_active_on_incident;
    checks.push({
      key: "policy_active",
      field: "policy_active_on_incident",
      label: "Policy active on incident date",
      stage: "R1",
      status: v === null ? "unknown" : v ? "pass" : "fail",
      note: v === null ? "Policy status unknown" : v ? "Policy active" : "Policy not active on incident date",
    });
  }

  {
    const v = claim.claim_type;
    const ok = v !== null && hr.allowed_claim_types.includes(v);
    checks.push({
      key: "claim_type",
      field: "claim_type",
      label: "Claim type allowed",
      stage: "R1",
      status: v === null ? "unknown" : ok ? "pass" : "fail",
      note: v === null ? "Claim type unknown" : ok ? `Type: ${v}` : `Claim type "${v}" needs a person`,
    });
  }

  for (const f of hr.flag_fields) {
    const v = boolField(claim, f);
    const l = label(f);
    checks.push({
      key: f,
      field: f,
      label: l.charAt(0).toUpperCase() + l.slice(1),
      stage: "R1",
      status: v === null ? "unknown" : v ? "fail" : "pass",
      note: v === null ? `${cap(l)} unknown` : v ? `${cap(l)} reported` : `No ${l}`,
    });
  }

  if (hr.quote_limit_eur !== null && hr.quote_limit_eur !== undefined) {
    const v = claim.quote_eur;
    const over = v !== null && v > hr.quote_limit_eur;
    checks.push({
      key: "quote_limit",
      field: "quote_eur",
      label: `Quote at or below ${eur(hr.quote_limit_eur)}`,
      stage: "R1",
      status: v === null ? "unknown" : over ? "fail" : "pass",
      note:
        v === null
          ? "Quote amount unknown"
          : over
            ? `${eur(v)} is above the ${eur(hr.quote_limit_eur)} limit`
            : `${eur(v)} within limit`,
    });
  }

  if (hr.review_repair_types.length > 0) {
    const v = claim.repair_type;
    const hit = v !== null && hr.review_repair_types.includes(v);
    checks.push({
      key: "repair_type",
      field: "repair_type",
      label: "Repair type routine",
      stage: "R1",
      status: v === null ? "unknown" : hit ? "fail" : "pass",
      note: v === null ? "Repair type unknown" : hit ? `Repair type "${v}" needs a person` : `Repair: ${v}`,
    });
  }

  for (const f of policy.required_documents) {
    const v = boolField(claim, f);
    const l = label(f);
    checks.push({
      key: f,
      field: f,
      label: `${cap(l)} present`,
      stage: "R2",
      status: v === null ? "unknown" : v ? "pass" : "fail",
      note: v === null ? `${cap(l)} unknown` : v ? `${cap(l)} received` : `${cap(l)} missing`,
    });
  }

  return checks;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function core(claim: Claim, policy: Policy) {
  const checklist = buildChecklist(claim, policy);
  const r1Fails = checklist.filter((c) => c.stage === "R1" && c.status === "fail");
  const unknowns = checklist.filter((c) => c.status === "unknown");
  const docFails = checklist.filter((c) => c.stage === "R2" && c.status === "fail");
  const v = policy.version;

  let recommendation: Recommendation;
  let rule: string;
  let reasons: string[];
  if (r1Fails.length) {
    recommendation = "human_review";
    rule = "R1";
    reasons = r1Fails.map((c) => c.note);
  } else if (unknowns.length) {
    recommendation = "request_information";
    rule = "BLANK";
    reasons = unknowns.map((c) => c.note);
  } else if (docFails.length) {
    recommendation = "request_information";
    rule = "R2";
    reasons = docFails.map((c) => c.note);
  } else {
    recommendation = "routine_processing";
    rule = "R3";
    reasons = ["All checks passed"];
  }

  const missing_fields = [
    ...unknowns.map((c) => c.field),
    ...docFails.map((c) => c.field),
  ].filter((f, i, a) => a.indexOf(f) === i);

  return { recommendation, rule_id: `${v}.${rule}`, reasons, missing_fields, checklist, r1Fails };
}

function neutralise(claim: Claim, policy: Policy, check: Check): Claim {
  const c = { ...claim };
  switch (check.key) {
    case "policy_active":
      c.policy_active_on_incident = true;
      break;
    case "claim_type":
      c.claim_type = policy.human_review.allowed_claim_types[0] ?? null;
      break;
    case "quote_limit":
      c.quote_eur = policy.human_review.quote_limit_eur;
      break;
    case "repair_type":
      c.repair_type = "standard";
      break;
    default:
      (c as Record<string, unknown>)[check.field] = false;
  }
  return c;
}

const TRIGGER_PHRASE: Record<string, string> = {
  policy_active: "the inactive policy",
  claim_type: "the non-own-damage claim type",
  quote_limit: "the quote above the limit",
  repair_type: "the review repair type",
  injury_reported: "the injury",
  liability_disputed: "the liability dispute",
  duplicate_flag: "the duplicate flag",
  evidence_conflict: "the evidence conflict",
};

export function decide(claim: Claim, policy: Policy): Decision {
  const r = core(claim, policy);
  let counterfactual: string;

  if (r.recommendation === "human_review") {
    if (r.r1Fails.length > 1) {
      counterfactual = `${r.r1Fails.length} triggers. Each one alone requires a person.`;
    } else {
      const t = r.r1Fails[0];
      const alt = core(neutralise(claim, policy, t), policy);
      counterfactual = `Without ${TRIGGER_PHRASE[t.key] ?? label(t.field)} this would be ${RECOMMENDATION_LABELS[alt.recommendation]}.`;
    }
  } else if (r.recommendation === "request_information") {
    const first = r.missing_fields[0];
    const isDoc = policy.required_documents.includes(first);
    counterfactual = isDoc
      ? `Once the ${label(first)} arrives, the case is re-triaged automatically.`
      : `Once the ${label(first)} is confirmed, the case is re-triaged automatically.`;
  } else {
    counterfactual = "Any known trigger or a missing document would change this.";
  }

  return {
    recommendation: r.recommendation,
    rule_id: r.rule_id,
    reasons: r.reasons,
    missing_fields: r.missing_fields,
    checklist: r.checklist,
    counterfactual,
  };
}
