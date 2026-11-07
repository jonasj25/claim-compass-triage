import type { CaseRow } from "./data";
import { isClosed } from "./csv";
import { buildChecklist, type Policy, type Recommendation } from "./triage";
import { secondCheckReason } from "./second-check";
import { humanize } from "./labels";

export interface WorkEvent {
  case_id: string;
  type: string;
  actor: string | null;
  created_at: string;
  payload: Record<string, unknown> | null;
}

export const WORK_GROUPS = [
  { key: "overdue", label: "Overdue", instruction: "Past its SLA. Review these first." },
  { key: "customer_replied", label: "Customer replied", instruction: "New information arrived. Check it and decide." },
  { key: "risk", label: "Risk cases", instruction: "A known risk needs a person. Check the flagged fact and decide." },
  { key: "policy_change", label: "Policy change", instruction: "The recommendation changed. Check it under the new policy." },
  { key: "near_limit", label: "Near the limit", instruction: "Processed automatically but close to a limit. Quick double-check." },
  { key: "qa", label: "Random QA sample", instruction: "A random check. Make sure the rules still work." },
] as const;
export type GroupKey = (typeof WORK_GROUPS)[number]["key"];
export interface WorkItem {
  row: CaseRow;
  group: GroupKey;
  why: string;
  nearLimit: string | null;
  qa: boolean;
  overdue: boolean;
}
export const money = (n: number) => `€${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const recLabel: Record<Recommendation, string> = {
  routine_processing: "Routine", human_review: "Human review", request_information: "Request info",
};
const completions = new Set(["confirmed", "qa_confirmed", "override"]);
const stamp = (value: string | null) => value ? Date.parse(value) : NaN;

export function doneToday(events: WorkEvent[], reviewer: string, now: Date): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return new Set(events.filter((e) => completions.has(e.type) && e.actor === reviewer &&
    stamp(e.created_at) >= start.getTime() && stamp(e.created_at) <= now.getTime()).map((e) => e.case_id)).size;
}

export function buildWorkstream(cases: CaseRow[], policy: Policy, reviewer: string, events: WorkEvent[], now: Date) {
  const history = new Map<string, WorkEvent[]>();
  for (const event of events) {
    const list = history.get(event.case_id) ?? [];
    list.push(event);
    history.set(event.case_id, list);
  }
  const seen = new Set<string>();
  const items: WorkItem[] = [];
  for (const row of cases) {
    const { claim, decision, workflow } = row;
    if (seen.has(claim.case_id)) continue;
    seen.add(claim.case_id);
    if (!workflow || !decision || isClosed(claim.case_status) ||
      claim.case_status?.trim().toLowerCase() === "done" || workflow.queue === "done" ||
      workflow.queue === "waiting_customer" ||
      (workflow.assignee !== null && workflow.assignee !== reviewer)) continue;
    const near = secondCheckReason(claim, policy, decision.recommendation);
    // Do not create QA samples here: random selection is persisted by the existing workflow.
    const qa = workflow.queue === "auto_processed" && workflow.qa_sample && !near;
    const needsHuman = decision.recommendation === "human_review";
    if (!needsHuman && !decision.needs_recheck && !near && !qa) continue;
    if (decision.recommendation === "request_information") continue;
    const overdue = Number.isFinite(stamp(workflow.sla_due_at)) && stamp(workflow.sla_due_at) < now.getTime();
    const list = history.get(claim.case_id) ?? [];
    const last = (types: string[]) => list.filter((e) => types.includes(e.type))
      .sort((a, b) => stamp(b.created_at) - stamp(a.created_at))[0];
    const reply = last(["message_received", "documents_received"]);
    const rerun = last(["retriaged"]);
    const resolved = last([...completions]);
    const replied = needsHuman && reply && rerun && stamp(rerun.created_at) >= stamp(reply.created_at) &&
      (!resolved || stamp(reply.created_at) > stamp(resolved.created_at));
    const flagged = needsHuman ? buildChecklist(claim, policy).filter((check) => check.stage === "R1" && check.status === "fail") : [];
    const riskWhy = flagged.map((check) => humanize(check.note)).join(" · ");
    const policyEvent = last(["policy_change"]);
    const p = policyEvent?.payload;
    const before = typeof p?.before === "string" ? recLabel[p.before as Recommendation] : null;
    const after = typeof p?.after === "string" ? recLabel[p.after as Recommendation] : null;
    const policyWhy = before && after && typeof p?.from_version === "string" && typeof p?.to_version === "string"
      ? `${p.from_version} ${before} → ${p.to_version} ${after}`
      : `${decision.policy_version} ${recLabel[decision.recommendation]} · Recommendation changed`;
    const limit = policy.human_review.quote_limit_eur;
    const nearLimit = near && limit !== null && claim.quote_eur !== null
      ? `${money(claim.quote_eur)} – only ${money(limit - claim.quote_eur)} under the ${money(limit)} limit. Auto-processed; please double-check.` : null;
    const group: GroupKey = overdue ? "overdue" : replied ? "customer_replied" : flagged.length ? "risk" :
      decision.needs_recheck ? "policy_change" : near ? "near_limit" : qa ? "qa" : "risk";
    const why = nearLimit ?? (group === "customer_replied" ? `Customer replied · ${riskWhy || "New information needs your decision"}` :
      group === "policy_change" ? policyWhy : qa ? "Picked at random to check the rules still work." :
      riskWhy || humanize(decision.explanation)?.replace(/\bV?\d*\.?R[123]\b/gi, "").trim() || "A person needs to check this claim");
    items.push({ row, group, why, nearLimit, qa, overdue });
  }
  const groups = WORK_GROUPS.map((group) => ({ ...group, items: items.filter((item) => item.group === group.key)
    .sort((a, b) => (stamp(a.row.claim.received_at) || Infinity) - (stamp(b.row.claim.received_at) || Infinity) ||
      a.row.claim.case_id.localeCompare(b.row.claim.case_id)) })).filter((group) => group.items.length > 0);
  return { groups, ordered: groups.flatMap((group) => group.items) };
}