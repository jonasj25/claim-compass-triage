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

    // v1 limit €1,500: band €1,430.01-1,500. DEV-010 (€1,500) and PRA-004 (€1,450) are routine but within €70.
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

describe("optional customer columns", () => {
  it("stores customer_name, plate and received_at from extra CSV columns", async () => {
    writes.length = 0;
    const csv =
      "case_id,case_status,claim_summary,policy_active_on_incident,claim_type,repair_type,quote_eur,incident_report_present,itemized_quote_present,injury_reported,liability_disputed,duplicate_flag,evidence_conflict,customer_name,plate,received_at\n" +
      "CLM-0001,open,Parking scrape.,True,motor_own_damage,standard,540,True,True,False,False,False,False,Anna Becker,M-AK 1000,2026-11-03T09:15:00Z\n" +
      "CLM-0002,open,Mirror broken.,True,motor_own_damage,standard,380,True,True,False,False,False,False,,,not-a-date\n";
    await importClaims(parseClaimsCsv(csv), POLICY_V1, "Mara Klein");
    const intake = writes
      .filter((w) => w.table === "claim_intake")
      .flatMap((w) => w.payload as Record<string, unknown>[]);
    expect(intake[0]).toMatchObject({
      customer_name: "Anna Becker",
      plate: "M-AK 1000",
      received_at: "2026-11-03T09:15:00.000Z",
    });
    expect(intake[1]).toMatchObject({ customer_name: null, plate: null });
    expect(Number.isNaN(Date.parse(String(intake[1].received_at)))).toBe(false); // bad date falls back to now
  });
});
