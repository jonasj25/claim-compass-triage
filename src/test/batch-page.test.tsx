import { readFileSync } from "node:fs";
import path from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { Route as BatchRoute } from "@/routes/batch";

vi.mock("@tanstack/react-router", async (orig) => {
  const mod = await orig<typeof import("@tanstack/react-router")>();
  return { ...mod, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});

describe("Batch page (/batch)", () => {
  it("is a public route outside the signed-in area", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const ids = router.matchRoutes("/batch").map((m) => m.routeId);
    expect(ids.at(-1)).toBe("/batch");
    expect(ids.at(-1)).not.toBe(rootRouteId);
    expect(ids.some((id) => id.includes("_authenticated"))).toBe(false);
  });

  it("triages an uploaded CSV and offers the results download", async () => {
    const Page = BatchRoute.options.component as React.ComponentType;
    render(<Page />);
    const csv = readFileSync(path.resolve(__dirname, "../../data/practice_cases.csv"), "utf-8");
    const file = new File([csv], "practice_cases.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(csv) });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText("PRA-001")).toBeTruthy());
    expect(screen.getByText("PRA-012")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download results CSV/ })).toBeTruthy();
    expect(screen.getAllByText("frozen").length).toBe(2); // PRA-009 and PRA-010 are closed
  });
});
