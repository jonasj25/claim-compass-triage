import { describe, expect, it, vi } from "vitest";
import { parseClaimsCsv } from "./csv";
import { SEED_CLAIMS_CSV } from "./seed-claims";
import { POLICY_V1 } from "./triage";

const writes: { table: string; op: string; payload: unknown }[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const record = (op: string) => (payload?: unknown) => {
      writes.push({ table, op, payload });
      return chain;
    };
    chain.select = () => chain;
    chain.insert = record("insert");
    chain.upsert = record("upsert");
    chain.update = record("update");
    chain.in = () => chain;
    chain.eq = () => chain;
    // Pretend PRA-009 is already closed in the system
    chain.then = (res: (v: unknown) => unknown) =>
      Promise.resolve({
        error: null,
        data: table === "claims" ? [{ case_id: "PRA-009", case_status: "closed" }] : [],
      }).then(res);
    return chain;
  };
  return { supabase: { from } };
});

const { importClaims } = await import("./import");

describe("importClaims", () => {
  it("returns one row per line of the file, with frozen closed claims and second checks", async () => {
    const claims = parseClaimsCsv(SEED_CLAIMS_CSV);
    const r = await importClaims(claims, POLICY_V1, "Mara Klein");

    expect(r.rows.map((x) => x.case_id)).toEqual(claims.map((c) => c.case_id));
    expect(r.frozen).toBe(1);
    expect(r.rows.find((x) => x.case_id === "PRA-009")).toMatchObject({
      frozen: true,
      recommendation: null,
    });

    // v1 limit €1,500: band €1,250-1,500. DEV-010 (€1,500) and PRA-004 (€1,450) are routine but near the limit.
    const flagged = r.rows.filter((x) => x.secondCheck).map((x) => x.case_id);
    expect(flagged).toEqual(["DEV-010", "PRA-004"]);
    expect(r.secondChecks).toBe(2);
    expect(r.rows.find((x) => x.case_id === "DEV-010")).toMatchObject({
      recommendation: "routine_processing",
      queue: "auto_processed",
    });

    const wf = writes
      .filter((w) => w.table === "case_workflow")
      .flatMap((w) => w.payload as { case_id: string; qa_sample: boolean }[]);
    expect(wf.filter((w) => w.qa_sample).map((w) => w.case_id)).toEqual(["DEV-010", "PRA-004"]);
  });
});
