import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";

// The portal page is covered by the customer-status rule tests (src/lib/customer-status.test.ts).
// Full rendering needs the app shell, which waits for stylesheets jsdom never loads, so we only
// check that the customer pages are public routes outside the signed-in area.
describe("customer pages are public", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
  it.each(["/status", "/report", "/claim/CLM-0001", "/batch"])("%s needs no sign-in", (path) => {
    const ids = router.matchRoutes(path).map((m) => m.routeId);
    expect(ids.at(-1)).not.toBe(rootRouteId);
    expect(ids.some((id) => id.includes("_authenticated"))).toBe(false);
  });
});
