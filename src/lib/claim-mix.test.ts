import { describe, expect, it } from "vitest";
import { BATCH_POLICY_V2 } from "./batch";
import { caseMix, claimListMix } from "./claim-mix";
import type { CaseRow } from "./data";
import { VOLUME_CLAIMS } from "./quality";
import { decide, type Recommendation } from "./triage";

function row(
  id: string,
  quote: number,
  opts: { closed?: boolean; override?: Recommendation; qa?: boolean } = {},
): CaseRow {
  const claim = {
    case_id: id,
    case_status: opts.closed ? "closed" : "open",
    received_at: null,
    raw: null,
    policy_active_on_incident: true,
    claim_type: "motor_own_damage",
    repair_type: "standard",
    quote_eur: quote,
    incident_report_present: true,
    itemized_quote_present: true,
    injury_reported: false,
    liability_disputed: false,
    duplicate_flag: false,
    evidence_conflict: false,
  };
  const rec = decide(claim, BATCH_POLICY_V2).recommendation;
  return {
    claim,
    decision: {
      id: `D-${id}`,
      policy_version: "v2",
      recommendation: rec,
      rule_id: "",
      explanation: null,
      missing_fields: [],
      needs_recheck: false,
    },
    workflow: {
      queue: rec === "human_review" ? "on_you" : "auto_processed",
      assignee: null,
      qa_sample: !!opts.qa,
      sla_due_at: null,
    },
    intake: null,
    override: opts.override
      ? {
          case_id: id,
          decision_id: `D-${id}`,
          original_recommendation: rec,
          new_recommendation: opts.override,
          reviewer: "Mara Klein",
          reason_code: null,
          reason_text: null,
          created_at: "2026-11-08T00:00:00Z",
        }
      : null,
  };
}

describe("one claim mix for every page", () => {
  const cases = [
    row("A", 500),
    row("B", 1150, { qa: true }), // routine, near the limit, flagged
    row("C", 1500), // over the limit -> review
    row("D", 1600, { override: "routine_processing" }), // a reviewer let it through
    row("E", 700, { closed: true }),
  ];

  it("counts open claims with the recommendation in force, including overrides", () => {
    const m = caseMix(cases, BATCH_POLICY_V2);
    expect(m.open).toBe(4);
    expect(m.counts).toEqual({ routine_processing: 3, request_information: 0, human_review: 1 });
    expect(m.second).toBe(1);
    expect(m.share.routine_processing).toBeCloseTo(0.75);
  });

  it("the limit explorer at a new limit keeps reviewer overrides and re-decides the rest", () => {
    const pol = {
      ...BATCH_POLICY_V2,
      human_review: { ...BATCH_POLICY_V2.human_review, quote_limit_eur: 1000 },
    };
    const m = caseMix(cases, BATCH_POLICY_V2, BATCH_POLICY_V2, pol);
    // A routine (500), B now over 1000 -> review, C review, D keeps the reviewer's routine
    expect(m.counts).toEqual({ routine_processing: 2, request_information: 0, human_review: 2 });
  });

  it("the demo set is decided claim by claim", () => {
    const m = claimListMix(VOLUME_CLAIMS, BATCH_POLICY_V2);
    expect(m.open).toBeGreaterThan(0);
    expect(m.counts.routine_processing + m.counts.request_information + m.counts.human_review).toBe(
      m.open,
    );
  });
});
