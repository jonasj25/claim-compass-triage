// Customer reply with the missing information (simulated for the demo).
// A person records what actually arrived; nothing is guessed. The claim is then re-run through the
// active policy: all good → auto-processed, a new reason for review → to review, still missing → waiting.
import { supabase } from "@/integrations/supabase/client";
import { buildDocuments } from "./intake";
import { queueFor, type Queue } from "./lifecycle";
import { secondCheckReason } from "./second-check";
import {
  decide,
  FIELD_LABELS,
  type Claim,
  type Decision,
  type Policy,
  type Recommendation,
} from "./triage";

export type ItemKind = "document" | "yesno" | "amount" | "choice";

export interface MissingItem {
  field: string;
  kind: ItemKind;
  label: string;
  options?: string[]; // for "choice"
}

const DOC_LABEL: Record<string, string> = {
  incident_report_present: "Incident report",
  itemized_quote_present: "Itemized repair quote",
};
const label = (f: string) => {
  const s = FIELD_LABELS[f] ?? f.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** What the claim is waiting for under this policy: unknown facts and missing documents. */
export function missingItems(claim: Claim, policy: Policy): MissingItem[] {
  const d = decide(claim, policy);
  return d.missing_fields.map((field): MissingItem => {
    if (policy.required_documents.includes(field))
      return { field, kind: "document", label: DOC_LABEL[field] ?? label(field) };
    if (field === "quote_eur") return { field, kind: "amount", label: "Repair quote amount (€)" };
    if (field === "claim_type")
      return {
        field,
        kind: "choice",
        label: "Claim type",
        options: ["motor_own_damage", "theft", "glass"],
      };
    if (field === "repair_type")
      return {
        field,
        kind: "choice",
        label: "Repair type",
        options: ["standard", "ev_high_voltage_battery"],
      };
    return { field, kind: "yesno", label: label(field) };
  });
}

/** Answer per field; `null` = the customer did not provide it (stays unknown). */
export type Answers = Record<string, boolean | number | string | null>;

export function applyAnswers(claim: Claim, answers: Answers): { claim: Claim; changed: string[] } {
  const next: Claim = { ...claim };
  const changed: string[] = [];
  for (const [field, value] of Object.entries(answers)) {
    if (value === null || value === undefined || value === "") continue;
    (next as Record<string, unknown>)[field] = value;
    changed.push(field);
  }
  return { claim: next, changed };
}

const eur = (n: number) => "€" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const yn = (v: unknown) => (v === true ? "yes" : v === false ? "no" : String(v));

export function replyText(customer: string | null, items: MissingItem[], answers: Answers): string {
  const docs = items
    .filter((i) => i.kind === "document" && answers[i.field] === true)
    .map((i) => i.label.toLowerCase());
  const facts = items
    .filter(
      (i) =>
        i.kind !== "document" &&
        answers[i.field] !== null &&
        answers[i.field] !== undefined &&
        answers[i.field] !== "",
    )
    .map(
      (i) =>
        `${i.label.replace(" (€)", "")}: ${i.kind === "amount" ? eur(Number(answers[i.field])) : yn(answers[i.field]).replace(/_/g, " ")}`,
    );
  const lines = [
    "Hello,",
    "",
    docs.length
      ? `please find attached the ${docs.join(" and ")}.`
      : "here is the information you asked for.",
    ...(facts.length ? ["", ...facts] : []),
    "",
    "Best regards,",
    customer ?? "The customer",
  ];
  return lines.join("\n");
}

export interface ReplyResult {
  before: Recommendation;
  after: Recommendation;
  decision: Decision;
  queue: Queue;
  secondCheck: string | null;
  stillMissing: string[];
}

async function ok<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
  const r = await p;
  if (r.error) throw r.error;
  return r;
}

export async function recordCustomerReply(args: {
  caseId: string;
  claim: Claim;
  policy: Policy;
  answers: Answers;
  items: MissingItem[];
  customer: string | null;
  actor: string;
}): Promise<ReplyResult> {
  const { caseId, claim, policy, answers, items, customer, actor } = args;
  const before = decide(claim, policy).recommendation;
  const { claim: updated, changed } = applyAnswers(claim, answers);
  const d = decide(updated, policy);
  const queue = queueFor(d.recommendation, false);
  const second = secondCheckReason(updated, policy, d.recommendation);
  const now = new Date().toISOString();

  if (changed.length) {
    await ok(
      supabase
        .from("claims")
        .update(Object.fromEntries(changed.map((f) => [f, answers[f]])) as never)
        .eq("case_id", caseId),
    );
    await ok(
      supabase
        .from("claim_intake")
        .update({ documents: buildDocuments(updated) as never })
        .eq("case_id", caseId),
    );
    await ok(
      supabase.from("fact_sources").insert(
        changed.map((field) => ({
          case_id: caseId,
          field,
          source_type: "document" as const,
          ref: "customer email",
          quote: `${field} = ${String(answers[field])}`,
          confidence: "confirmed" as const,
        })),
      ),
    );
  }
  await ok(
    supabase
      .from("outreach")
      .update({ status: "answered" })
      .eq("case_id", caseId)
      .in("status", ["sent", "reminded"]),
  );

  await ok(
    supabase
      .from("decisions")
      .update({ is_current: false })
      .eq("case_id", caseId)
      .eq("is_current", true),
  );
  await ok(
    supabase.from("decisions").insert({
      case_id: caseId,
      policy_version: policy.version,
      recommendation: d.recommendation,
      rule_id: d.rule_id,
      explanation: d.reasons.join(". "),
      missing_fields: d.missing_fields,
    }),
  );
  await ok(
    supabase
      .from("case_workflow")
      .update({
        queue,
        qa_sample: !!second,
        sla_due_at:
          queue === "on_you" || second ? new Date(Date.now() + 24 * 3600e3).toISOString() : null,
        updated_at: now,
      })
      .eq("case_id", caseId),
  );

  const body = replyText(customer, items, answers);
  const events: {
    case_id: string;
    type: string;
    actor: string;
    payload: Record<string, unknown>;
  }[] = [
    {
      case_id: caseId,
      type: "message_received",
      actor: customer ?? "Customer",
      payload: { direction: "in", channel: "email", body },
    },
    { case_id: caseId, type: "documents_received", actor: actor, payload: { fields: changed } },
    {
      case_id: caseId,
      type: "retriaged",
      actor: "Rules engine",
      payload: {
        before,
        after: d.recommendation,
        rule_id: d.rule_id,
        policy_version: policy.version,
        queue,
      },
    },
  ];
  if (second)
    events.push({
      case_id: caseId,
      type: "second_check_flagged",
      actor: "Rules engine",
      payload: { reason: second, policy_version: policy.version },
    });
  if (queue === "waiting_customer")
    events.push({
      case_id: caseId,
      type: "outreach_sent",
      actor: "Rules engine",
      payload: { channel: "email", missing_items: d.missing_fields },
    });
  await ok(supabase.from("case_events").insert(events as never));
  if (queue === "waiting_customer")
    await ok(
      supabase
        .from("outreach")
        .insert({ case_id: caseId, channel: "email", missing_items: d.missing_fields }),
    );

  return {
    before,
    after: d.recommendation,
    decision: d,
    queue,
    secondCheck: second,
    stillMissing: d.missing_fields,
  };
}
