import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/triage/PlaceholderPage";

export const Route = createFileRoute("/_authenticated/phone-intake")({
  head: () => ({ meta: [
{ property: "og:title", content: "Phone intake — Clearpath" },
{ property: "og:description", content: "Clearpath claims workspace: review evidence, policy decisions and case activity." },
{ property: "og:type", content: "website" },
{ name: "twitter:card", content: "summary" },{ title: "Phone intake — Clearpath" }, { name: "description", content: "The voice agent intake with live transcript arrives in a later step." }] }),
  component: () => <PlaceholderPage eyebrow="Reviewer" title="Phone intake" text="The voice agent intake with live transcript arrives in a later step." />,
});
