import { createFileRoute, redirect } from "@tanstack/react-router";

// The claims list now lives on the dashboard (tabs: To review, Waiting on customer, …).
// Kept so old links to /claims still land in the right place.
export const Route = createFileRoute("/_authenticated/claims/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
