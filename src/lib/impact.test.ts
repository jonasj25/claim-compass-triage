import { describe, expect, it } from "vitest";
import { parseClaimsCsv } from "./csv";
import { SEED_CLAIMS_CSV } from "./seed-claims";
import { POLICY_V1, type Policy } from "./triage";
import { computeImpact } from "./impact";
import { describeRules, diffPolicies, nextVersionId } from "./policy-text";

const claims = parseClaimsCsv(SEED_CLAIMS_CSV);
const stricter: Policy = {
  ...POLICY_V1,
  version: "v9",
  human_review: {
    ...POLICY_V1.human_review,
    quote_limit_eur: 1200,
    review_repair_types: ["ev_high_voltage_battery"],
  },
};

describe("computeImpact", () => {
  it("no change when the candidate equals the active policy", () => {
    const r = computeImpact(claims, POLICY_V1, { ...POLICY_V1, version: "v9" });
    expect(r.changed).toEqual([]);
    expect(r.after).toEqual(r.before);
    expect(r.automationAfter).toBe(r.automationBefore);
  });

  it("flags open claims that change and leaves closed ones untouched", () => {
    const r = computeImpact(claims, POLICY_V1, stricter);
    const ids = r.changed.map((c) => c.case_id).sort();
    // DEV-010 (€1,500), DEV-011 (EV), PRA-003 (€1,201), PRA-004 (€1,450), PRA-005 (EV),
    // PRA-006 (EV + missing quote: review now beats the missing document)
    expect(ids).toEqual(["DEV-010", "DEV-011", "PRA-003", "PRA-004", "PRA-005", "PRA-006"]);
    expect(ids).not.toContain("PRA-009"); // closed €1,350
    expect(ids).not.toContain("PRA-010"); // closed EV
    expect(r.closedWouldChange).toBe(2);
    expect(r.after.human_review - r.before.human_review).toBe(6);
    expect(r.automationAfter).toBeLessThan(r.automationBefore);
  });

  it("measures quality against expected_<candidate> labels", () => {
    const labelled = claims.map((c) => ({
      ...c,
      raw: { ...c.raw, expected_v9: c.raw.expected_v1 },
    }));
    const r = computeImpact(labelled, POLICY_V1, { ...POLICY_V1, version: "v9" });
    expect(r.quality?.after.n).toBe(14);
    expect(r.quality?.after.correct).toBe(14);
  });
});

describe("policy text", () => {
  it("describes the rules in plain language, in order", () => {
    const steps = describeRules(POLICY_V1);
    expect(steps.map((s) => s.code)).toEqual(["R1", "BLANK", "R2", "R3"]);
    expect(steps[0].conditions).toContain("the repair quote is above €1,500");
    expect(steps[0].conditions).toContain("someone reports an injury");
  });

  it("lists changes between versions", () => {
    expect(diffPolicies(POLICY_V1, stricter)).toEqual([
      "Quote limit for review: €1,500 → €1,200",
      "EV high-voltage battery work now goes to a person",
    ]);
    expect(diffPolicies(POLICY_V1, POLICY_V1)).toEqual([]);
  });

  it("proposes the next version id", () => {
    expect(nextVersionId(["v1"])).toBe("v2");
    expect(nextVersionId(["v1", "v3", "draft"])).toBe("v4");
  });
});
