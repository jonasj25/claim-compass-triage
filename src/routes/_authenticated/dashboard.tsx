import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, ChevronDown } from "lucide-react";
import { activePolicyQuery, casesQuery } from "@/lib/data";
import { dashboardActivityQuery } from "@/lib/dashboard-activity";
import { buildWorkstream, doneToday, money, WORK_GROUPS, type GroupKey, type WorkItem } from "@/lib/reviewer-workstream";
import { useRole } from "@/lib/role";
import { isClosed } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Chip } from "@/components/triage/ui";
import { saveCaseNav } from "@/lib/case-nav";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "Reviewer dashboard — Clearpath" },
    { name: "description", content: "Your daily claims workstream, ordered by the work that needs you." },
    { property: "og:title", content: "Reviewer dashboard — Clearpath" },
    { property: "og:description", content: "A personal workstream of overdue claims, risks and quality checks." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(casesQuery),
      context.queryClient.ensureQueryData(activePolicyQuery),
      context.queryClient.ensureQueryData(dashboardActivityQuery),
    ]);
  },
  component: Dashboard,
});

function age(receivedAt: string | null, now: Date) {
  if (!receivedAt || !Number.isFinite(Date.parse(receivedAt))) return "unknown age";
  const hours = Math.max(0, Math.floor((now.getTime() - Date.parse(receivedAt)) / 3_600_000));
  return hours < 1 ? "<1h" : hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function Dashboard() {
  const { me } = useRole();
  const { data } = useSuspenseQuery(casesQuery);
  const { data: policy } = useSuspenseQuery(activePolicyQuery);
  const { data: events } = useSuspenseQuery(dashboardActivityQuery);
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const links = useRef(new Map<string, HTMLAnchorElement>());
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const { groups, ordered } = useMemo(() => buildWorkstream(data, policy, me.name, events, now), [data, policy, me.name, events, now]);
  const ids = ordered.map((item) => item.row.claim.case_id);
  const labels = Object.fromEntries(ordered.map((item) => [item.row.claim.case_id, WORK_GROUPS.find((group) => group.key === item.group)?.label ?? "Workstream"]));
  const remember = (item: WorkItem) => saveCaseNav(labels[item.row.claim.case_id], ids, labels);
  const open = (item: WorkItem) => {
    remember(item);
    void navigate({ to: "/claims/$caseId", params: { caseId: item.row.claim.case_id } });
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented ||
        (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest("input, textarea, select, [role=dialog]")))) return;
      const key = event.key.toLowerCase();
      if (!["j", "k", "enter"].includes(key) || !ordered.length) return;
      if (key === "enter") {
        if (!selected || !(event.target instanceof HTMLElement) || !event.target.closest("[data-work-case]")) return;
        const item = ordered.find((item) => item.row.claim.case_id === selected);
        if (item) { event.preventDefault(); open(item); }
        return;
      }
      event.preventDefault();
      const visible = ordered.filter((item) => !collapsed.has(item.group));
      if (!visible.length) return;
      const current = visible.findIndex((item) => item.row.claim.case_id === selected);
      const index = current < 0 ? (key === "j" ? 0 : visible.length - 1) : Math.max(0, Math.min(visible.length - 1, current + (key === "j" ? 1 : -1)));
      const id = visible[index]?.row.claim.case_id;
      if (!id) return;
      setSelected(id);
      links.current.get(id)?.focus();
      links.current.get(id)?.scrollIntoView({ block: "nearest" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  const completed = doneToday(events, me.name, now);
  const overdue = ordered.filter((item) => item.overdue).length;
  const workIds = new Set(ids);
  const autonomous = data.filter((row) => !isClosed(row.claim.case_status) && row.claim.case_status?.toLowerCase() !== "done" && !workIds.has(row.claim.case_id));
  const waiting = autonomous.filter((row) => row.workflow?.queue === "waiting_customer").length;
  const auto = autonomous.filter((row) => row.workflow?.queue === "auto_processed" && !row.workflow.qa_sample &&
    !row.decision?.needs_recheck && !ordered.some((item) => item.row.claim.case_id === row.claim.case_id)).length;
  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label-mono mb-2 tracking-normal">{now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
          <h1 className="page-title break-words tracking-normal">{greet}, {me.name.split(" ")[0]}</h1>
          <p className="mt-2 text-text-2">{ordered.length ? `${ordered.length} cases need you today · ${overdue} overdue · about ${Math.ceil(ordered.length * 1.5)} min` : "Nothing needs you right now."}</p>
        </div>
        {ordered[0] && <Button onClick={() => { const first = ordered[0]; if (first) open(first); }}>Start reviewing <ArrowRight className="size-4" /></Button>}
      </header>

      <div className="mb-8 flex items-center gap-5 border-b border-line pb-6">
        <p className="shrink-0 font-mono text-xs text-text-2">Done today: {completed} · Left: {ordered.length}</p>
        <Progress aria-label="Today's review progress" value={completed + ordered.length ? completed / (completed + ordered.length) * 100 : 0} className="h-1 max-w-sm flex-1 bg-line" />
      </div>

      <div aria-label="Reviewer workstream" className="space-y-7">
        {groups.map((group) => (
          <Collapsible key={group.key} open={!collapsed.has(group.key)} onOpenChange={(isOpen) => setCollapsed((current) => {
            const next = new Set(current); if (isOpen) next.delete(group.key); else next.add(group.key); return next;
          })}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className={cn("mb-2 h-auto w-full justify-start whitespace-normal px-0 py-2 text-left hover:bg-transparent", group.key === "overdue" && "text-action")}>
                <ChevronDown className={cn("size-4 shrink-0 transition-transform motion-reduce:transition-none", collapsed.has(group.key) && "-rotate-90")} />
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-mono text-xs uppercase">{group.label} · {group.items.length}</span>
                  <span className={cn("text-xs font-normal text-text-2", group.key === "overdue" && "text-action")}>— {group.instruction}</span>
                </span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-2">
                {group.items.map((item) => {
                  const { row } = item;
                  const id = row.claim.case_id;
                  return (
                    <Link key={id} to="/claims/$caseId" params={{ caseId: id }} data-work-case={id}
                      ref={(element) => { if (element) links.current.set(id, element); else links.current.delete(id); }}
                      onFocus={() => setSelected(id)} onClick={() => remember(item)}
                      className={cn("card-quiet grid items-center gap-x-4 gap-y-2 p-4 text-sm outline-none hover:border-line focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[100px_minmax(0,1fr)_90px_45px]", item.overdue && "border-action-border bg-action-tint", selected === id && "ring-1 ring-ring")}>
                      <span className="font-mono text-xs">{id}</span>
                      <span className="min-w-0 md:row-span-2">
                        <span className="block truncate font-medium">{row.claim.claim_summary || "Claim summary unknown"}</span>
                        <span className={cn("mt-1 block text-xs leading-relaxed", item.nearLimit ? "text-wait" : "text-text-2")}>{item.why}</span>
                        <span className="mt-2 flex flex-wrap items-center gap-1.5">
                          {item.nearLimit && <span className="inline-flex items-center gap-1 rounded-md border border-wait-border bg-wait-tint px-2 py-0.5 text-xs font-medium text-wait"><AlertTriangle className="size-3" />Near limit</span>}
                          {item.qa && <Chip className="tracking-normal">QA sample</Chip>}
                          {row.workflow?.assignee === null && <Chip className="tracking-normal">Unassigned</Chip>}
                          {row.decision?.needs_recheck && <Chip className="tracking-normal">Policy {row.decision.policy_version}</Chip>}
                          {row.intake?.channel === "phone" && <Chip className="tracking-normal">Phone</Chip>}
                        </span>
                      </span>
                      <span className="num font-mono text-xs md:text-right">{row.claim.quote_eur === null ? "unknown" : money(row.claim.quote_eur)}</span>
                      <span className={cn("font-mono text-xs md:text-right", item.overdue ? "text-action" : "text-text-2")}>{age(row.claim.received_at, now)}</span>
                      <span className="text-xs text-text-2 md:col-start-1">{row.decision?.recommendation === "routine_processing" ? "Routine" : "Human review"}</span>
                    </Link>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>

      <footer className="mt-9 flex flex-wrap items-baseline gap-x-3 gap-y-2 border-t border-line pt-5 text-xs text-text-2">
        <p>Running on its own: {waiting} waiting on customers, {auto} processed automatically. Nothing to do.</p>
        <Link to="/claims" className="underline underline-offset-4 hover:text-foreground">See all claims</Link>
      </footer>
    </div>
  );
}
