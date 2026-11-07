import { describe, expect, it } from "vitest";
import { autoAssign, pickReviewers } from "./auto-assign";

const R = ["Ann", "Bob", "Cem"] as const;

/** Tiny in-memory stand-in for the Supabase query builder. */
function fakeDb(
  workflow: { case_id: string; assignee: string | null; queue: string; qa_sample: boolean }[],
) {
  const events: unknown[] = [];
  const db = {
    from(table: string) {
      const filters: ((r: (typeof workflow)[number]) => boolean)[] = [];
      let patch: Record<string, unknown> | null = null;
      const q: Record<string, unknown> = {
        select: () => q,
        not: (c: string) => (filters.push((r) => (r as Record<string, unknown>)[c] !== null), q),
        neq: (c: string, v: unknown) => (
          filters.push((r) => (r as Record<string, unknown>)[c] !== v),
          q
        ),
        in: (c: string, v: unknown[]) => (
          filters.push((r) => v.includes((r as Record<string, unknown>)[c])),
          q
        ),
        is: (c: string, v: unknown) => (
          filters.push((r) => (r as Record<string, unknown>)[c] === v),
          q
        ),
        range: () => q,
        update: (p: Record<string, unknown>) => ((patch = p), q),
        insert: (p: unknown[]) => (events.push(...p), q),
        then: (res: (v: unknown) => unknown) => {
          const hit = workflow.filter((r) => filters.every((f) => f(r)));
          if (table === "case_workflow" && patch) for (const r of hit) Object.assign(r, patch);
          return Promise.resolve({
            error: null,
            data: table === "case_workflow" && !patch ? hit.map((r) => ({ ...r })) : null,
          }).then(res);
        },
      };
      return q;
    },
  };
  return { db, workflow, events };
}

describe("automatic assignment", () => {
  it("always picks the reviewer with the lowest load", () => {
    expect(
      pickReviewers(
        4,
        new Map([
          ["Ann", 3],
          ["Bob", 1],
          ["Cem", 1],
        ]),
        R,
      ),
    ).toEqual(["Bob", "Cem", "Bob", "Cem"]);
  });

  it("assigns new claims that need a person to the least loaded reviewer and logs events", async () => {
    const { db, workflow, events } = fakeDb([
      { case_id: "OLD1", assignee: "Ann", queue: "on_you", qa_sample: false },
      { case_id: "OLD2", assignee: "Ann", queue: "on_you", qa_sample: false },
      { case_id: "OLD3", assignee: "Bob", queue: "auto_processed", qa_sample: true },
      { case_id: "NEW1", assignee: null, queue: "on_you", qa_sample: false },
      { case_id: "NEW2", assignee: null, queue: "auto_processed", qa_sample: true },
      { case_id: "NEW3", assignee: null, queue: "waiting_customer", qa_sample: false }, // no person needed
      { case_id: "NEW4", assignee: "Ann", queue: "on_you", qa_sample: false }, // already owned
    ]);
    const made = await autoAssign(db, ["NEW1", "NEW2", "NEW3", "NEW4"], R);
    expect(made).toEqual([
      { case_id: "NEW1", assignee: "Cem" }, // Cem 0, Bob 1, Ann 3
      { case_id: "NEW2", assignee: "Bob" }, // Bob 1 = Cem 1 -> list order
    ]);
    expect(workflow.find((w) => w.case_id === "NEW3")!.assignee).toBeNull();
    expect(workflow.find((w) => w.case_id === "NEW4")!.assignee).toBe("Ann");
    expect(events).toHaveLength(2);
  });
});
