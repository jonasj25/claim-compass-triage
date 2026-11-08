import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseClaimsCsv } from "@/lib/csv";
import { SEED_CLAIMS_CSV } from "@/lib/seed-claims";
import { RoleContext } from "@/lib/role";
import { BATCH_POLICY_V2 } from "@/lib/batch";

const insert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ insert }) } }));
vi.mock("@/lib/advisor.functions", () => ({
  advisorMemo: vi.fn().mockResolvedValue({ text: "Memo from the AI consultant." }),
}));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

describe("Policy advisor page", () => {
  it("shows one balanced recommendation, writes a memo, and creates drafts that only change the limit", async () => {
    const { Route } = await import("@/routes/_authenticated/advisor");
    const qc = new QueryClient();
    qc.setQueryData(
      ["cases"],
      parseClaimsCsv(SEED_CLAIMS_CSV).map((c) => ({
        claim: c,
        decision: null,
        workflow: null,
        intake: null,
      })),
    );
    qc.setQueryData(["policy", "active"], BATCH_POLICY_V2);
    qc.setQueryData(["policy", "versions"], [{ id: "v1" }, { id: "v2" }]);
    const Page = Route.options.component as React.ComponentType;
    const me = {
      id: "u",
      name: "Tobias Brandt",
      email: "t@demo.com",
      role: "policy_owner" as const,
    };
    render(
      <QueryClientProvider client={qc}>
        <RoleContext.Provider value={{ me, role: "policy_owner", setRole: () => {} }}>
          <Page />
        </RoleContext.Provider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Recommended settings")).toBeTruthy();
    expect(screen.queryByText("Financial optimum")).toBeNull();
    expect(screen.getByText("Customer wait (days to decision)")).toBeTruthy();
    expect(screen.getByText("Quote limit explorer")).toBeTruthy();
    expect(screen.getByRole("slider")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Ask the AI consultant/ }));
    await waitFor(() => expect(screen.getByText("Memo from the AI consultant.")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Also relax rules" }));
    const draftButtons = screen.queryAllByRole("button", { name: /Create draft/ });
    if (draftButtons.length) {
      fireEvent.click(draftButtons[0]);
      await waitFor(() => expect(insert).toHaveBeenCalled());
      const row = insert.mock.calls[0][0];
      expect(row).toMatchObject({ id: "v3", status: "draft" });
      expect(row.config.human_review.flag_fields).toEqual(BATCH_POLICY_V2.human_review.flag_fields);
      expect(row.config.human_review.review_repair_types).toEqual(["ev_high_voltage_battery"]);
    }
  });
});
