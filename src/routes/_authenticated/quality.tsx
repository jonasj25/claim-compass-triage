import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/triage/PlaceholderPage";

export const Route = createFileRoute("/_authenticated/quality")({
  head: () => ({ meta: [{ title: "Quality — Clearpath" }, { name: "description", content: "Accuracy against labelled cases and override rates." }] }),
  component: () => <PlaceholderPage eyebrow="Ops lead" title="Quality" text="Accuracy against labelled cases and override rates." />,
});
