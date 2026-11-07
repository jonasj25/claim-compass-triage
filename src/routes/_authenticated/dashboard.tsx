import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { casesQuery, type CaseRow } from "@/lib/data";
import { useRole } from "@/lib/role";
import { isClosed } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Card, Kpi } from "@/components/triage/ui";
import { ClaimsTable } from "@/components/triage/ClaimsTable";
import { saveCaseNav } from "@/lib/case-nav";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Clearpath" },
      { name: "description", content: "Today's numbers and every claim, filtered by what needs doing." },
    ],
  }),
  component: Dashboard,
});

type TabKey = "to_review" | "policy_change" | "waiting_customer" | "auto_processed" | "done" | "all";

const TAB_KEY = "clearpath.dashboardTab";
const toReview = (c: CaseRow) => !!c.workflow && c.workflow.queue !== "done" && (c.workflow.queue === "on_you" || c.workflow.qa_sample);

const TABS: { key: TabKey; label: string; test: (c: CaseRow) => boolean; hideWhenEmpty?: boolean }[] = [
  { key: "to_review", label: "To review", test: toReview },
  { key: "policy_change", label: "Policy change", test: (c) => !!c.decision?.needs_recheck && !isClosed(c.claim.case_status), hideWhenEmpty: true },
  { key: "waiting_customer", label: "Waiting on customer", test: (c) => c.workflow?.queue === "waiting_customer" },
  { key: "auto_processed", label: "Auto-processed", test: (c) => c.workflow?.queue === "auto_processed" },
  { key: "done", label: "Done", test: (c) => c.workflow?.queue === "done" },
  { key: "all", label: "All", test: () => true },
];

// Average reviewer handling time today, from confirmations and overrides (both store handling_seconds)
const handlingQuery = {
  queryKey: ["handling-today"],
  queryFn: async () => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const [ev, ov] = await Promise.all([
      supabase.from("case_events").select("payload").in("type", ["confirmed", "qa_confirmed"]).gte("created_at", since.toISOString()),
      supabase.from("overrides").select("handling_seconds").gte("created_at", since.toISOString()),
    ]);
    const secs = [
      ...((ev.data ?? []) as { payload: { handling_seconds?: number } | null }[]).map((e) => e.payload?.handling_seconds),
      ...((ov.data ?? []) as { handling_seconds: number | null }[]).map((o) => o.handling_seconds),
    ].filter((n): n is number => typeof n === "number" && n > 0);
    return { n: secs.length, avg: secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length) : null };
  },
  refetchInterval: 30_000,
};

const fmtSecs = (s: number) => (s < 90 ? `${s}s` : `${Math.round(s / 60)} min`);

function readTab(): TabKey {
  try {
    const v = sessionStorage.getItem(TAB_KEY) as TabKey | null;
    return v && TABS.some((t) => t.key === v) ? v : "to_review";
  } catch {
    return "to_review";
  }
}

function Dashboard() {
  const { me } = useRole();
  const { data = [] } = useQuery(casesQuery);
  const handling = useQuery(handlingQuery);
  const navigate = useNavigate();
  const [tab, setTabState] = useState<TabKey>(readTab);
  const setTab = (t: TabKey) => {
    setTabState(t);
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch {
      // per-tab convenience only
    }
  };

  const onYou = data.filter(toReview);
  const overdue = onYou.filter((c) => c.workflow?.sla_due_at && new Date(c.workflow.sla_due_at) < new Date());
  const waiting = data.filter((c) => c.workflow?.queue === "waiting_customer");
  const auto = data.filter((c) => c.workflow?.queue === "auto_processed");
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const mine = onYou
    .filter((c) => c.workflow?.assignee === me.name)
    .sort((a, b) => (a.claim.received_at ?? "").localeCompare(b.claim.received_at ?? ""));

  const visibleTabs = TABS.filter((t) => !t.hideWhenEmpty || data.some(t.test));
  const current = visibleTabs.find((t) => t.key === tab) ?? visibleTabs[0];
  const rows = data.filter(current.test);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-mono mb-2">{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
          <h1 className="page-title">
            {greet}, {me.name.split(" ")[0]}
          </h1>
          <p className="mt-2 text-text-2">
            {onYou.length} cases need you. {overdue.length} {overdue.length === 1 ? "is" : "are"} past their SLA.
          </p>
        </div>
        <Button
          disabled={!mine.length && !onYou.length}
          onClick={() => {
            const next = mine[0] ?? onYou[0];
            if (!next) return;
            saveCaseNav("To review", (mine.length ? [...mine, ...onYou.filter((c) => !mine.includes(c))] : onYou).map((c) => c.claim.case_id));
            navigate({ to: "/claims/$caseId", params: { caseId: next.claim.case_id } });
          }}
        >
          {onYou.length ? `Start reviewing · ${onYou.length}` : "All caught up"} {onYou.length > 0 && <ArrowRight />}
        </Button>
      </div>

      {/* Live numbers – information only, the tabs below do the filtering */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="To review" value={onYou.length} sub={`${overdue.length} overdue · SLA 24h`} tone={onYou.length ? "action" : undefined} />
        <Kpi label="Waiting on customer" value={waiting.length} sub="Outreach sent automatically" />
        <Kpi label="Auto-processed" value={auto.length} sub="Routine, not a payment approval" />
        <Kpi
          label="Avg handling time"
          value={handling.data?.avg ? fmtSecs(handling.data.avg) : "–"}
          sub={handling.data?.n ? `${handling.data.n} ${handling.data.n === 1 ? "decision" : "decisions"} today` : "No decisions yet today"}
        />
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div role="tablist" aria-label="Filter claims" className="inline-flex flex-wrap rounded-[11px] bg-[oklch(0.93_0.015_258/0.7)] p-0.5">
            {visibleTabs.map((t) => {
              const n = data.filter(t.test).length;
              const on = t.key === current.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(t.key)}
                  className={cn("flex items-center gap-2 rounded-[9px] px-3 py-1.5 text-[13px]", on ? "pill-active font-medium" : "text-text-2 hover:text-foreground")}
                >
                  {t.label}
                  <span className={cn("font-mono text-[11px]", (t.key === "to_review" || t.key === "policy_change") && n > 0 ? "text-action" : "text-text-3")}>{n}</span>
                </button>
              );
            })}
          </div>
          <span className="label-mono">
            {rows.length} of {data.length} cases
          </span>
        </div>
        <ClaimsTable rows={rows} navLabel={current.label} />
      </Card>
    </div>
  );
}
