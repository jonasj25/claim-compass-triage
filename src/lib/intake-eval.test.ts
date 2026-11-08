import { describe, expect, it } from "vitest";
import { BATCH_POLICY_V2 } from "./batch";
import { EVAL_CASES, runIntakeEval, simulateIntake } from "./intake-eval";

describe("end-to-end quality test", () => {
  it("has realistic reports with an expert label and a reason", () => {
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(40);
    for (const c of EVAL_CASES) {
      expect(["routine_processing", "request_information", "human_review"]).toContain(c.expected);
      expect(c.why.length).toBeGreaterThan(10);
    }
    expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(EVAL_CASES.length);
  });

  it("plays a clear voice report through to routine processing", () => {
    const s = simulateIntake(
      EVAL_CASES.find((c) => c.id === "RC-01")!,
      BATCH_POLICY_V2,
    );
    expect(s.claim).toMatchObject({
      claim_type: "motor_own_damage",
      quote_eur: 640,
      injury_reported: false,
      liability_disputed: false,
      incident_report_present: true,
    });
    expect(s.got).toBe("routine_processing");
  });

  it("lets an uploaded quote correct the customer's figure and flags the contradiction", () => {
    const s = simulateIntake(
      EVAL_CASES.find((c) => c.id === "RC-15")!,
      BATCH_POLICY_V2,
    );
    expect(s.claim.quote_eur).toBe(1450);
    expect(s.conflicts).toContain("quote_amount");
    expect(s.got).toBe("human_review");
  });

  it("adds up: every report is right or one of the three kinds of miss", () => {
    const r = runIntakeEval(BATCH_POLICY_V2);
    expect(r.n).toBe(EVAL_CASES.length);
    expect(r.correct + r.wrongRoutine + r.unnecessaryReview + r.unnecessaryRequest).toBe(r.n);
    expect(r.misses).toHaveLength(r.n - r.correct);
  });
});
