import { describe, expect, it } from "vitest";
import type { CaseRow } from "./data";
import { effectiveRec, overrideFor, type OverrideRow } from "./effective";
import { buildWorkstream, claimStatuses } from "./reviewer-workstream";
import { POLICY_V1, type Recommendation } from "./triage";

const ov = (
  decision_id: string | null,
  to: Recommendation,
  from: Recommendation = "human_review",
  at = "2026-11-07T10:00:00Z",
): OverrideRow => ({
  case_id: "C1",
  decision_id,
  original_recommendation: from,
  new_recommendation: to,
  reviewer: "Mara Klein",
  reason_code: "new_information",
  reason_text: "Customer sent the report",
  created_at: at,
});

function row(rec: Recommendation, override: OverrideRow | null = null): CaseRow {
  return {
    claim: {
      case_id: "C1",
      case_status: "open",
      received_at: "2026-11-07T09:00:00Z",
      raw: null,
      policy_active_on_incident: true,
      claim_type: "motor_own_damage",
      repair_type: "standard",
      quote_eur: 500,
      incident_report_present: true,
      itemized_quote_present: true,
      injury_reported: rec === "human_review",
      liability_disputed: false,
      duplicate_flag: false,
      evidence_conflict: false,
    },
    decision: {
      id: "D1",
      policy_version: "v1",
      recommendation: rec,
      rule_id: "V1.R1",
      explanation: null,
      missing_fields: [],
      needs_recheck: false,
    },
    workflow: {
      queue: rec === "human_review" ? "on_you" : "auto_processed",
      assignee: "Mara Klein",
      qa_sample: false,
      sla_due_at: null,
    },
    intake: null,
    override,
  };
}

describe("the recommendation in force", () => {
  it("is the latest override of the current decision, else the system's decision", () => {
    expect(
      overrideFor("D1", [
        ov("D1", "routine_processing"),
        ov("D1", "request_information", "routine_processing", "2026-11-07T11:00:00Z"),
      ])?.new_recommendation,
    ).toBe("request_information");
    expect(overrideFor("D2", [ov("D1", "routine_processing")])).toBeNull(); // made on an earlier decision
    expect(effectiveRec(row("human_review", ov("D1", "routine_processing")))).toBe(
      "routine_processing",
    );
    expect(effectiveRec(row("human_review"))).toBe("human_review");
  });

  it("an override to routine takes the claim out of the workstream", () => {
    const r = row("human_review", ov("D1", "routine_processing"));
    r.workflow!.queue = "auto_processed"; // what saving the override does
    expect(buildWorkstream([r], POLICY_V1, []).ordered).toEqual([]);
    expect(claimStatuses([r], new Set()).get("C1")).toBe("auto_processed");
  });

  it("an override to human review puts the claim in the workstream, saying who changed it", () => {
    const r = row("routine_processing", ov("D1", "human_review", "routine_processing"));
    r.workflow!.queue = "on_you";
    const item = buildWorkstream([r], POLICY_V1, []).ordered[0];
    expect(item?.group).toBe("decision");
    expect(item?.why).toMatch(
      /Changed by Mara Klein: Auto-processed → To review · Customer sent the report/,
    );
  });

  it("an override settles a pending recheck", () => {
    const r = row("routine_processing", ov("D1", "routine_processing", "routine_processing"));
    r.decision!.needs_recheck = true;
    expect(buildWorkstream([r], POLICY_V1, []).ordered).toEqual([]);
  });
});
