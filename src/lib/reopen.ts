// Reopening a closed claim, for example when the customer sends new information, more damage turns up,
// the customer disputes the outcome or a QA check finds an error.
// - The claim is open again, so it is checked again under the ACTIVE policy; the recommendation comes only
//   from decide(). If it differs from the decision before closing, the claim is flagged for recheck.
// - A person always looks at a reopened claim: it goes to "To review" with a fresh 24 h target.
// - Nothing is rewritten: the earlier decision, outcome and events stay in the history (append-only);
//   the reopening itself is an event with the reason, the note and who did it.
import { SLA_HOURS, type Queue } from "./lifecycle";
import { decide, type Claim, type Decision, type Policy, type Recommendation } from "./triage";
import { isClosed } from "./csv";
import { tryAutoAssign } from "./auto-assign";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

export const REOPEN_REASONS = [
  { key: "new_information", label: "Customer sent new information" },
  { key: "additional_damage", label: "More damage found (supplement)" },
  { key: "customer_dispute", label: "Customer disputes the outcome" },
  { key: "decision_error", label: "Error found in QA or audit" },
  { key: "other", label: "Other" },
] as const;
export type ReopenReason = (typeof REOPEN_REASONS)[number]["key"];
export const reopenReasonLabel = (k: string) => REOPEN_REASONS.find((r) => r.key === k)?.label ?? k;

/** Who handles the reopened claim: the person reopening it, the reviewer it had, or the lowest load. */
export type ReopenAssign = "me" | "previous" | "auto";

export interface ReopenPlan {
  decision: Decision;
  previous: Recommendation | null;
  changed: boolean;
  queue: Queue;
}

/** Can this claim be reopened? Closed claims and claims a reviewer already finished. */
export const canReopen = (
  caseStatus: string | null | undefined,
  queue: string | null | undefined,
) => isClosed(caseStatus) || queue === "done";

/** What reopening will do: the decision under the active policy, compared with the one before. */
export function planReopen(
  claim: Claim,
  policy: Policy,
  previous: Recommendation | null,
): ReopenPlan {
  const decision = decide({ ...claim, case_status: "open" }, policy);
  return {
    decision,
    previous,
    changed: previous !== null && previous !== decision.recommendation,
    queue: "on_you",
  };
}

/** Checks the reason and note before anything is written. Returns an error message or null. */
export function reopenProblem(reason: string, note: string): string | null {
  if (!REOPEN_REASONS.some((r) => r.key === reason)) return "Choose why the claim is reopened.";
  if (reason === "other" && note.trim().length < 5)
    return "Add a short note when the reason is “Other”.";
  return null;
}

export interface ReopenInput {
  caseId: string;
  reason: ReopenReason;
  note: string;
  actor: string;
  policy: Policy;
  assign: ReopenAssign;
}

const must = async (p: PromiseLike<{ error: unknown; data?: unknown }>) => {
  const r = await p;
  if (r.error) throw r.error;
  return r.data;
};

export async function reopenCase(
  db: Db,
  input: ReopenInput,
): Promise<ReopenPlan & { assignee: string | null }> {
  const problem = reopenProblem(input.reason, input.note);
  if (problem) throw new Error(problem);
  const { caseId, policy } = input;

  const claim = (await must(db.from("claims").select("*").eq("case_id", caseId).single())) as Claim;
  const workflow = (await must(
    db.from("case_workflow").select("*").eq("case_id", caseId).maybeSingle(),
  )) as {
    queue: string;
    assignee: string | null;
  } | null;
  if (!canReopen(claim.case_status, workflow?.queue))
    throw new Error("Only closed or finished claims can be reopened.");
  const current = (await must(
    db
      .from("decisions")
      .select("recommendation,policy_version")
      .eq("case_id", caseId)
      .eq("is_current", true)
      .maybeSingle(),
  )) as { recommendation: Recommendation; policy_version: string } | null;

  const plan = planReopen(claim, policy, current?.recommendation ?? null);
  const now = new Date();
  const assignee =
    input.assign === "me"
      ? input.actor
      : input.assign === "previous"
        ? (workflow?.assignee ?? null)
        : null;

  await must(db.from("claims").update({ case_status: "open" }).eq("case_id", caseId));
  await must(
    db.from("decisions").update({ is_current: false }).eq("case_id", caseId).eq("is_current", true),
  );
  await must(
    db.from("decisions").insert({
      case_id: caseId,
      policy_version: policy.version,
      recommendation: plan.decision.recommendation,
      rule_id: plan.decision.rule_id,
      explanation: plan.decision.reasons.join(". "),
      missing_fields: plan.decision.missing_fields,
      needs_recheck: plan.changed,
    }),
  );
  const wf = {
    queue: plan.queue,
    qa_sample: false,
    assignee,
    sla_due_at: new Date(now.getTime() + SLA_HOURS * 3600e3).toISOString(),
    updated_at: now.toISOString(),
  };
  if (workflow) await must(db.from("case_workflow").update(wf).eq("case_id", caseId));
  else await must(db.from("case_workflow").insert({ case_id: caseId, ...wf }));

  await must(
    db.from("case_events").insert({
      case_id: caseId,
      type: "reopened",
      actor: input.actor,
      payload: {
        reason: input.reason,
        reason_label: reopenReasonLabel(input.reason),
        note: input.note.trim() || null,
        previous_recommendation: current?.recommendation ?? null,
        previous_policy_version: current?.policy_version ?? null,
        recommendation: plan.decision.recommendation,
        rule_id: plan.decision.rule_id,
        policy_version: policy.version,
        changed: plan.changed,
      },
    }),
  );

  let who = assignee;
  if (assignee)
    await must(
      db.from("case_events").insert({
        case_id: caseId,
        type: "assigned",
        actor: input.actor,
        payload: {
          assignee,
          by: input.actor,
          rule: input.assign === "me" ? "reopened by" : "previous reviewer",
        },
      }),
    );
  else who = (await tryAutoAssign(db, [caseId]))[0]?.assignee ?? null;

  return { ...plan, assignee: who };
}

/** Events since the claim was last reopened (earlier confirmations no longer count). Events oldest first. */
export function sinceReopen<T extends { type?: unknown }>(events: T[]): T[] {
  const i = events.map((e) => e.type).lastIndexOf("reopened");
  return i < 0 ? events : events.slice(i + 1);
}
