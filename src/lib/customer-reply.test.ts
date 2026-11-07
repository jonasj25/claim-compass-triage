import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseClaimsCsv } from "./csv";
import { SEED_CLAIMS_CSV } from "./seed-claims";
import { POLICY_V1, type Policy } from "./triage";

type Call = { table: string; op: string; payload?: unknown };
const calls: Call[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ["update", "insert"])
      chain[op] = (payload?: unknown) => {
        calls.push({ table, op, payload });
        return chain;
      };
    chain.eq = () => chain;
    chain.in = () => chain;
    chain.then = (res: (v: { error: null }) => unknown) =>
      Promise.resolve({ error: null }).then(res);
    return chain;
  };
  return { supabase: { from } };
});

const { missingItems, recordCustomerReply } = await import("./customer-reply");

const claims = parseClaimsCsv(SEED_CLAIMS_CSV);
const get = (id: string) => claims.find((c) => c.case_id === id)!;
const v2: Policy = {
  ...POLICY_V1,
  version: "v2",
  human_review: {
    ...POLICY_V1.human_review,
    quote_limit_eur: 1200,
    review_repair_types: ["ev_high_voltage_battery"],
  },
};
const reply = (
  id: string,
  policy: Policy,
  answers: Record<string, boolean | number | string | null>,
) => {
  const claim = get(id);
  return recordCustomerReply({
    caseId: id,
    claim,
    policy,
    answers,
    items: missingItems(claim, policy),
    customer: "Anna Schmidt",
    actor: "Mara Klein",
  });
};
const events = () =>
  calls
    .filter((c) => c.table === "case_events")
    .flatMap((c) => c.payload as { type: string; payload: Record<string, unknown> }[]);
const workflow = () =>
  calls.find((c) => c.table === "case_workflow")?.payload as { queue: string; qa_sample: boolean };

beforeEach(() => {
  calls.length = 0;
});

describe("customer reply → automatic re-check", () => {
  it("lists what the claim is waiting for", () => {
    expect(missingItems(get("DEV-002"), POLICY_V1).map((i) => [i.field, i.kind])).toEqual([
      ["incident_report_present", "document"],
    ]);
    expect(missingItems(get("DEV-013"), POLICY_V1).map((i) => [i.field, i.kind])).toEqual([
      ["quote_eur", "amount"],
    ]);
  });

  it("missing document arrives → auto-processed", async () => {
    const r = await reply("DEV-002", POLICY_V1, { incident_report_present: true });
    expect(r).toMatchObject({
      before: "request_information",
      after: "routine_processing",
      queue: "auto_processed",
      secondCheck: null,
    });
    expect(calls.find((c) => c.table === "claims")?.payload).toEqual({
      incident_report_present: true,
    });
    expect(workflow()).toMatchObject({ queue: "auto_processed", qa_sample: false });
    expect(events().map((e) => e.type)).toEqual([
      "message_received",
      "documents_received",
      "retriaged",
    ]);
    expect(String(events()[0].payload.body)).toContain("please find attached the incident report");
  });

  it("quote arrives above the limit → to review", async () => {
    const r = await reply("DEV-013", POLICY_V1, { quote_eur: 1600 });
    expect(r).toMatchObject({ after: "human_review", queue: "on_you" });
  });

  it("quote arrives just under the v2 limit → auto-processed plus a second check", async () => {
    const r = await reply("DEV-013", v2, { quote_eur: 1180 });
    expect(r.after).toBe("routine_processing");
    expect(r.secondCheck).toContain("within €70");
    expect(workflow()).toMatchObject({ queue: "auto_processed", qa_sample: true });
    expect(events().map((e) => e.type)).toContain("second_check_flagged");
  });

  it("nothing provided → still waiting, a new request goes out, nothing invented", async () => {
    const r = await reply("DEV-013", POLICY_V1, { quote_eur: null });
    expect(r).toMatchObject({
      after: "request_information",
      queue: "waiting_customer",
      stillMissing: ["quote_eur"],
    });
    expect(calls.some((c) => c.table === "claims")).toBe(false);
    expect(calls.some((c) => c.table === "outreach" && c.op === "insert")).toBe(true);
  });
});
