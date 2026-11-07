import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/triage/PlaceholderPage";

export const Route = createFileRoute("/_authenticated/business-case")({
  head: () => ({ meta: [{ title: "Business case — Triage" }, { name: "description", content: "Time saved and cost avoided from automatic triage." }] }),
  component: () => <PlaceholderPage eyebrow="Ops lead" title="Business case" text="Time saved and cost avoided from automatic triage." />,
});
