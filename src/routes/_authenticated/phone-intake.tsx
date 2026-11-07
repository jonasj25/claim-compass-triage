import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/triage/PlaceholderPage";

export const Route = createFileRoute("/_authenticated/phone-intake")({
  head: () => ({ meta: [{ title: "Phone intake — Clearpath" }, { name: "description", content: "The voice agent intake with live transcript arrives in a later step." }] }),
  component: () => <PlaceholderPage eyebrow="Reviewer" title="Phone intake" text="The voice agent intake with live transcript arrives in a later step." />,
});
