// Plain-language rendering of a policy config, and a plain-language diff between two versions.
// Display only: decisions always come from decide() in triage.ts.
import { FIELD_LABELS, type Policy } from "./triage";

export const KNOWN_CLAIM_TYPES = ["motor_own_damage", "theft", "glass"];
export const KNOWN_FLAGS = [
  "injury_reported",
  "liability_disputed",
  "duplicate_flag",
  "evidence_conflict",
];
export const KNOWN_REPAIR_TYPES = ["ev_high_voltage_battery", "standard"];
export const KNOWN_DOCUMENTS = ["incident_report_present", "itemized_quote_present"];

const CLAIM_TYPE_TEXT: Record<string, string> = {
  motor_own_damage: "motor own damage",
  theft: "theft",
  glass: "glass",
};
const REPAIR_TYPE_TEXT: Record<string, string> = {
  ev_high_voltage_battery: "EV high-voltage battery work",
  standard: "standard repairs",
};
const FLAG_TEXT: Record<string, string> = {
  injury_reported: "someone reports an injury",
  liability_disputed: "the drivers dispute who caused it",
  duplicate_flag: "the claim is flagged as a possible duplicate",
  evidence_conflict: "the evidence conflicts (e.g. photo date vs incident date)",
};
const DOC_TEXT: Record<string, string> = {
  incident_report_present: "the incident report",
  itemized_quote_present: "an itemized repair quote",
};

export const claimTypeText = (t: string) => CLAIM_TYPE_TEXT[t] ?? t.replace(/_/g, " ");
export const repairTypeText = (t: string) => REPAIR_TYPE_TEXT[t] ?? t.replace(/_/g, " ");
export const flagText = (f: string) =>
  FLAG_TEXT[f] ?? `${FIELD_LABELS[f] ?? f.replace(/_/g, " ")} is true`;
export const docText = (d: string) => DOC_TEXT[d] ?? FIELD_LABELS[d] ?? d.replace(/_/g, " ");
export const eurText = (n: number) => "€" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const list = (xs: string[], word = "or") =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} ${word} ${xs[xs.length - 1]}`;

/** Fields the policy reads; a blank in any of them means "ask for information". */
export function fieldsUsed(p: Policy): string[] {
  const hr = p.human_review;
  return [
    ...(hr.require_policy_active ? ["policy_active_on_incident"] : []),
    "claim_type",
    ...hr.flag_fields,
    ...(hr.quote_limit_eur !== null && hr.quote_limit_eur !== undefined ? ["quote_eur"] : []),
    ...(hr.review_repair_types.length ? ["repair_type"] : []),
    ...p.required_documents,
  ];
}

export interface RuleStep {
  code: "R1" | "BLANK" | "R2" | "R3";
  outcome: "human_review" | "request_information" | "routine_processing";
  title: string;
  conditions: string[];
  note?: string;
}

export function describeRules(p: Policy): RuleStep[] {
  const hr = p.human_review;
  const r1: string[] = [];
  if (hr.require_policy_active) r1.push("the policy was not active on the incident date");
  if (hr.allowed_claim_types.length)
    r1.push(`the claim is not ${list(hr.allowed_claim_types.map(claimTypeText))}`);
  for (const f of hr.flag_fields) r1.push(flagText(f));
  if (hr.quote_limit_eur !== null && hr.quote_limit_eur !== undefined)
    r1.push(`the repair quote is above ${eurText(hr.quote_limit_eur)}`);
  for (const t of hr.review_repair_types) r1.push(`the repair is ${repairTypeText(t)}`);

  return [
    {
      code: "R1",
      outcome: "human_review",
      title: "Send to a person if any of these is true",
      conditions: r1,
      note: "A known reason for review always wins over missing information.",
    },
    {
      code: "BLANK",
      outcome: "request_information",
      title: "Otherwise, ask for information if a fact is unknown",
      conditions: [
        `any of these is blank or unreadable: ${list(fieldsUsed(p).map((f) => FIELD_LABELS[f] ?? f.replace(/_/g, " ")))}`,
      ],
      note: "A blank is never guessed as yes or no.",
    },
    {
      code: "R2",
      outcome: "request_information",
      title: "Otherwise, ask for missing documents",
      conditions: p.required_documents.map((d) => `${docText(d)} is missing`),
    },
    {
      code: "R3",
      outcome: "routine_processing",
      title: "Otherwise, routine processing",
      conditions: ["the claim enters the normal process"],
      note: "This is not a payment approval.",
    },
  ];
}

/** Plain-language list of what changes from `a` to `b`. */
export function diffPolicies(a: Policy, b: Policy): string[] {
  const out: string[] = [];
  const ha = a.human_review;
  const hb = b.human_review;
  const lim = (n: number | null | undefined) =>
    n === null || n === undefined ? "no limit" : eurText(n);
  if (ha.quote_limit_eur !== hb.quote_limit_eur)
    out.push(`Quote limit for review: ${lim(ha.quote_limit_eur)} → ${lim(hb.quote_limit_eur)}`);
  if (ha.require_policy_active !== hb.require_policy_active)
    out.push(
      hb.require_policy_active
        ? "Claims on an inactive policy now go to a person"
        : "An inactive policy no longer sends claims to a person",
    );
  const added = (x: string[], y: string[]) => y.filter((v) => !x.includes(v));
  for (const t of added(ha.review_repair_types, hb.review_repair_types))
    out.push(`${capital(repairTypeText(t))} now goes to a person`);
  for (const t of added(hb.review_repair_types, ha.review_repair_types))
    out.push(`${capital(repairTypeText(t))} no longer goes to a person`);
  for (const t of added(ha.allowed_claim_types, hb.allowed_claim_types))
    out.push(`${capital(claimTypeText(t))} claims can now be handled routinely`);
  for (const t of added(hb.allowed_claim_types, ha.allowed_claim_types))
    out.push(`${capital(claimTypeText(t))} claims now go to a person`);
  for (const f of added(ha.flag_fields, hb.flag_fields))
    out.push(`New review trigger: ${flagText(f)}`);
  for (const f of added(hb.flag_fields, ha.flag_fields))
    out.push(`No longer a review trigger: ${flagText(f)}`);
  for (const d of added(a.required_documents, b.required_documents))
    out.push(`Now required: ${docText(d)}`);
  for (const d of added(b.required_documents, a.required_documents))
    out.push(`No longer required: ${docText(d)}`);
  return out;
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Next free version id: v1, v2 → v3. */
export function nextVersionId(ids: string[]): string {
  const nums = ids
    .map((id) => /^v(\d+)$/i.exec(id)?.[1])
    .filter(Boolean)
    .map(Number);
  return `v${(nums.length ? Math.max(...nums) : 0) + 1}`;
}
