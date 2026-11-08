import type { CaseRow } from "./data";
import { effectiveRec } from "./effective";
import { isClosed } from "./csv";
import { buildChecklist, FIELD_LABELS, RECOMMENDATION_LABELS, type Policy } from "./triage";
import { secondCheckReason } from "./second-check";
import { humanize } from "./labels";

// The reviewer's task list. There is one reviewer, so every open case that needs a person
// lands here, whoever it was assigned to. No SLA / overdue logic on purpose.

export interface WorkEvent {
  case_id: string;
  type: string;
  actor: string | null;
  created_at: string;
  payload: Record<string, unknown> | null;
}

export interface OutreachRow {
  case_id: string;
  reminder_count: number;
}

/** After this many reminders without an answer the case comes back to the reviewer. */
export const NO_REPLY_AFTER_REMINDERS = 2;

export const WORK_GROUPS = [
  { key: "decision", label: "Needs your decision", instruction: "A rule flagged something only a person can judge. Check the flagged fact and decide." },
  { key: "policy_change", label: "Re-check after policy change", instruction: "The new policy gives a different result. Check and confirm it." },
  { key: "no_reply", label: "Customer didn't reply", instruction: "Reminders sent, still no answer. Call the customer or close the claim." },
  { key: "double_check", label: "Quick double-check", instruction: "Processed automatically. Close to the limit or picked at random – a quick look is enough." },
] as const;
export type GroupKey = (typeof WORK_GROUPS)[number]["key"];

export interface WorkItem {
  row: CaseRow;
  group: GroupKey;
  why: string;
  nearLimit: string | null;
  qa: boolean;
  replied: boolean;
  reminders: number;
}

