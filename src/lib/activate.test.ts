import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseClaimsCsv } from "./csv";
import { SEED_CLAIMS_CSV } from "./seed-claims";
import { decide, POLICY_V1, type Policy } from "./triage";

// Records every write: [table, operation, payload, filters]
type Call = { table: string; op: string; payload?: unknown; filters: [string, string, unknown][] };
const calls: Call[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const call: Call = { table, op: "", filters: [] };
    const chain: Record<string, unknown> = {};
    for (const op of ["update", "insert", "delete"])
      chain[op] = (payload?: unknown) => {
        call.op = op;
        call.payload = payload;
        calls.push(call);
        return chain;
      };
    for (const f of ["eq", "neq", "in"])
      chain[f] = (col: string, val: unknown) => {
        call.filters.push([f, col, val]);
        return chain;
      };
    chain.then = (res: (v: { error: null }) => unknown) =>
      Promise.resolve({ error: null }).then(res);
    return chain;
  };
  return { supabase: { from: builder } };
});

const { activatePolicy, planActivation } = await import("./activate");

const claims = parseClaimsCsv(SEED_CLAIMS_CSV);
const cases = claims.map((c) => ({
  claim: c,
  decision: { recommendation: decide(c, POLICY_V1).recommendation },
}));
const v2: Policy = {
  ...POLICY_V1,
  version: "v2",
  human_review: {
    ...POLICY_V1.human_review,
    quote_limit_eur: 1200,
    review_repair_types: ["ev_high_voltage_battery"],
  },
};

beforeEach(() => {
  calls.length = 0;
});

describe("planActivation", () => {
  it("re-decides open claims only and flags the ones that change", () => {
    const plan = planActivation(cases, POLICY_V1, v2);
    expect(plan.closedUntouched).toBe(2);
    expect(plan.open).toHaveLength(24);
    expect(plan.open.map((p) => p.case_id)).not.toContain("PRA-009");
    expect(plan.changed.map((p) => p.case_id).sort()).toEqual([
      "DEV-010",
      "DEV-011",
      "PRA-003",
      "PRA-004",
      "PRA-005",
      "PRA-006",
    ]);
    expect(plan.changed.every((p) => p.queue === "on_you")).toBe(true);
  });
});

describe("activatePolicy", () => {
  it("writes v2 decisions for open claims, never touches closed ones, switches policy last", async () => {
    await activatePolicy(planActivation(cases, POLICY_V1, v2), "Tobias Brandt");

    const inserted = calls
      .filter((c) => c.table === "decisions" && c.op === "insert")
      .flatMap(
        (c) => c.payload as { case_id: string; policy_version: string; needs_recheck: boolean }[],
      );
    expect(inserted).toHaveLength(24);
    expect(inserted.every((d) => d.policy_version === "v2")).toBe(true);
    expect(
      inserted
        .filter((d) => d.needs_recheck)
        .map((d) => d.case_id)
        .sort(),
    ).toEqual(["DEV-010", "DEV-011", "PRA-003", "PRA-004", "PRA-005", "PRA-006"]);

    const touched = calls.flatMap((c) =>
      c.filters.filter((f) => f[1] === "case_id").flatMap((f) => f[2] as string[]),
    );
    expect(touched).not.toContain("PRA-009");
    expect(touched).not.toContain("PRA-010");

    const events = calls
      .filter((c) => c.table === "case_events")
      .flatMap((c) => c.payload as { type: string }[]);
    expect(events).toHaveLength(6);
    expect(events.every((e) => e.type === "policy_change")).toBe(true);

    const last = calls.slice(-2);
    expect(last.map((c) => [c.table, (c.payload as { status: string }).status])).toEqual([
      ["policy_versions", "retired"],
      ["policy_versions", "active"],
    ]);
    expect(last[1].payload).toMatchObject({ approved_by: "Tobias Brandt" });
    expect(last[1].filters).toContainEqual(["eq", "id", "v2"]);
  });
});
