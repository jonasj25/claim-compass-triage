// Activate a policy version: the release step of change control.
// Open claims are re-decided under the new version (decision rows carry the new policy_version);
// those whose next step changes get needs_recheck = true and move queue. Closed claims are never touched.
import { supabase } from "@/integrations/supabase/client";
import { isClosed } from "./csv";
import { queueFor, type Queue } from "./lifecycle";
import { decide, type Claim, type Decision, type Policy, type Recommendation } from "./triage";
import { secondCheckReason } from "./second-check";
import { tryAutoAssign } from "./auto-assign";

export interface PlannedDecision {
  case_id: string;
  before: Recommendation | null; // current decision in the system (null if none yet)
  decision: Decision; // under the new version
  changed: boolean;
  queue: Queue;
  secondCheck: string | null; // routine but close to the new limit: a person double-checks it
}

export interface ActivationPlan {
  from: string;
  to: string;
  open: PlannedDecision[];
  changed: PlannedDecision[];
  secondChecks: PlannedDecision[];
  closedUntouched: number;
}

type CaseLike = { claim: Claim; decision: { recommendation: Recommendation } | null };

export function planActivation(
  cases: CaseLike[],
  active: Policy,
  candidate: Policy,
): ActivationPlan {
  const open: PlannedDecision[] = [];
  let closedUntouched = 0;
  for (const c of cases) {
    if (isClosed(c.claim.case_status)) {
      closedUntouched++;
      continue;
    }
    // Compare with the decision the system holds now; fall back to the active policy if none is stored.
    const before = c.decision?.recommendation ?? decide(c.claim, active).recommendation;
    const d = decide(c.claim, candidate);
    open.push({
      case_id: c.claim.case_id,
      before,
      decision: d,
      changed: d.recommendation !== before,
      queue: queueFor(d.recommendation, false),
      secondCheck: secondCheckReason(c.claim, candidate, d.recommendation),
    });
  }
  return {
    from: active.version,
    to: candidate.version,
    open,
    changed: open.filter((p) => p.changed),
    secondChecks: open.filter((p) => p.secondCheck),
    closedUntouched,
  };
}

const chunk = <T>(a: T[], n = 200) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function ok<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
  const r = await p;
  if (r.error) throw r.error;
  return r;
}

/** Writes the plan. Decisions first; the policy switch last, so a failure never leaves a half-activated version live. */
export async function activatePolicy(plan: ActivationPlan, actor: string): Promise<void> {
  const now = new Date().toISOString();

  for (const part of chunk(plan.open)) {
    const ids = part.map((p) => p.case_id);
    await ok(
      supabase
        .from("decisions")
        .update({ is_current: false })
        .in("case_id", ids)
        .eq("is_current", true),
    );
    await ok(
      supabase.from("decisions").insert(
        part.map((p) => ({
          case_id: p.case_id,
          policy_version: plan.to,
          recommendation: p.decision.recommendation,
          rule_id: p.decision.rule_id,
          explanation: p.decision.reasons.join(". "),
          missing_fields: p.decision.missing_fields,
          needs_recheck: p.changed,
        })),
      ),
    );
  }

  // Only claims whose next step changed move queue; assignees are kept.
  const byQueue = new Map<Queue, string[]>();
  for (const p of plan.changed) byQueue.set(p.queue, [...(byQueue.get(p.queue) ?? []), p.case_id]);
  for (const [queue, ids] of byQueue) {
    for (const part of chunk(ids)) {
      await ok(
        supabase
          .from("case_workflow")
          .update({
            queue,
            sla_due_at:
              queue === "on_you" ? new Date(Date.now() + 24 * 3600e3).toISOString() : null,
            updated_at: now,
          })
          .in("case_id", part),
      );
    }
  }

  const waiting = plan.changed.filter((p) => p.queue === "waiting_customer");
  if (waiting.length)
    await ok(
      supabase.from("outreach").insert(
        waiting.map((p) => ({
          case_id: p.case_id,
          channel: "email",
          missing_items: p.decision.missing_fields,
        })),
      ),
    );

  if (plan.changed.length)
    await ok(
      supabase.from("case_events").insert(
        plan.changed.map((p) => ({
          case_id: p.case_id,
          type: "policy_change",
          actor: `Policy ${plan.to} activated · ${actor}`,
          payload: {
            from_version: plan.from,
            to_version: plan.to,
            before: p.before,
            after: p.decision.recommendation,
            rule_id: p.decision.rule_id,
          },
        })),
      ),
    );

  // Routine claims close to the new limit get a second check (recommendation unchanged).
  for (const part of chunk(plan.secondChecks.map((p) => p.case_id))) {
    await ok(
      supabase
        .from("case_workflow")
        .update({
          qa_sample: true,
          sla_due_at: new Date(Date.now() + 24 * 3600e3).toISOString(),
          updated_at: now,
        })
        .in("case_id", part),
    );
  }
  if (plan.secondChecks.length)
    await ok(
      supabase.from("case_events").insert(
        plan.secondChecks.map((p) => ({
          case_id: p.case_id,
          type: "second_check_flagged",
          actor: "Rules engine",
          payload: { reason: p.secondCheck, policy_version: plan.to },
        })),
      ),
    );

  // Claims that now need a person get an owner automatically (lowest load; non-fatal).
  await tryAutoAssign(supabase, [
    ...plan.changed.filter((p) => p.queue === "on_you").map((p) => p.case_id),
    ...plan.secondChecks.map((p) => p.case_id),
  ]);

  await ok(
    supabase
      .from("policy_versions")
      .update({ status: "retired" })
      .eq("status", "active")
      .neq("id", plan.to),
  );
  await ok(
    supabase
      .from("policy_versions")
      .update({ status: "active", approved_by: actor, approved_at: now })
      .eq("id", plan.to),
  );
}