export const money = (n: number) => `€${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const completions = new Set(["confirmed", "qa_confirmed", "override"]);
const stamp = (value: string | null | undefined) => (value ? Date.parse(value) : NaN);

export function isDone(row: CaseRow) {
  return isClosed(row.claim.case_status) || row.claim.case_status?.trim().toLowerCase() === "done" || row.workflow?.queue === "done";
}

/** Exact wording for the limit check, e.g. "Exactly at the €1,200 limit – quick double-check." */
export function limitNote(quote: number, limit: number) {
  const gap = limit - quote;
  return gap <= 0
    ? `Exactly at the ${money(limit)} limit – quick double-check.`
    : `${money(quote)} – only ${money(gap)} under the ${money(limit)} limit – quick double-check.`;
}

export function buildWorkstream(cases: CaseRow[], policy: Policy, events: WorkEvent[], outreach: OutreachRow[] = []) {
  const history = new Map<string, WorkEvent[]>();
  for (const event of events) {
    const list = history.get(event.case_id) ?? [];
    list.push(event);
    history.set(event.case_id, list);
  }
  const outreachReminders = new Map<string, number>();
  for (const o of outreach) outreachReminders.set(o.case_id, Math.max(outreachReminders.get(o.case_id) ?? 0, o.reminder_count ?? 0));

  const seen = new Set<string>();
  const items: WorkItem[] = [];
  for (const row of cases) {
    const { claim, decision, workflow } = row;
    if (seen.has(claim.case_id)) continue;
    seen.add(claim.case_id);
    if (!workflow || !decision || isDone(row)) continue;
    const list = history.get(claim.case_id) ?? [];
    const last = (types: string[]) => list.filter((e) => types.includes(e.type))
      .sort((a, b) => stamp(b.created_at) - stamp(a.created_at))[0];

    if (workflow.queue === "waiting_customer") {
      const reply = last(["message_received", "documents_received"]);
      const lastOutreach = last(["outreach_sent"]);
      const since = Math.max(stamp(lastOutreach?.created_at) || 0, stamp(reply?.created_at) || 0);
      const fromEvents = list.filter((e) => e.type === "reminder_sent" && (stamp(e.created_at) || 0) >= since).length;
      const reminders = Math.max(fromEvents, outreachReminders.get(claim.case_id) ?? 0);
      if (reminders < NO_REPLY_AFTER_REMINDERS) continue;
      const missing = decision.missing_fields.map((f) => (FIELD_LABELS[f] ?? f.replace(/_/g, " ")).toLowerCase()).join(", ");
      items.push({ row, group: "no_reply", reminders, replied: false, qa: false, nearLimit: null,
        why: `${reminders} reminders sent, no answer${missing ? ` · still missing: ${missing}` : ""}` });
      continue;
    }

    // A reviewer's override decides how the claim is handled; it also settles a pending recheck
    const rec = effectiveRec(row) ?? decision.recommendation;
    const overridden = !!row.override;
    const recheck = decision.needs_recheck && !overridden;
    const near = secondCheckReason(claim, policy, rec);
    // Do not create QA samples here: random selection is persisted by the existing workflow.
    const qa = workflow.queue === "auto_processed" && workflow.qa_sample && !near;
    const needsHuman = rec === "human_review";
    if (rec === "request_information") continue;
    if (!needsHuman && !recheck && !near && !qa) continue;

    const reply = last(["message_received", "documents_received"]);
    const rerun = last(["retriaged"]);
    const resolved = last([...completions]);
    const replied = !!(needsHuman && reply && rerun && stamp(rerun.created_at) >= stamp(reply.created_at) &&
      (!resolved || stamp(reply.created_at) > stamp(resolved.created_at)));
    const flagged = needsHuman ? buildChecklist(claim, policy).filter((check) => check.stage === "R1" && check.status === "fail") : [];
    // Trigger text; the quote limit reads as "€2,200 over auto-limit" (the limit that decides automation).
    const autoLimit = policy.human_review.quote_limit_eur;
    const riskWhy = flagged
      .map((check) =>
        check.key === "quote_limit" && autoLimit !== null && autoLimit !== undefined && claim.quote_eur !== null
          ? `${money(claim.quote_eur - autoLimit)} over auto-limit`
          : humanize(check.note),
      )
      .join(" · ");
    const policyEvent = last(["policy_change"]);
    const p = policyEvent?.payload;
    const label = (v: unknown) => (typeof v === "string" && v in RECOMMENDATION_LABELS ? RECOMMENDATION_LABELS[v as keyof typeof RECOMMENDATION_LABELS] : null);
    const before = label(p?.before);
    const after = label(p?.after);
    const policyWhy = before && after && typeof p?.from_version === "string" && typeof p?.to_version === "string"
      ? `${p.from_version}: ${before} → ${p.to_version}: ${after}`
      : `Now ${RECOMMENDATION_LABELS[rec]} under ${decision.policy_version}`;
    const limit = policy.human_review.quote_limit_eur;
    const nearLimit = near && limit !== null && claim.quote_eur !== null ? limitNote(claim.quote_eur, limit) : null;

    const group: GroupKey = replied ? "decision" : recheck ? "policy_change" :
      flagged.length ? "decision" : near || qa ? "double_check" : "decision";
    const why = group === "policy_change" ? [policyWhy, riskWhy].filter(Boolean).join(" · ") :
      group === "double_check" ? nearLimit ?? "Picked at random to check the rules still work." :
      replied ? `Customer replied · ${riskWhy || "New information needs your decision"}` :
      overridden && row.override ? `Changed by ${row.override.reviewer ?? "a reviewer"}: ${RECOMMENDATION_LABELS[(row.override.original_recommendation ?? decision.recommendation) as keyof typeof RECOMMENDATION_LABELS] ?? row.override.original_recommendation} → ${RECOMMENDATION_LABELS[rec]}${row.override.reason_text ? ` · ${row.override.reason_text}` : ""}` :
      riskWhy || humanize(decision.explanation)?.replace(/\bV?\d*\.?R[123]\b/gi, "").trim() || "A person needs to check this claim";
    items.push({ row, group, why, nearLimit, qa, replied, reminders: 0 });
  }
  const groups = WORK_GROUPS.map((group) => ({ ...group, items: items.filter((item) => item.group === group.key)
    .sort((a, b) => (stamp(a.row.claim.received_at) || Infinity) - (stamp(b.row.claim.received_at) || Infinity) ||
      a.row.claim.case_id.localeCompare(b.row.claim.case_id)) })).filter((group) => group.items.length > 0);
  return { groups, ordered: groups.flatMap((group) => group.items) };
}

/** One status per claim, shared by the dashboard progress bar and the All claims tabs so the numbers match. */
export type ClaimStatus = "to_review" | "waiting_customer" | "auto_processed" | "done";
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  to_review: "To review",
  waiting_customer: "Waiting on customer",
  auto_processed: "Auto-processed",
  done: "Done",
};
export const CLAIM_STATUSES = Object.keys(CLAIM_STATUS_LABEL) as ClaimStatus[];

export function claimStatuses(cases: CaseRow[], workIds: Set<string>): Map<string, ClaimStatus> {
  const out = new Map<string, ClaimStatus>();
  for (const row of cases) {
    const id = row.claim.case_id;
    out.set(id, isDone(row) ? "done" : workIds.has(id) ? "to_review" :
      row.workflow?.queue === "waiting_customer" || effectiveRec(row) === "request_information" ? "waiting_customer" :
      row.workflow?.queue === "on_you" ? "to_review" : "auto_processed");
  }
  return out;
}
