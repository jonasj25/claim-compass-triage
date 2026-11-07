import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/triage/PlaceholderPage";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Audit & reports — Clearpath" }, { name: "description", content: "Exportable audit trail of every decision and override." }] }),
  component: () => <PlaceholderPage eyebrow="Ops lead" title="Audit & reports" text="Exportable audit trail of every decision and override." />,
});
