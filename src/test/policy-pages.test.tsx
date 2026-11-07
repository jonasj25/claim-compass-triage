import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { POLICY_V1 } from "@/lib/triage";
import { RoleContext } from "@/lib/role";
import { NewPolicyDialog } from "@/components/triage/NewPolicyDialog";

const insert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ insert }) } }));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
}));

describe("New policy version form", () => {
  it("creates a draft version from the form", async () => {
    const me = {
      id: "u1",
      name: "Tobias Brandt",
      email: "tobias@demo.com",
      role: "policy_owner" as const,
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RoleContext.Provider value={{ me, role: "policy_owner", setRole: () => {} }}>
          <NewPolicyDialog base={POLICY_V1} existingIds={["v1"]} />
        </RoleContext.Provider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /New policy version/ }));
    expect((screen.getByLabelText("Version") as HTMLInputElement).value).toBe("v2");
    expect(
      (screen.getByRole("button", { name: "Save as draft" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("Quote limit in euros"), { target: { value: "1200" } });
    fireEvent.click(screen.getByLabelText("The repair is EV high-voltage battery work"));
    expect(screen.getByText("• Quote limit for review: €1,500 → €1,200")).toBeTruthy();
    expect(screen.getByText("• EV high-voltage battery work now goes to a person")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({ id: "v2", status: "draft", created_by: "Tobias Brandt" });
    expect(row.config.version).toBe("v2");
    expect(row.config.human_review.quote_limit_eur).toBe(1200);
    expect(row.config.human_review.review_repair_types).toEqual(["ev_high_voltage_battery"]);
  });
});
