import { describe, expect, it } from "vitest";
import { accessibleRoles, canAccess, highestRole, sectionOf } from "./role";

describe("role hierarchy", () => {
  it("ops lead sees everything, policy owner sees policy + reviewer, reviewer only reviewer", () => {
    expect(accessibleRoles("ops_lead")).toEqual(["reviewer", "policy_owner", "ops_lead"]);
    expect(accessibleRoles("policy_owner")).toEqual(["reviewer", "policy_owner"]);
    expect(accessibleRoles("reviewer")).toEqual(["reviewer"]);
    expect(canAccess("reviewer", "policy_owner")).toBe(false);
    expect(canAccess("policy_owner", "ops_lead")).toBe(false);
  });

  it("maps pages to sections; shared pages belong to none", () => {
    expect(sectionOf("/dashboard")).toBe("reviewer");
    expect(sectionOf("/claims/PRA-001")).toBe("reviewer");
    expect(sectionOf("/advisor")).toBe("policy_owner");
    expect(sectionOf("/business-case/")).toBe("ops_lead");
    expect(sectionOf("/quality")).toBe("ops_lead");
    expect(sectionOf("/import")).toBeNull();
  });

  it("uses the highest of several role rows", () => {
    expect(highestRole(["reviewer", "ops_lead"])).toBe("ops_lead");
    expect(highestRole([])).toBe("reviewer");
    expect(highestRole(["unknown"])).toBe("reviewer");
  });
});
