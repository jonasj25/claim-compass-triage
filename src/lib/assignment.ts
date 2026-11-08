// Assigning claims that need a person to reviewers. Presentation and workload only: assignment never
// changes a recommendation. Every change is logged as an "assigned" case event (append-only).
import { supabase } from "@/integrations/supabase/client";
import { isClosed } from "./csv";
import type { CaseRow } from "./data";
import { REVIEWERS } from "./lifecycle";

/** Open claims a person has to look at: to review, or a second check. */
export const needsReviewer = (c: CaseRow) =>
  !isClosed(c.claim.case_status) &&
  !!c.workflow &&
  c.workflow.queue !== "done" &&
  (c.workflow.queue === "on_you" || !!c.workflow.qa_sample);

export function loads(cases: CaseRow[], reviewers: readonly string[] = REVIEWERS) {
  const m = new Map<string, number>(reviewers.map((r) => [r, 0]));
  let unassigned = 0;
  for (const c of cases.filter(needsReviewer)) {
    const a = c.workflow?.assignee;
    if (!a) unassigned++;
    else m.set(a, (m.get(a) ?? 0) + 1);
  }
  return { perReviewer: [...m.entries()], unassigned };
}

/**
 * Even distribution: oldest unassigned claims first, each to the reviewer with the lowest load,
 * until only `keep` claims are left unassigned (for "Assign to me" and the manager).
 */
export function planDistribution(
  cases: CaseRow[],
  keep: number,
  reviewers: readonly string[] = REVIEWERS,
) {
  const load = new Map<string, number>(
    loads(cases, reviewers).perReviewer.filter(([r]) => reviewers.includes(r)),
  );
  const pool = cases
    .filter((c) => needsReviewer(c) && !c.workflow?.assignee)
    .sort(
      (a, b) =>
        (Date.parse(a.claim.received_at ?? "") || 0) - (Date.parse(b.claim.received_at ?? "") || 0),
    );
  const take = Math.max(0, pool.length - Math.max(0, keep));
  const plan = new Map<string, string[]>(reviewers.map((r) => [r, []]));
  for (const c of pool.slice(0, take)) {
    const [who] = [...load.entries()].sort(
      (a, b) => a[1] - b[1] || reviewers.indexOf(a[0]) - reviewers.indexOf(b[0]),
    )[0];
    plan.get(who)!.push(c.claim.case_id);
    load.set(who, load.get(who)! + 1);
  }
  return plan;
}

async function ok<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
  const r = await p;
  if (r.error) throw r.error;
  return r;
}

/** Assign (or unassign with null) a set of claims and log one event per claim. */
export async function assignCases(caseIds: string[], assignee: string | null, by: string) {
  const now = new Date().toISOString();
  for (let i = 0; i < caseIds.length; i += 200) {
    const part = caseIds.slice(i, i + 200);
    await ok(
      supabase.from("case_workflow").update({ assignee, updated_at: now }).in("case_id", part),
    );
    await ok(
      supabase.from("case_events").insert(
        part.map((case_id) => ({
          case_id,
          type: "assigned",
          actor: by,
          payload: { assignee, by },
        })),
      ),
    );
  }
}
