import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/triage/PlaceholderPage";

export const Route = createFileRoute("/_authenticated/impact")({
  head: () => ({ meta: [{ title: "Change impact — Triage" }, { name: "description", content: "See which open cases a new policy version would change." }] }),
  component: () => <PlaceholderPage eyebrow="Policy owner" title="Change impact" text="See which open cases a new policy version would change." />,
});
