import { describe, expect, it } from "vitest";
import { BATCH_POLICY_V1, BATCH_POLICY_V2 } from "./batch";
import { customerStatus } from "./customer-status";
import { canReopen, planReopen, reopenCase, reopenProblem, sinceReopen } from "./reopen";
import type { Claim } from "./triage";

type Row = Record<string, unknown>;

/** In-memory stand-in for the Supabase query builder, with several tables. */
function fakeDb(tables: Record<string, Row[]>) {
  const db = {
    from(table: string) {
      const rows = (tables[table] ??= []);
      const filters: ((r: Row) => boolean)[] = [];
      let patch: Row | null = null;
      let mode: "many" | "single" | "maybe" = "many";
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
        is: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        not: (c: string) => (filters.push((r) => r[c] !== null), q),
        neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
        range: () => q,
        single: () => ((mode = "single"), q),
        maybeSingle: () => ((mode = "maybe"), q),
        update: (p: Row) => ((patch = p), q),
        insert: (p: Row | Row[]) => (
          rows.push(...(Array.isArray(p) ? p : [p]).map((r) => ({ ...r }))),
          (patch = {}),
          q
        ),
        then: (res: (v: unknown) => unknown) => {
          const hit = rows.filter((r) => filters.every((f) => f(r)));
          if (patch) {
            if (Object.keys(patch).length) for (const r of hit) Object.assign(r, patch);
            return Promise.resolve({ error: null, data: null }).then(res);
          }
          const data = mode === "many" ? hit.map((r) => ({ ...r })) : hit[0] ? { ...hit[0] } : null;
          return Promise.resolve({
            error: mode === "single" && !data ? new Error("not found") : null,
            data,
          }).then(res);
        },
      };
      return q;
    },
  };
  return db;
}

// Routine under v1 (€1,300 is under v1's €1,500 limit), but over v2's €1,200 limit
const claim: Claim = {
  case_id: "CLM-9",
  case_status: "closed",
  policy_active_on_incident: true,
  claim_type: "motor_own_damage",
  repair_type: "standard",
  quote_eur: 1300,
  incident_report_present: true,
  itemized_quote_present: true,
  injury_reported: false,
  liability_disputed: false,
  duplicate_flag: false,
  evidence_conflict: false,
};

const setup = () =>
  fakeDb({
    claims: [{ ...claim }],
    decisions: [
      {
        case_id: "CLM-9",
        policy_version: "v1",
        recommendation: "routine_processing",
        is_current: true,
      },
    ],
    case_workflow: [
      {
        case_id: "CLM-9",
        queue: "done",
        assignee: "Lea Hoffmann",
        qa_sample: true,
        sla_due_at: null,
      },
    ],
    case_events: [],
    outcomes: [{ case_id: "CLM-9", final_outcome: "accepted" }],
  });

describe("reopening a claim", () => {
  it("plans the decision under the active policy and compares it with the one it was closed with", () => {
    const p = planReopen(claim, BATCH_POLICY_V2, "routine_processing");
    expect(p.decision.recommendation).toBe("human_review");
    expect(p.changed).toBe(true);
    expect(p.queue).toBe("on_you");
    expect(planReopen(claim, BATCH_POLICY_V1, "routine_processing").changed).toBe(false);
  });

  it("reopens: open again, new current decision, To review with a fresh target, history kept", async () => {
    const db = setup();
    const r = await reopenCase(db, {
      caseId: "CLM-9",
      reason: "additional_damage",
      note: "second quote",
      actor: "Mara Klein",
      policy: BATCH_POLICY_V2,
      assign: "me",
    });
    expect(r.decision.recommendation).toBe("human_review");
    expect(r.assignee).toBe("Mara Klein");

    const rows = async (table: string) =>
      (await (db.from(table) as unknown as Promise<{ data: Row[] }>)).data;
    expect((await rows("claims"))[0].case_status).toBe("open");
    const decisions = await rows("decisions");
    expect(decisions).toHaveLength(2); // the old one is kept
    expect(decisions[0]).toMatchObject({ recommendation: "routine_processing", is_current: false });
    expect(decisions[1]).toMatchObject({
      policy_version: BATCH_POLICY_V2.version,
      recommendation: "human_review",
      needs_recheck: true,
    });
    const wf = (await rows("case_workflow"))[0];
    expect(wf).toMatchObject({ queue: "on_you", qa_sample: false, assignee: "Mara Klein" });
    expect(Date.parse(String(wf.sla_due_at)) - Date.now()).toBeGreaterThan(23 * 3600e3);
    const events = await rows("case_events");
    expect(events.map((e) => e.type)).toEqual(["reopened", "assigned"]);
    expect(events[0].payload).toMatchObject({
      reason: "additional_damage",
      note: "second quote",
      previous_recommendation: "routine_processing",
      recommendation: "human_review",
      changed: true,
    });
    expect(await rows("outcomes")).toHaveLength(1); // the earlier outcome stays
  });

  it("can hand the claim back to the reviewer it had", async () => {
    const db = setup();
    const r = await reopenCase(db, {
      caseId: "CLM-9",
      reason: "customer_dispute",
      note: "",
      actor: "Mara Klein",
      policy: BATCH_POLICY_V2,
      assign: "previous",
    });
    expect(r.assignee).toBe("Lea Hoffmann");
  });

  it("only reopens closed or finished claims and needs a reason", async () => {
    const db = fakeDb({
      claims: [{ ...claim, case_status: "open" }],
      case_workflow: [{ case_id: "CLM-9", queue: "on_you", assignee: null }],
      decisions: [],
    });
    await expect(
      reopenCase(db, {
        caseId: "CLM-9",
        reason: "new_information",
        note: "",
        actor: "X",
        policy: BATCH_POLICY_V2,
        assign: "me",
      }),
    ).rejects.toThrow(/Only closed or finished/);
    expect(reopenProblem("", "")).toMatch(/Choose why/);
    expect(reopenProblem("other", "")).toMatch(/short note/);
    expect(reopenProblem("other", "customer called")).toBeNull();
    expect(canReopen("closed", null)).toBe(true);
    expect(canReopen("open", "done")).toBe(true);
    expect(canReopen("open", "on_you")).toBe(false);
  });

  it("earlier confirmations no longer count after reopening", () => {
    const ev = [
      { type: "confirmed" },
      { type: "closed" },
      { type: "reopened" },
      { type: "assigned" },
    ];
    expect(sinceReopen(ev).map((e) => e.type)).toEqual(["assigned"]);
    expect(sinceReopen([{ type: "confirmed" }])).toHaveLength(1);
  });

  it("the customer sees 'In review' again, even with the earlier outcome on record", () => {
    expect(
      customerStatus({
        caseStatus: "open",
        queue: "on_you",
        recommendation: "human_review",
        outcome: "accepted",
      }),
    ).toBe("in_review");
    expect(
      customerStatus({
        caseStatus: "open",
        queue: "on_you",
        recommendation: "human_review",
        outcome: "denied",
      }),
    ).toBe("in_review");
    expect(
      customerStatus({
        caseStatus: "closed",
        queue: "done",
        recommendation: "human_review",
        outcome: "denied",
      }),
    ).toBe("rejected");
  });
});
