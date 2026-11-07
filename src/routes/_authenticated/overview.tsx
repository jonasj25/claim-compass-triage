import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/triage/PlaceholderPage";

export const Route = createFileRoute("/_authenticated/overview")({
  head: () => ({ meta: [{ title: "Overview — Clearpath" }, { name: "description", content: "Quality, workload and the effect of changes at a glance." }] }),
  component: () => <PlaceholderPage eyebrow="Ops lead" title="Overview" text="Quality, workload and the effect of changes at a glance." />,
});
