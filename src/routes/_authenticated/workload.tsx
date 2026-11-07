import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/triage/PlaceholderPage";

export const Route = createFileRoute("/_authenticated/workload")({
  head: () => ({ meta: [{ title: "Workload — Clearpath" }, { name: "description", content: "Queue sizes, handling time and SLA by reviewer." }] }),
  component: () => <PlaceholderPage eyebrow="Ops lead" title="Workload" text="Queue sizes, handling time and SLA by reviewer." />,
});
