import { describe, expect, it } from "vitest";
import { decide, POLICY_V1 } from "./triage";
import { parseBool, parseClaimsCsv, parseQuote } from "./csv";
import { SEED_CLAIMS_CSV } from "./seed-claims";

const claims = parseClaimsCsv(SEED_CLAIMS_CSV);

describe("triage engine v1", () => {
  it.each(claims.filter((c) => c.raw.expected_v1).map((c) => [c.case_id, c] as const))(
    "%s matches expected_v1",
    (_id, c) => {
      expect(decide(c, POLICY_V1).recommendation).toBe(c.raw.expected_v1);
    },
  );

  it("€1,500.00 is routine, €1,500.01 is human review", () => {
    const base = claims.find((c) => c.case_id === "DEV-010")!;
    expect(decide({ ...base, quote_eur: 1500 }, POLICY_V1).rule_id).toBe("v1.R3");
    expect(decide({ ...base, quote_eur: 1500.01 }, POLICY_V1).rule_id).toBe("v1.R1");
  });

  it("R1 wins over blank fields (DEV-014)", () => {
    const c = claims.find((x) => x.case_id === "DEV-014")!;
    expect(decide(c, POLICY_V1).rule_id).toBe("v1.R1");
  });

  it("blank quote is BLANK, not R2 (DEV-013)", () => {
    const c = claims.find((x) => x.case_id === "DEV-013")!;
    const d = decide(c, POLICY_V1);
    expect(d.rule_id).toBe("v1.BLANK");
    expect(d.missing_fields).toContain("quote_eur");
  });

  it("multiple triggers counterfactual", () => {
    const c = claims.find((x) => x.case_id === "PRA-007")!;
    const d = decide({ ...c, liability_disputed: true }, POLICY_V1);
    expect(d.counterfactual).toBe("2 triggers. Each one alone requires a person.");
  });

  it("single trigger counterfactual", () => {
    const c = claims.find((x) => x.case_id === "DEV-009")!;
    expect(decide(c, POLICY_V1).counterfactual).toBe(
      "Without the evidence conflict this would be Routine.",
    );
  });
});

describe("csv parsing", () => {
  it("parses booleans like Python", () => {
    expect(["TRUE", "1", "yes", "Y", "t"].map(parseBool)).toEqual([true, true, true, true, true]);
    expect(["False", "0", "no", "N", "f"].map(parseBool)).toEqual([false, false, false, false, false]);
    expect(["", "maybe", " "].map(parseBool)).toEqual([null, null, null]);
  });
  it("parses quote amounts", () => {
    expect(parseQuote("€1,500.50")).toBe(1500.5);
    expect(parseQuote("")).toBeNull();
    expect(parseQuote("unreadable")).toBeNull();
  });
});
