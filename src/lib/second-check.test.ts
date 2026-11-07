import { describe, expect, it } from "vitest";
import { POLICY_V1, type Policy } from "./triage";
import { breakEvenShare, secondCheckBand, secondCheckReason } from "./second-check";

const v2: Policy = {
  ...POLICY_V1,
  version: "v2",
  human_review: { ...POLICY_V1.human_review, quote_limit_eur: 1200 },
};

describe("second check near the limit", () => {
  it("derives the band from the limit and the assumed cost uplift", () => {
    expect(secondCheckBand(POLICY_V1)).toEqual({ from: 1250, to: 1500 });
    expect(secondCheckBand(v2)).toEqual({ from: 1000, to: 1200 });
    expect(breakEvenShare).toBeCloseTo(0.05);
  });

  it("flags routine claims inside the band only", () => {
    const r = (q: number | null, rec = "routine_processing" as const) =>
      secondCheckReason({ quote_eur: q }, v2, rec);
    expect(r(1000)).toBeNull(); // band starts above €1,000
    expect(r(1000.01)).not.toBeNull();
    expect(r(1200)).toContain("close to the €1,200 limit");
    expect(r(1201)).toBeNull(); // over the limit is human review anyway
    expect(r(null)).toBeNull();
    expect(secondCheckReason({ quote_eur: 1100 }, v2, "human_review")).toBeNull();
    expect(secondCheckReason({ quote_eur: 1100 }, v2, "request_information")).toBeNull();
  });

  it("never applies without a quote limit", () => {
    const noLimit: Policy = { ...v2, human_review: { ...v2.human_review, quote_limit_eur: null } };
    expect(secondCheckBand(noLimit)).toBeNull();
    expect(secondCheckReason({ quote_eur: 1100 }, noLimit, "routine_processing")).toBeNull();
  });
});
