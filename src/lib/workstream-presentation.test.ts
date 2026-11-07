import { describe, expect, it } from "vitest";
import { claimPriority, isNewToday } from "./workstream-presentation";

const c = (quote_eur: number | null, flags: Partial<Record<"injury_reported" | "duplicate_flag" | "evidence_conflict", boolean | null>> = {}) =>
  ({ quote_eur, injury_reported: false, duplicate_flag: false, evidence_conflict: false, ...flags });

describe("review priority", () => {
  it("uses the quote bands", () => {
    expect(claimPriority(c(2500), "Risk cases").level).toBe("High");
    expect(claimPriority(c(2499), "Risk cases").level).toBe("Medium");
    expect(claimPriority(c(1000), "Risk cases").level).toBe("Medium");
    expect(claimPriority(c(999), "Risk cases").level).toBe("Low");
    expect(claimPriority(c(null), "Risk cases").level).toBe("Medium");
  });
  it("puts injury and possible fraud first, whatever the amount", () => {
    expect(claimPriority(c(345, { injury_reported: true }), "Risk cases").level).toBe("High");
    expect(claimPriority(c(300, { duplicate_flag: true }), "Risk cases").level).toBe("High");
    expect(claimPriority(c(300, { evidence_conflict: true }), "Risk cases").level).toBe("High");
  });
  it("keeps quick double-checks low and unknown flags never count as a risk", () => {
    expect(claimPriority(c(1200), "Near limit").level).toBe("Low");
    expect(claimPriority(c(3000), "QA sample").level).toBe("Low");
    expect(claimPriority(c(300, { injury_reported: null }), "Risk cases").level).toBe("Low");
  });
  it("marks claims received today as new", () => {
    const now = new Date("2026-11-07T21:00:00");
    expect(isNewToday("2026-11-07T08:00:00", now)).toBe(true);
    expect(isNewToday("2026-11-06T23:00:00", now)).toBe(false);
    expect(isNewToday(null, now)).toBe(false);
  });
});
