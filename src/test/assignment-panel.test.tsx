import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoleContext } from "@/lib/role";
import type { CaseRow } from "@/lib/data";

const calls: { table: string; op: string; payload: unknown; filters: unknown[] }[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const call = { table, op: "", payload: null as unknown, filters: [] as unknown[] };
      const chain: Record<string, unknown> = {
        update: (p: unknown) => ((call.op = "update"), (call.payload = p), calls.push(call), chain),
        insert: (p: unknown) => ((call.op = "insert"), (call.payload = p), calls.push(call), chain),
        in: (c: string, v: unknown) => (call.filters.push([c, v]), chain),
        then: (res: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(res),
      };
      return chain;
    },
  },
}));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const cases = Array.from({ length: 30 }, (_, k) => ({
  claim: {
    case_id: `C${String(k).padStart(2, "0")}`,
    case_status: "open",
    received_at: `2026-11-0${(k % 6) + 1}T10:00:00Z`,
    claim_summary: "x",
  },
  decision: { recommendation: "human_review" },
  workflow: { queue: "on_you", assignee: null, qa_sample: false, sla_due_at: null },
  intake: null,
})) as unknown as CaseRow[];

describe("AssignmentPanel", () => {
  it("distributes unassigned claims evenly, leaves the chosen number unassigned and logs events", async () => {
    const { AssignmentPanel } = await import("@/components/triage/AssignmentPanel");
    const me = { id: "u", name: "Sofia Lang", email: "s@demo.com", role: "ops_lead" as const };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RoleContext.Provider value={{ me, role: "ops_lead", setRole: () => {} }}>
          <AssignmentPanel cases={cases} />
        </RoleContext.Provider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("30")).toBeTruthy(); // unassigned
    fireEvent.change(screen.getByLabelText("Claims to leave unassigned"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Distribute evenly · 21/ }));
    await waitFor(() => expect(calls.some((c) => c.table === "case_events")).toBe(true));
    const updates = calls.filter((c) => c.table === "case_workflow");
    const perReviewer = updates.map((u) => (u.filters[0] as [string, string[]])[1].length);
    expect(perReviewer.reduce((a, b) => a + b, 0)).toBe(21);
    expect(Math.max(...perReviewer) - Math.min(...perReviewer)).toBeLessThanOrEqual(1);
    const events = calls
      .filter((c) => c.table === "case_events")
      .flatMap((c) => c.payload as { type: string; payload: { by: string } }[]);
    expect(events).toHaveLength(21);
    expect(events.every((e) => e.type === "assigned" && e.payload.by === "Sofia Lang")).toBe(true);
  });
});
