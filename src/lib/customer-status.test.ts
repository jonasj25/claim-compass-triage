import { describe, expect, it } from "vitest";
import { customerStatus, plateKey } from "./customer-status";

describe("customer status", () => {
  const s = (o: Partial<Parameters<typeof customerStatus>[0]>) =>
    customerStatus({ caseStatus: "open", queue: null, recommendation: null, outcome: null, ...o });

  it("maps the claim's state to the four customer statuses", () => {
    expect(s({ queue: "on_you", recommendation: "human_review" })).toBe("in_review");
    expect(s({ queue: "waiting_customer", recommendation: "request_information" })).toBe(
      "information_needed",
    );
    expect(s({ queue: "auto_processed", recommendation: "routine_processing" })).toBe("accepted");
    expect(s({ queue: "done", caseStatus: "closed", outcome: "denied" })).toBe("rejected");
    expect(s({ queue: "done", caseStatus: "closed", outcome: "accepted" })).toBe("accepted");
  });

  it("only a recorded denial means rejected; closed without one is accepted", () => {
    expect(s({ caseStatus: "closed", recommendation: "human_review" })).toBe("accepted");
    expect(s({ caseStatus: "closed", recommendation: "routine_processing", queue: "done" })).toBe(
      "accepted",
    );
  });

  it("a second check does not hold the customer back", () => {
    expect(s({ queue: "auto_processed", recommendation: "routine_processing" })).toBe("accepted");
  });

  it("falls back to the recommendation when there is no workflow row", () => {
    expect(s({ recommendation: "human_review" })).toBe("in_review");
    expect(s({ recommendation: "request_information" })).toBe("information_needed");
  });

  it("compares number plates loosely", () => {
    expect(plateKey("M-AK 1000")).toBe(plateKey("mak1000"));
    expect(plateKey(null)).toBe("");
  });
});
