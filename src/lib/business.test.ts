import { describe, expect, it } from "vitest";
import {
  breakEvenProbability,
  defaultInputs,
  errorCost,
  hourlyCost,
  policyChangeCost,
  triageEconomics,
  unnecessaryReviewCost,
  wrongRoutineCost,
} from "./business";
import { BATCH_POLICY_V1, BATCH_POLICY_V2 } from "./batch";
import { labelledReport, volumeMix } from "./quality";

describe("labelled quality report", () => {
  const r = labelledReport();
  it("scores v1 and v2 on the shipped labelled set like the Python report", () => {
    expect(r.total).toBe(51);
    expect(r.v1).toMatchObject({ n: 51, correct: 51, wrongRoutine: 0 });
    expect(r.v2).toMatchObject({ n: 48, correct: 48, wrongRoutine: 0 }); // 3 closed excluded
    expect(r.keepV1).toMatchObject({ n: 48, correct: 40, wrongRoutine: 7 });
    expect(r.changedV2).toMatchObject({ n: 8, correct: 8 });
    expect(r.changedKeepV1.correct).toBe(0);
    expect(r.closed).toEqual({ n: 3, kept: 3 });
    expect(r.mistakesV2).toEqual([]);
    expect(r.mistakesKeepV1).toHaveLength(8);
  });
});

describe("business model", () => {
  const i = defaultInputs();
  const mix = volumeMix(BATCH_POLICY_V2, BATCH_POLICY_V1);

  it("derives unit costs from the inputs", () => {
    expect(hourlyCost(i)).toBeCloseTo((55000 * 1.3) / 1600);
    expect(wrongRoutineCost(i)).toBe(275); // €1,100 claim × 25% avoidable
    expect(unnecessaryReviewCost(i)).toBeCloseTo(0.25 * hourlyCost(i));
    const p = breakEvenProbability(i); // ≈ 3.9%: escalate as soon as a person is needed more than 1 in 25 times
    expect(p).toBeGreaterThan(0.03);
    expect(p).toBeLessThan(0.05);
  });

  it("computes today vs with the system, net benefit and payback", () => {
    const o = triageEconomics(i, mix, 0.01);
    expect(o.todayHours).toBeCloseTo(25000);
    expect(o.withHours).toBeLessThan(o.todayHours);
    expect(o.netPerYear).toBeCloseTo(o.todayCost - o.withCost);
    expect(o.paybackMonths).toBeCloseTo((i.implementation / o.netPerYear) * 12);
    expect(o.automation).toBeCloseTo(mix.share.routine_processing + mix.share.request_information);
  });

  it("prices errors from measured rates", () => {
    const e = errorCost(i, { n: 48, correct: 40, wrongRoutine: 7, unnecessaryReview: 0 });
    expect(e.wrong).toBeCloseTo((7 / 48) * 100000 * 275);
    expect(errorCost(i, { n: 48, correct: 48, wrongRoutine: 0, unnecessaryReview: 0 }).total).toBe(
      0,
    );
  });

  it("policy change is far cheaper with the system", () => {
    const c = policyChangeCost(i, mix);
    expect(mix.staleWrongRoutine).toBeGreaterThan(0);
    expect(c.withSystem.total).toBeLessThan(c.today.total / 10);
  });
});
