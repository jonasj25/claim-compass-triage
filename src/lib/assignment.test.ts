import { describe, expect, it } from "vitest";
import { loads, needsReviewer, planDistribution } from "./assignment";
import type { CaseRow } from "./data";

const row = (
  id: string,
  queue: string,
  assignee: string | null = null,
  extra: Partial<CaseRow["workflow"]> = {},
  status = "open",
): CaseRow =>
  ({
    claim: {
      case_id: id,
      case_status: status,
      received_at: `2026-11-0${(Number(id.slice(-1)) % 7) + 1}T10:00:00Z`,
    },
    decision: null,
    workflow: { queue, assignee, qa_sample: false, sla_due_at: null, ...extra },
    intake: null,
  }) as unknown as CaseRow;

const R = ["Ann", "Bob", "Cem"] as const;

describe("assignment", () => {
  const cases = [
    row("C1", "on_you"),
    row("C2", "on_you"),
    row("C3", "on_you", "Ann"),
    row("C4", "on_you"),
    row("C5", "auto_processed", null, { qa_sample: true }),
    row("C6", "auto_processed"),
    row("C7", "on_you", null, {}, "closed"),
    row("C8", "waiting_customer"),
  ];

  it("counts only open claims that need a person", () => {
    expect(cases.filter(needsReviewer).map((c) => c.claim.case_id)).toEqual([
      "C1",
      "C2",
      "C3",
      "C4",
      "C5",
    ]);
    expect(loads(cases, R)).toEqual({
      perReviewer: [
        ["Ann", 1],
        ["Bob", 0],
        ["Cem", 0],
      ],
      unassigned: 4,
    });
  });

  it("distributes evenly to the least loaded reviewers and leaves `keep` unassigned", () => {
    const plan = planDistribution(cases, 1, R);
    const assigned = [...plan.values()].flat();
    expect(assigned).toHaveLength(3);
    // Ann already had one, so Bob and Cem get the first two; then everyone has one and the third goes to Ann
    const final = {
      Ann: 1 + plan.get("Ann")!.length,
      Bob: plan.get("Bob")!.length,
      Cem: plan.get("Cem")!.length,
    };
    expect(final).toEqual({ Ann: 2, Bob: 1, Cem: 1 });
    expect(
      Math.max(...Object.values(final)) - Math.min(...Object.values(final)),
    ).toBeLessThanOrEqual(1);
  });

  it("assigns nothing when keep covers all unassigned", () => {
    expect([...planDistribution(cases, 10, R).values()].flat()).toEqual([]);
  });
});
