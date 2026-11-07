import { describe, expect, it } from "vitest";
import { decide, POLICY_V1 } from "./triage";
import { EMPTY_ANSWERS, QUESTIONS, extractFromUtterance, interpretReply, knownClaimFields, parseEuro, toClaimFields, toCsvRow, type ReportAnswers } from "./report-intake";

const q = (k: string) => QUESTIONS.find((x) => x.key === k)!;
const today = new Date(2026, 10, 7);

describe("customer report intake", () => {
  it("parses euro amounts in common formats and keeps unreadable ones unknown", () => {
    expect(parseEuro("1,450")).toBe(1450);
    expect(parseEuro("1.450,00")).toBe(1450);
    expect(parseEuro("€ 1500.01")).toBe(1500.01);
    expect(parseEuro("about a thousand")).toBeNull();
  });

  it("keeps 'not sure' and empty answers as null, never false", () => {
    const f = toClaimFields({ ...EMPTY_ANSWERS, injury: "unsure", other_party: "yes", fault: "unsure" });
    expect(f.injury_reported).toBeNull();
    expect(f.liability_disputed).toBeNull();
    expect(f.quote_eur).toBeNull();
    expect(f.claim_type).toBeNull();
  });

  it("hears several facts in one story", () => {
    const x = extractFromUtterance("I reversed into a pole yesterday and dented the bumper. Nobody was hurt. The quote is 1,450 euros, it lists each part, but I don't have a police report.", today);
    expect(x).toMatchObject({ incident_date: "2026-11-06", claim_kind: "own_damage", injury: "no", repair_kind: "standard", quote_amount: "1450", quote_itemized: "yes", incident_report: "no" });
  });

  it("reads short replies to the question just asked", () => {
    expect(interpretReply(q("injury"), "No.")).toEqual({ injury: "no" });
    expect(interpretReply(q("fault"), "No, we don't")).toEqual({ fault: "disagree" });
    expect(interpretReply(q("quote_itemized"), "I'm not sure")).toEqual({ quote_itemized: "unsure" });
    expect(interpretReply(q("email"), "lucas at example dot com")).toEqual({ email: "lucas@example.com" });
  });

  it("feeds the unchanged rules engine", () => {
    const a: ReportAnswers = { ...EMPTY_ANSWERS, claim_kind: "own_damage", injury: "no", other_party: "no", repair_kind: "standard", quote_amount: "650", quote_itemized: "yes", incident_report: "yes", what_happened: "Parking scrape" };
    const base = { case_id: "WEB-1", policy_active_on_incident: true, duplicate_flag: false, evidence_conflict: false };
    expect(decide({ ...base, ...toClaimFields(a) }, POLICY_V1).rule_id).toBe("v1.R3");
    expect(decide({ ...base, ...toClaimFields({ ...a, incident_report: "unsure" }) }, POLICY_V1).rule_id).toBe("v1.BLANK");
    expect(decide({ ...base, ...toClaimFields({ ...a, incident_report: "no" }) }, POLICY_V1).rule_id).toBe("v1.R2");
    expect(decide({ ...base, ...toClaimFields({ ...a, injury: "yes" }) }, POLICY_V1).rule_id).toBe("v1.R1");
  });
});

describe("voice replies", () => {
  it("does not take a whole story as a name", () => {
    expect(interpretReply(q("name"), "Yesterday I reversed into a pole in a car park and dented the bumper")).toEqual({});
    expect(interpretReply(q("name"), "Anna Schmidt")).toEqual({ name: "Anna Schmidt" });
  });
});

describe("claim file", () => {
  it("records 'not sure' for amount and policy number instead of getting stuck", () => {
    expect(interpretReply(q("quote_amount"), "I don't know yet")).toEqual({ quote_amount: "unsure" });
    expect(interpretReply(q("policy_number"), "I don't have it with me")).toEqual({ policy_number: "unsure" });
  });

  it("follow-up answers only change what the customer stated", () => {
    expect(knownClaimFields({ incident_report: "yes" })).toEqual({ incident_report_present: true });
    expect(knownClaimFields({ incident_report: "unsure" })).toEqual({});
    expect(knownClaimFields({ other_party: "yes", fault: "disagree" })).toEqual({ liability_disputed: true });
    expect(knownClaimFields({ policy_number: "unsure" })).toEqual({});
    expect(knownClaimFields({ policy_number: "POL-1" })).toEqual({ policy_active_on_incident: true });
  });

  it("writes the claim as a CSV row with empty cells for unknowns", () => {
    const csv = toCsvRow({ case_id: "WEB-1", case_status: "open", claim_summary: "Bumper, rear", policy_active_on_incident: true, quote_eur: null, incident_report_present: false });
    expect(csv.split("\n")[0]).toBe("case_id,case_status,claim_summary,policy_active_on_incident,claim_type,repair_type,quote_eur,incident_report_present,itemized_quote_present,injury_reported,liability_disputed,duplicate_flag,evidence_conflict");
    expect(csv.split("\n")[1]).toBe('WEB-1,open,"Bumper, rear",True,,,,False,,,,,');
  });
});
