import { describe, expect, it } from "vitest";
import type { CaseRow } from "./data";
import { POLICY_V1, type Recommendation } from "./triage";
import { buildWorkstream, claimStatuses, type WorkEvent } from "./reviewer-workstream";

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
const stream = (cases: CaseRow[], events: WorkEvent[] = [], outreach: { case_id: string; reminder_count: number }[] = []) => buildWorkstream(cases, POLICY_V1, events, outreach);
void now;

describe("reviewer workstream", () => {
  it("uses first-match group priority, with no duplicates and group totals equal to the work total", () => {
    const replied = row("reply"), risk = row("risk"), policy = row("policy", "routine_processing"), near = row("near", "routine_processing"), qa = row("qa", "routine_processing");
    const silent = row("silent", "request_information");
    if (silent.workflow) silent.workflow.queue = "waiting_customer";
    if (replied.decision) replied.decision.needs_recheck = true;
    if (risk.decision) risk.decision.needs_recheck = true;
    if (policy.decision) policy.decision.needs_recheck = true;
    near.claim.quote_eur = 1450;
    if (qa.workflow) qa.workflow.qa_sample = true;
    const result = stream([qa, near, policy, risk, replied, silent, risk],
      [event("reply", "message_received"), event("reply", "retriaged"), event("silent", "reminder_sent"), event("silent", "reminder_sent", "2026-11-07T11:00:00Z")]);
    expect(result.groups.map((g) => g.key)).toEqual(["decision", "policy_change", "no_reply", "double_check"]);
    expect(result.ordered.map((i) => i.row.claim.case_id)).toEqual(["reply", "policy", "risk", "silent", "near", "qa"]);
    expect(new Set(result.ordered.map((i) => i.row.claim.case_id)).size).toBe(6);
    expect(result.ordered.find((i) => i.row.claim.case_id === "reply")?.replied).toBe(true);
  });
  it("shows every open case that needs a person, whoever it is assigned to (single reviewer)", () => {
    const unassigned = row("unassigned"), colleague = row("colleague");
    if (unassigned.workflow) unassigned.workflow.assignee = null;
    if (colleague.workflow) colleague.workflow.assignee = "Jonas Weber";
    expect(stream([row("mine"), unassigned, colleague]).ordered.map((i) => i.row.claim.case_id)).toEqual(["colleague", "mine", "unassigned"]);
  });
  it("excludes waiting (under 2 reminders), unflagged auto, done and closed, even when marked for policy recheck", () => {
    const waiting = row("waiting"), auto = row("auto", "routine_processing"), done = row("done"), closed = row("closed"), statusDone = row("status-done");
    if (waiting.workflow) waiting.workflow.queue = "waiting_customer";
    if (done.workflow) done.workflow.queue = "done";
    closed.claim.case_status = "closed";
    statusDone.claim.case_status = "done";
    for (const c of [waiting, done, closed, statusDone]) if (c.decision) c.decision.needs_recheck = true;
    expect(stream([waiting, auto, done, closed, statusDone], [event("waiting", "reminder_sent")]).ordered).toEqual([]);
  });
  it("brings a waiting case back after 2 reminders, from events or the outreach counter", () => {
    const a = row("a", "request_information"), b = row("b", "request_information");
    for (const c of [a, b]) if (c.workflow) c.workflow.queue = "waiting_customer";
    a.decision!.missing_fields = ["incident_report_present"];
    const result = stream([a, b], [event("a", "reminder_sent"), event("a", "reminder_sent")], [{ case_id: "b", reminder_count: 2 }]);
    expect(result.ordered.map((i) => [i.row.claim.case_id, i.group])).toEqual([["a", "no_reply"], ["b", "no_reply"]]);
    expect(result.ordered[0]?.why).toContain("2 reminders sent");
  });
  it("only counts reminders sent after the customer's last reply", () => {
    const a = row("a", "request_information");
    if (a.workflow) a.workflow.queue = "waiting_customer";
    const history = [event("a", "reminder_sent", "2026-11-05T10:00:00Z"), event("a", "reminder_sent", "2026-11-05T11:00:00Z"),
      event("a", "message_received", "2026-11-06T10:00:00Z"), event("a", "reminder_sent", "2026-11-07T10:00:00Z")];
    expect(stream([a], history).ordered).toEqual([]);
  });
  it("keeps the €1,450 near-limit recommendation Auto-processed with the exact €50 gap, never random QA", () => {
    const near = row("near", "routine_processing");
    near.claim.quote_eur = 1450;
    if (near.workflow) near.workflow.qa_sample = true;
    const item = stream([near]).ordered[0];
    expect(item?.group).toBe("double_check");
    expect(item?.nearLimit).toContain("€1,450 – only €50 under the €1,500 limit");
    expect(item?.row.decision?.recommendation).toBe("routine_processing");
    expect(item?.qa).toBe(false);
  });
  it("says 'Exactly at the limit' when the quote equals the limit", () => {
    const at = row("at", "routine_processing"); at.claim.quote_eur = 1500;
    expect(stream([at]).ordered[0]?.nearLimit).toBe("Exactly at the €1,500 limit – quick double-check.");
  });
  it("uses the supplied policy's second-check boundary, not a hardcoded future version", () => {
    const near = row("near", "routine_processing"); near.claim.quote_eur = 1150;
    const changed = { ...POLICY_V1, version: "v7", human_review: { ...POLICY_V1.human_review, quote_limit_eur: 1200 } };
    expect(stream([near]).ordered).toEqual([]);
    expect(buildWorkstream([near], changed, [], []).ordered[0]?.nearLimit).toContain("€50 under the €1,200 limit");
  });
  it("does not treat a handled historical customer reply as new work", () => {
    const history = [event("risk", "message_received"), event("risk", "retriaged"), event("risk", "confirmed", "2026-11-07T11:00:00Z")];
    const item = stream([row("risk")], history).ordered[0];
    expect(item?.group).toBe("decision");
    expect(item?.replied).toBe(false);
  });
  it("sorts oldest first within each group, keeping null age unknown and last", () => {
    const old = row("old"), recent = row("recent"), unknown = row("unknown");
    old.claim.received_at = "2026-11-06T12:00:00Z"; unknown.claim.received_at = null;
    expect(stream([unknown, recent, old]).ordered.map((i) => i.row.claim.case_id)).toEqual(["old", "recent", "unknown"]);
  });
  it("gives every claim exactly one status, matching the task list", () => {
    const review = row("review"), auto = row("auto", "routine_processing"), wait = row("wait", "request_information"), done = row("done");
    if (wait.workflow) wait.workflow.queue = "waiting_customer";
    done.claim.case_status = "closed";
    const cases = [review, auto, wait, done];
    const work = stream(cases);
    const s = claimStatuses(cases, new Set(work.ordered.map((i) => i.row.claim.case_id)));
    expect(Object.fromEntries(s)).toEqual({ review: "to_review", auto: "auto_processed", wait: "waiting_customer", done: "done" });
  });
  it("shows the quote limit trigger as the amount over the auto-limit", () => {
    const big = row("big"); big.claim.injury_reported = false; big.claim.quote_eur = 3400;
    expect(stream([big]).ordered[0]?.why).toBe("€1,900 over auto-limit");
  });
});
