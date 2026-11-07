import { describe, expect, it } from "vitest";
import { POLICY_V1, type Policy } from "./triage";
import { secondCheckBand, secondCheckReason } from "./second-check";

const v2: Policy = {
  ...POLICY_V1,
  version: "v2",
  human_review: { ...POLICY_V1.human_review, quote_limit_eur: 1200 },
};

describe("second check near the limit (€50 margin)", () => {
  it("band is the €50 just under the limit", () => {
    expect(secondCheckBand(POLICY_V1)).toEqual({ from: 1450, to: 1500 });
    expect(secondCheckBand(v2)).toEqual({ from: 1150, to: 1200 });
  });

  it("flags routine claims inside the band only", () => {
    const r = (q: number | null) => secondCheckReason({ quote_eur: q }, v2, "routine_processing");
    expect(r(1150)).toBeNull(); // exactly €50 below is outside
    expect(r(1150.01)).not.toBeNull();
    expect(r(1200)).toContain("within €50 of the €1,200 limit");
    expect(r(1201)).toBeNull(); // over the limit is human review anyway
    expect(r(1100)).toBeNull();
    expect(r(null)).toBeNull();
    expect(secondCheckReason({ quote_eur: 1180 }, v2, "human_review")).toBeNull();
    expect(secondCheckReason({ quote_eur: 1180 }, v2, "request_information")).toBeNull();
  });

  it("never applies without a quote limit", () => {
    const noLimit: Policy = { ...v2, human_review: { ...v2.human_review, quote_limit_eur: null } };
    expect(secondCheckBand(noLimit)).toBeNull();
    expect(secondCheckReason({ quote_eur: 1180 }, noLimit, "routine_processing")).toBeNull();
  });
});
