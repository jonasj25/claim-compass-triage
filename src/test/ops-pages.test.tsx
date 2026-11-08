import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseClaimsCsv } from "@/lib/csv";
import { SEED_CLAIMS_CSV } from "@/lib/seed-claims";
import { decide, POLICY_V1 } from "@/lib/triage";
import { queueFor } from "@/lib/lifecycle";
import { RoleContext } from "@/lib/role";

vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

// ResizeObserver is missing in jsdom (recharts' ResponsiveContainer needs it)
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const cases = parseClaimsCsv(SEED_CLAIMS_CSV).map((c) => {
  const d = decide(c, POLICY_V1);
  const closed = c.case_status === "closed";
  return {
    claim: { ...c, received_at: new Date().toISOString(), raw: c.raw },
    decision: {
      id: c.case_id,
      policy_version: "v1",
      recommendation: d.recommendation,
      rule_id: d.rule_id,
      explanation: d.reasons.join(". "),
      missing_fields: d.missing_fields,
      needs_recheck: false,
    },
    workflow: {
      queue: queueFor(d.recommendation, closed),
      assignee: d.recommendation === "human_review" ? "Mara Klein" : null,
      qa_sample: false,
      sla_due_at: null,
    },
    intake: null,
  };
});

async function renderPage(path: string) {
  const mod = await import(`@/routes/_authenticated/${path}.tsx`);
  const qc = new QueryClient();
  qc.setQueryData(["cases"], cases);
  qc.setQueryData(["policy", "active"], POLICY_V1);
  qc.setQueryData(["handling-today"], { n: 4, avg: 120 });
  qc.setQueryData(
    ["overrides"],
    [
      {
        id: "o1",
        case_id: "DEV-004",
        original_recommendation: "human_review",
        new_recommendation: "routine_processing",
        reason_code: "evidence_misread",
        reason_text: "Corrected quote",
        reviewer: "Mara Klein",
        policy_version: "v1",
        created_at: new Date().toISOString(),
      },
    ],
  );
  qc.setQueryData(["outcomes"], []);
  const Page = mod.Route.options.component as React.ComponentType;
  const me = { id: "u", name: "Sofia Lang", email: "s@demo.com", role: "ops_lead" as const };
  return render(
    <QueryClientProvider client={qc}>
      <RoleContext.Provider value={{ me, role: "ops_lead", setRole: () => {} }}>
        <Page />
      </RoleContext.Provider>
    </QueryClientProvider>,
  );
}

describe("ops lead pages", () => {
  it("Workload & flow shows queues, automation and review reasons", async () => {
    await renderPage("overview");
    expect(screen.getByText("Workload & flow")).toBeTruthy();
    expect(screen.getByText("Handled without a reviewer")).toBeTruthy();
    expect(screen.getByText("Why claims go to a person")).toBeTruthy();
    expect(screen.getAllByText("Injury").length).toBeGreaterThan(0);
    expect(screen.queryByText("Avg handling time")).toBeNull();
  });

  it("Quality shows reliability, how it is measured, mistakes and the correction log", async () => {
    await renderPage("quality");
    expect(screen.getByText("How we measure quality")).toBeTruthy();
    expect(screen.getAllByText(/realistic customer reports/).length).toBeGreaterThan(0);
    expect(screen.getByText("Where it goes wrong")).toBeTruthy();
    expect(screen.queryByText(/V1|V2|policy change/)).toBeNull();
    expect(screen.getByText("Corrected quote", { exact: false })).toBeTruthy();
    expect(screen.getByText("Monitoring plan, live")).toBeTruthy();
  });

  it("Business case shows net benefit, payback and sources", async () => {
    await renderPage("business-case");
    expect(screen.getByText("Net benefit per year")).toBeTruthy();
    expect(screen.getByText("Payback")).toBeTruthy();
    expect(screen.getByText(/Cost of one policy change/)).toBeTruthy();
    expect(screen.queryByText("Where to set the threshold")).toBeNull();
    expect(screen.queryByText("Quote limit explorer")).toBeNull();
    expect(screen.getAllByText(/source/i).length).toBeGreaterThan(3);
  });
});
