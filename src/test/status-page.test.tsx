import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getClaimStatus = vi.fn();
vi.mock("@/lib/claim-status.functions", () => ({
  getClaimStatus: (a: unknown) => getClaimStatus(a),
}));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

async function renderPage() {
  const { Route } = await import("@/routes/status");
  (Route as unknown as { useSearch: () => object }).useSearch = () => ({});
  const Page = Route.options.component as React.ComponentType;
  render(<Page />);
}

describe("public claim status page", () => {
  it("shows the status, what is missing and the progress after a matching lookup", async () => {
    getClaimStatus.mockResolvedValueOnce({
      found: true,
      case_id: "CLM-0001",
      status: "information_needed",
      first_name: "Anna",
      received_at: "2026-11-03T09:15:00Z",
      updated_at: "2026-11-04T10:00:00Z",
      missing: ["The incident report"],
    });
    await renderPage();
    fireEvent.change(screen.getByLabelText("Reference number"), { target: { value: "CLM-0001" } });
    fireEvent.change(screen.getByLabelText("Number plate"), { target: { value: "M-AK 1000" } });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() =>
      expect(screen.getAllByText("Information needed").length).toBeGreaterThan(0),
    );
    expect(getClaimStatus).toHaveBeenCalledWith({
      data: { case_id: "CLM-0001", plate: "M-AK 1000" },
    });
    expect(screen.getByText("The incident report")).toBeTruthy();
    expect(screen.getByText(/Hello Anna/)).toBeTruthy();
  });

  it("says nothing about other people's claims when the plate does not match", async () => {
    getClaimStatus.mockResolvedValueOnce({ found: false });
    await renderPage();
    fireEvent.change(screen.getByLabelText("Reference number"), { target: { value: "CLM-0001" } });
    fireEvent.change(screen.getByLabelText("Number plate"), { target: { value: "WRONG" } });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/couldn't find a claim/)).toBeTruthy());
  });
});
