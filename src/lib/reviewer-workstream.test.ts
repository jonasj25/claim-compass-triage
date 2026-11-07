import { describe, expect, it } from "vitest";
import type { CaseRow } from "./data";
import { POLICY_V1, type Recommendation } from "./triage";
import { buildWorkstream, doneToday, type WorkEvent } from "./reviewer-workstream";

const now = new Date("2026-11-07T12:00:00Z");
function row(id: string, rec: Recommendation = "human_review"): CaseRow {
  return {
    claim: { case_id: id, case_status: "open", received_at: "2026-11-07T09:00:00Z", raw: null,
      policy_active_on_incident: true, claim_type: "motor_own_damage", repair_type: "standard", quote_eur: 500,
      incident_report_present: true, itemized_quote_present: true, injury_reported: rec === "human_review",
      liability_disputed: false, duplicate_flag: false, evidence_conflict: false },
    decision: { id, policy_version: "v1", recommendation: rec, rule_id: "V1.R1", explanation: null, missing_fields: [], needs_recheck: false },
    workflow: { queue: rec === "human_review" ? "on_you" : "auto_processed", assignee: "Mara Klein", qa_sample: false, sla_due_at: null }, intake: null,
  };
}
const event = (caseId: string, type: string, created = "2026-11-07T10:00:00Z", payload: Record<string, unknown> = {}): WorkEvent =>
  ({ case_id: caseId, type, actor: "Mara Klein", created_at: created, payload });
const stream = (cases: CaseRow[], events: WorkEvent[] = []) => buildWorkstream(cases, POLICY_V1, "Mara Klein", events, now);

describe("reviewer workstream", () => {
  it("uses first-match group priority, with no duplicates and group totals equal to the work total", () => {
    const overdue = row("overdue");
    if (overdue.workflow) overdue.workflow.sla_due_at = "2026-11-07T11:59:59Z";
    if (overdue.decision) overdue.decision.needs_recheck = true;
    const replied = row("reply"), risk = row("risk"), policy = row("policy", "routine_processing"), near = row("near", "routine_processing"), qa = row("qa", "routine_processing");
    if (replied.decision) replied.decision.needs_recheck = true;
    if (risk.decision) risk.decision.needs_recheck = true;
    if (policy.decision) policy.decision.needs_recheck = true;
    near.claim.quote_eur = 1450;
    if (qa.workflow) qa.workflow.qa_sample = true;
    const result = stream([qa, near, policy, risk, replied, overdue, overdue], [event("reply", "message_received"), event("reply", "retriaged")]);
    expect(result.groups.map((g) => g.key)).toEqual(["overdue", "customer_replied", "risk", "policy_change", "near_limit", "qa"]);
    expect(result.ordered.map((i) => i.row.claim.case_id)).toEqual(["overdue", "reply", "risk", "policy", "near", "qa"]);
    expect(result.groups.reduce((n, g) => n + g.items.length, 0)).toBe(6);
    expect(new Set(result.ordered.map((i) => i.row.claim.case_id)).size).toBe(6);
  });
  it("includes mine and unassigned, never a colleague's assigned cases", () => {
    const unassigned = row("unassigned"), colleague = row("colleague");
    if (unassigned.workflow) unassigned.workflow.assignee = null;
    if (colleague.workflow) colleague.workflow.assignee = "Jonas Weber";
    expect(stream([row("mine"), unassigned, colleague]).ordered.map((i) => i.row.claim.case_id)).toEqual(["mine", "unassigned"]);
  });
  it("excludes waiting, unflagged auto, done and closed even when overdue or marked for policy recheck", () => {
    const waiting = row("waiting"), auto = row("auto", "routine_processing"), done = row("done"), closed = row("closed"), statusDone = row("status-done");
    if (waiting.workflow) waiting.workflow.queue = "waiting_customer";
    if (done.workflow) done.workflow.queue = "done";
    closed.claim.case_status = "closed";
    statusDone.claim.case_status = "done";
    for (const c of [waiting, done, closed, statusDone]) {
      if (c.decision) c.decision.needs_recheck = true;
      if (c.workflow) c.workflow.sla_due_at = "2026-11-01T12:00:00Z";
    }
    expect(stream([waiting, auto, done, closed, statusDone]).ordered).toEqual([]);
  });
  it("keeps the €1,450 near-limit recommendation Routine with the exact €50 gap, never random QA", () => {
    const near = row("near", "routine_processing");
    near.claim.quote_eur = 1450;
    if (near.workflow) near.workflow.qa_sample = true;
    const item = stream([near]).ordered[0];
    expect(item?.group).toBe("near_limit");
    expect(item?.nearLimit).toContain("€1,450 – only €50 under the €1,500 limit");
    expect(item?.row.decision?.recommendation).toBe("routine_processing");
    expect(item?.qa).toBe(false);
  });
  it("retains the near-limit flag when SLA priority moves the case to overdue", () => {
    const near = row("near", "routine_processing"); near.claim.quote_eur = 1450;
    if (near.workflow) near.workflow.sla_due_at = "2026-11-07T11:00:00Z";
    const item = stream([near]).ordered[0];
    expect(item?.group).toBe("overdue"); expect(item?.nearLimit).not.toBeNull();
  });
  it("uses the supplied policy's second-check boundary, not a hardcoded future version", () => {
    const near = row("near", "routine_processing"); near.claim.quote_eur = 1150;
    const changed = { ...POLICY_V1, version: "v7", human_review: { ...POLICY_V1.human_review, quote_limit_eur: 1200 } };
    expect(stream([near]).ordered).toEqual([]);
    expect(buildWorkstream([near], changed, "Mara Klein", [], now).ordered[0]?.nearLimit).toContain("€50 under the €1,200 limit");
  });
  it("does not treat a handled historical customer reply as new work", () => {
    const history = [event("risk", "message_received"), event("risk", "retriaged"), event("risk", "confirmed", "2026-11-07T11:00:00Z")];
    expect(stream([row("risk")], history).ordered[0]?.group).toBe("risk");
  });
  it("sorts oldest first within each group, keeping null age unknown and last", () => {
    const old = row("old"), recent = row("recent"), unknown = row("unknown");
    old.claim.received_at = "2026-11-06T12:00:00Z"; unknown.claim.received_at = null;
    expect(stream([unknown, recent, old]).ordered.map((i) => i.row.claim.case_id)).toEqual(["old", "recent", "unknown"]);
  });
  it("counts only this reviewer's distinct completed cases today", () => {
    const colleague = { ...event("other", "confirmed"), actor: "Jonas Weber" };
    expect(doneToday([event("one", "confirmed"), event("one", "override"), event("two", "qa_confirmed"), colleague, event("yesterday", "confirmed", "2026-11-06T12:00:00Z")], "Mara Klein", now)).toBe(2);
  });
});