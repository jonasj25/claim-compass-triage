import { beforeEach, describe, expect, it } from "vitest";
import { readCaseNav, saveCaseNav } from "./case-nav";

beforeEach(() => sessionStorage.clear());
describe("workstream navigation", () => {
  it("retains all ordered cases while resolving each current group label across groups", () => {
    saveCaseNav("Overdue", ["A", "B", "C"], { A: "Overdue", B: "Risk cases", C: "Near the limit" });
    window.history.replaceState({}, "", "/claims/B");
    expect(readCaseNav()).toMatchObject({ label: "Risk cases", ids: ["A", "B", "C"] });
    window.history.replaceState({}, "", "/claims/C");
    expect(readCaseNav()?.label).toBe("Near the limit");
  });
  it("preserves the existing claims-list navigation contract", () => {
    saveCaseNav("All claims", ["A", "B"]);
    window.history.replaceState({}, "", "/claims/B");
    expect(readCaseNav()).toEqual({ label: "All claims", ids: ["A", "B"] });
  });
});