import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, ArrowRight, Clock, Users, Zap, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { casesQuery, type CaseRow } from "@/lib/data";
import { useRole } from "@/lib/role";
import { isClosed } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/triage/ui";
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

      {/* Live numbers; each tile selects the same filter as its tab below */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          color="red"
          icon={AlertTriangle}
          label="To review"
          value={onYou.length}
          sub={`${overdue.length} overdue · SLA 24h`}
          progress={onYou.length ? overdue.length / onYou.length : 0}
          progressLabel={`${overdue.length} of ${onYou.length} past their SLA`}
          onClick={() => setTab("to_review")}
          active={current.key === "to_review"}
        />
        <StatTile
          color="orange"
          icon={Users}
          label="Waiting on customer"
          value={waiting.length}
          sub="Outreach sent automatically."
          onClick={() => setTab("waiting_customer")}
          active={current.key === "waiting_customer"}
        />
        <StatTile
          color="green"
          icon={Zap}
          label="Auto-processed"
          value={auto.length}
          sub="Not a payment approval."
          onClick={() => setTab("auto_processed")}
          active={current.key === "auto_processed"}
        />
        <StatTile
          color="purple"
          icon={Clock}
          label="Avg handling time"
          value={handling.data?.avg ? fmtSecs(handling.data.avg) : "–"}
          sub={handling.data?.n ? `${handling.data.n} ${handling.data.n === 1 ? "decision" : "decisions"} today.` : "No decisions yet today."}
          onClick={() => setTab("done")}
          active={current.key === "done"}
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

const TILE_COLORS = {
  // same red family as the "Human review" recommendation: this is the tile that needs a person
  red: { bg: "bg-[linear-gradient(135deg,oklch(0.985_0.014_35),oklch(0.955_0.038_30))]", chip: "bg-[oklch(0.93_0.05_32)] text-action", blob: "bg-[oklch(0.86_0.08_32/0.5)]", bar: "bg-action-dot", track: "bg-[oklch(0.9_0.045_32)]", hover: "hover:ring-[oklch(0.84_0.07_32)]", ring: "ring-[oklch(0.72_0.14_34)]" },
  orange: { bg: "bg-[linear-gradient(135deg,oklch(0.985_0.015_75),oklch(0.96_0.035_65))]", chip: "bg-[oklch(0.94_0.045_65)] text-[oklch(0.58_0.15_50)]", blob: "bg-[oklch(0.9_0.06_65/0.5)]", bar: "", track: "", hover: "hover:ring-[oklch(0.88_0.06_62)]", ring: "ring-[oklch(0.78_0.11_58)]" },
  green: { bg: "bg-[linear-gradient(135deg,oklch(0.98_0.02_155),oklch(0.955_0.045_158))]", chip: "bg-[oklch(0.92_0.06_155)] text-[oklch(0.48_0.13_155)]", blob: "bg-[oklch(0.88_0.08_155/0.5)]", bar: "", track: "", hover: "hover:ring-[oklch(0.86_0.07_155)]", ring: "ring-[oklch(0.7_0.11_155)]" },
  purple: { bg: "bg-[linear-gradient(135deg,oklch(0.978_0.014_295),oklch(0.952_0.03_290))]", chip: "bg-[oklch(0.93_0.035_290)] text-[oklch(0.42_0.12_290)]", blob: "bg-[oklch(0.9_0.05_290/0.5)]", bar: "", track: "", hover: "hover:ring-[oklch(0.87_0.05_290)]", ring: "ring-[oklch(0.72_0.09_290)]" },
} as const;

function StatTile({
  color,
  icon: Icon,
  label,
  value,
  sub,
  progress,
  progressLabel,
  onClick,
  active,
}: {
  color: keyof typeof TILE_COLORS;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  sub: ReactNode;
  progress?: number;
  progressLabel?: string;
  onClick: () => void;
  active: boolean;
}) {
  const c = TILE_COLORS[color];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // Hover stays in place: the frame takes the tile's colour, the shadow deepens and the glow grows softly
        "group relative flex cursor-pointer flex-col items-start overflow-hidden rounded-[16px] p-5 text-left outline-none ring-1 ring-white/80",
        "shadow-[0_1px_2px_oklch(0.35_0.05_262/0.05)] transition-[box-shadow] duration-300 ease-out hover:shadow-[var(--shadow-lift)]",
        "focus-visible:ring-2",
        c.bg,
        c.hover,
        active && cn("shadow-[var(--shadow-lift)] ring-2 hover:ring-2", c.ring),
      )}
    >
      {/* soft decorative glow in the corner */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -bottom-12 -right-10 size-36 rounded-full opacity-80 blur-2xl transition-[transform,opacity] duration-500 ease-out group-hover:scale-125 group-hover:opacity-100",
          active && "scale-125 opacity-100",
          c.blob,
        )}
      />
      <span className="relative flex items-center gap-2.5">
        <span className={cn("inline-flex size-7 items-center justify-center rounded-[8px] transition-transform duration-300 ease-out group-hover:scale-110", c.chip)}>
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
        <span className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-foreground/80">{label}</span>
      </span>
      <span className="num relative mt-3 text-[34px] font-semibold leading-none tracking-tight text-foreground">{value}</span>
      <span className="relative mt-2 text-[12.5px] text-text-2">{sub}</span>
      {progress !== undefined && (
        <span className={cn("relative mt-3 h-1 w-full overflow-hidden rounded-full", c.track)} role="img" aria-label={progressLabel}>
          <span className={cn("block h-full rounded-full transition-[width] duration-500", c.bar)} style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
        </span>
      )}
    </button>
  );
}
