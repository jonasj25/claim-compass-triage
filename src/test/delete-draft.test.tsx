import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeleteDraftButton } from "@/components/triage/DeleteDraftButton";

const calls: { method: string; args: unknown[] }[] = [];
const select = vi.fn().mockResolvedValue({ data: [{ id: "v2" }], error: null });
const chain = {
  delete: (...args: unknown[]) => (calls.push({ method: "delete", args }), chain),
  eq: (...args: unknown[]) => (calls.push({ method: "eq", args }), chain),
  select,
};
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => chain } }));

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("Delete draft", () => {
  it.each(["active", "approved", "retired"])("is not offered for %s versions", (status) => {
    wrap(<DeleteDraftButton version={{ id: "v1", status }} />);
    expect(screen.queryByText("Delete draft")).toBeNull();
  });

  it("deletes a draft only after confirmation, scoped to status = draft", async () => {
    wrap(<DeleteDraftButton version={{ id: "v2", status: "draft" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    expect(select).not.toHaveBeenCalled();
    expect(screen.getByText("Delete draft V2?")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Delete draft" }).at(-1)!);
    await waitFor(() => expect(select).toHaveBeenCalledTimes(1));
    expect(calls).toEqual([
      { method: "delete", args: [] },
      { method: "eq", args: ["id", "v2"] },
      { method: "eq", args: ["status", "draft"] },
    ]);
  });
});
