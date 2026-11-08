// Automatic assignment: every claim that newly needs a person (to review, or a second check)
// goes to the reviewer with the fewest open claims needing a person at that moment.
// Takes the database client as a parameter so it works in the browser and in server functions.
// Assignment is workload only; it never changes a recommendation. Each assignment is logged as an event.
import { REVIEWERS } from "./lifecycle";

// Minimal shape of the Supabase query builder we use (browser or admin client).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

interface WorkflowRow {
  case_id: string;
  assignee: string | null;
  queue: string;
  qa_sample: boolean;
}

const needsPerson = (w: WorkflowRow) => w.queue !== "done" && (w.queue === "on_you" || w.qa_sample);

/** Reviewer for each new claim, in order: always the one with the lowest load, ties by list order. */
export function pickReviewers(
  n: number,
  load: Map<string, number>,
  reviewers: readonly string[] = REVIEWERS,
): string[] {
  const l = new Map(reviewers.map((r) => [r, load.get(r) ?? 0]));
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const who = reviewers.reduce((a, b) => ((l.get(b) ?? 0) < (l.get(a) ?? 0) ? b : a));
    out.push(who);
    l.set(who, (l.get(who) ?? 0) + 1);
  }
  return out;
}

type Query = ReturnType<Db["from"]>;

async function rows(db: Db, filter: (q: Query) => Query): Promise<WorkflowRow[]> {
  const out: WorkflowRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(
      db.from("case_workflow").select("case_id,assignee,queue,qa_sample"),
    ).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as WorkflowRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Current load per reviewer: open claims that need a person and are assigned to them. */
export async function currentLoads(db: Db, reviewers: readonly string[] = REVIEWERS) {
  const load = new Map<string, number>(reviewers.map((r) => [r, 0]));
  for (const w of await rows(db, (q) => q.not("assignee", "is", null).neq("queue", "done")))
    if (needsPerson(w) && w.assignee && load.has(w.assignee))
      load.set(w.assignee, load.get(w.assignee)! + 1);
  return load;
}

/**
 * Assign the given claims if they need a person and have no owner yet.
 * Returns the assignments made. Callers treat failures as non-fatal (the claim simply stays unassigned).
 */
export async function autoAssign(
  db: Db,
  caseIds: string[],
  reviewers: readonly string[] = REVIEWERS,
) {
  if (!caseIds.length) return [] as { case_id: string; assignee: string }[];
  const todo: string[] = [];
  for (let i = 0; i < caseIds.length; i += 200) {
    const part = caseIds.slice(i, i + 200);
    for (const w of await rows(db, (q) => q.in("case_id", part)))
      if (!w.assignee && needsPerson(w)) todo.push(w.case_id);
  }
  if (!todo.length) return [];
  const who = pickReviewers(todo.length, await currentLoads(db, reviewers), reviewers);
  const made = todo.map((case_id, k) => ({ case_id, assignee: who[k] }));
  const now = new Date().toISOString();
  const byReviewer = new Map<string, string[]>();
  for (const m of made)
    byReviewer.set(m.assignee, [...(byReviewer.get(m.assignee) ?? []), m.case_id]);
  for (const [assignee, ids] of byReviewer) {
    const r = await db
      .from("case_workflow")
      .update({ assignee, updated_at: now })
      .in("case_id", ids)
      .is("assignee", null);
    if (r.error) throw r.error;
  }
  const ev = await db.from("case_events").insert(
    made.map((m) => ({
      case_id: m.case_id,
      type: "assigned",
      actor: "Auto-assign",
      payload: { assignee: m.assignee, by: "Auto-assign", rule: "lowest load" },
    })),
  );
  if (ev.error) throw ev.error;
  return made;
}

/** Non-fatal wrapper for intake paths. */
export async function tryAutoAssign(db: Db, caseIds: string[]) {
  try {
    return await autoAssign(db, caseIds);
  } catch {
    return [];
  }
}
