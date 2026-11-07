import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { casesQuery } from "@/lib/data";
import { Card, PageHeader } from "@/components/triage/ui";
import { ClaimsTable } from "@/components/triage/ClaimsTable";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/claims/")({
  head: () => ({ meta: [{ title: "Claims — Triage" }, { name: "description", content: "All claims by queue." }] }),
  component: Claims,
});

const TABS = [
  { key: "on_you", label: "On you" },
  { key: "waiting_customer", label: "Waiting on customer" },
  { key: "auto_processed", label: "Auto-processed" },
  { key: "all", label: "All" },
] as const;

function Claims() {
  const { data = [] } = useQuery(casesQuery);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("on_you");
  const inTab = (key: string) =>
    data.filter((c) =>
      key === "all" ? true : key === "on_you" ? c.workflow?.queue === "on_you" || (c.workflow?.qa_sample && c.workflow.queue !== "done") : c.workflow?.queue === key,
    );
  const rows = inTab(tab);

  return (
    <div>
      <PageHeader eyebrow="Reviewer" title="Claims" sub="Filters, search and grouping arrive in the next step." />
      <Card className="p-0">
        <div className="px-6 py-4">
          <div role="tablist" className="inline-flex rounded-[11px] bg-[oklch(0.93_0.015_258/0.7)] p-0.5">
            {TABS.map((t) => {
              const n = inTab(t.key).length;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cn("flex items-center gap-2 rounded-[9px] px-3 py-1.5 text-[13px]", tab === t.key ? "pill-active font-medium" : "text-text-2 hover:text-foreground")}
                >
                  {t.label}
                  <span className={cn("font-mono text-[11px]", t.key === "on_you" && n > 0 ? "text-action" : "text-text-3")}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
        <ClaimsTable rows={rows} navLabel={TABS.find((t) => t.key === tab)?.label ?? "Claims"} />
      </Card>
    </div>
  );
}
