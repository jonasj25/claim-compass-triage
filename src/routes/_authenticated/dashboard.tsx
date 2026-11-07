import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, Phone, Search } from "lucide-react";
import { activePolicyQuery, casesQuery } from "@/lib/data";
import { dashboardActivityQuery, outreachRemindersQuery } from "@/lib/dashboard-activity";
import {
  buildWorkstream, claimStatuses, CLAIM_STATUSES, money, WORK_GROUPS,
  type ClaimStatus, type GroupKey, type WorkItem,
} from "@/lib/reviewer-workstream";
import { useRole } from "@/lib/role";
import { channelLabel } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClaimsProgress } from "@/components/triage/ClaimsProgress";
import { Unknown } from "@/components/triage/ui";
import { saveCaseNav } from "@/lib/case-nav";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "To review — Clearpath" },
    { name: "description", content: "Every claim that needs the reviewer, grouped by what to do." },
    { property: "og:title", content: "To review — Clearpath" },
    { property: "og:description", content: "The reviewer's task list: decisions, policy re-checks, silent customers and quick double-checks." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(casesQuery),
      context.queryClient.ensureQueryData(activePolicyQuery),
      context.queryClient.ensureQueryData(dashboardActivityQuery),
      context.queryClient.ensureQueryData(outreachRemindersQuery),
    ]);
  },
  component: Dashboard,
});

type Sort = "oldest" | "newest" | "amount";
const SORT_LABEL: Record<Sort, string> = { oldest: "Oldest first", newest: "Newest first", amount: "Highest quote" };

function age(receivedAt: string | null, now: Date) {
  if (!receivedAt || !Number.isFinite(Date.parse(receivedAt))) return null;
  const hours = Math.max(0, Math.floor((now.getTime() - Date.parse(receivedAt)) / 3_600_000));
  return hours < 1 ? "<1h" : hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function Dashboard() {
  const { me } = useRole();
  const { data } = useSuspenseQuery(casesQuery);
  const { data: policy } = useSuspenseQuery(activePolicyQuery);
  const { data: events } = useSuspenseQuery(dashboardActivityQuery);
  const { data: outreach } = useSuspenseQuery(outreachRemindersQuery);
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [task, setTask] = useState<"all" | GroupKey>("all");
  const [channel, setChannel] = useState("all");
  const [sort, setSort] = useState<Sort>("oldest");
  const links = useRef(new Map<string, HTMLAnchorElement>());
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const work = useMemo(() => buildWorkstream(data, policy, events, outreach), [data, policy, events, outreach]);
  const counts = useMemo(() => {
    const statuses = claimStatuses(data, new Set(work.ordered.map((i) => i.row.claim.case_id)));
    const c = Object.fromEntries(CLAIM_STATUSES.map((s) => [s, 0])) as Record<ClaimStatus, number>;
    for (const s of statuses.values()) c[s] += 1;
    return c;
  }, [data, work]);
  const channels = useMemo(() => [...new Set(work.ordered.map((i) => i.row.intake?.channel).filter((c): c is string => !!c))].sort(), [work]);

  const term = search.trim().toLowerCase();
  const matches = (item: WorkItem) => {
    const { row } = item;
    if (task !== "all" && item.group !== task) return false;
    if (channel !== "all" && row.intake?.channel !== channel) return false;
    if (!term) return true;
    return [row.claim.case_id, row.claim.claim_summary, row.intake?.customer_name, row.intake?.plate, item.why]
      .some((v) => v?.toLowerCase().includes(term));
  };
  const sorter = (a: WorkItem, b: WorkItem) => {
    if (sort === "amount") return (b.row.claim.quote_eur ?? -1) - (a.row.claim.quote_eur ?? -1);
    const ta = Date.parse(a.row.claim.received_at ?? "") || Infinity, tb = Date.parse(b.row.claim.received_at ?? "") || Infinity;
    return sort === "oldest" ? ta - tb : (tb === Infinity ? -Infinity : tb) - (ta === Infinity ? -Infinity : ta);
  };
  const groups = work.groups.map((g) => ({ ...g, items: g.items.filter(matches).sort(sorter) })).filter((g) => g.items.length);
  const visible = groups.flatMap((g) => g.items);
  const filtering = !!term || task !== "all" || channel !== "all";
  const reset = () => { setSearch(""); setTask("all"); setChannel("all"); };

  const ids = visible.map((item) => item.row.claim.case_id);
  const labels = Object.fromEntries(visible.map((item) => [item.row.claim.case_id, WORK_GROUPS.find((g) => g.key === item.group)?.label ?? "To review"]));
  const remember = (item: WorkItem) => saveCaseNav(labels[item.row.claim.case_id] ?? "To review", ids, labels);
  const open = (item: WorkItem) => {
    remember(item);
    void navigate({ to: "/claims/$caseId", params: { caseId: item.row.claim.case_id } });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented ||
        (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest("input, textarea, select, [role=dialog], [role=listbox], [role=combobox]")))) return;
      const key = event.key.toLowerCase();
      if (!["j", "k", "enter"].includes(key) || !visible.length) return;
      if (key === "enter") {
        if (!selected || !(event.target instanceof HTMLElement) || !event.target.closest("[data-work-case]")) return;
        const item = visible.find((i) => i.row.claim.case_id === selected);
        if (item) { event.preventDefault(); open(item); }
        return;
      }
      event.preventDefault();
      const shown = visible.filter((i) => !collapsed.has(i.group));
      if (!shown.length) return;
      const current = shown.findIndex((i) => i.row.claim.case_id === selected);
      const index = current < 0 ? (key === "j" ? 0 : shown.length - 1) : Math.max(0, Math.min(shown.length - 1, current + (key === "j" ? 1 : -1)));
      const id = shown[index]?.row.claim.case_id;
      if (!id) return;
      setSelected(id);
      links.current.get(id)?.focus();
      links.current.get(id)?.scrollIntoView({ block: "nearest" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const total = work.ordered.length;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label-mono mb-2 tracking-normal">
            {greet}, {me.name.split(" ")[0]} · {now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          </p>
          <h1 className="page-title tracking-normal">To review</h1>
          <p className="mt-2 text-text-2">
            {total ? <><span className="num font-medium text-foreground">{total}</span> {total === 1 ? "case needs" : "cases need"} you. Everything else runs on its own.</> : "Nothing needs you right now."}
          </p>
        </div>
        {visible[0] && (
          <Button size="lg" onClick={() => { const first = visible[0]; if (first) open(first); }}>
            Start reviewing <ArrowRight className="size-4" />
          </Button>
        )}
      </header>

      <ClaimsProgress counts={counts} className="mb-6" />

      {total === 0 ? (
        <div className="card-quiet flex flex-col items-center px-6 py-16 text-center">
          <CheckCircle2 className="size-8 text-ok" strokeWidth={1.5} />
          <p className="mt-4 text-[15px] font-medium">All caught up</p>
          <p className="mt-1 max-w-sm text-[13px] text-text-2">No case needs a decision right now. New claims that need you will show up here automatically.</p>
          <Link to="/claims" className="mt-5 text-[13px] text-text-2 underline underline-offset-4 hover:text-foreground">See all claims</Link>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" />
              <Input aria-label="Search cases" placeholder="Search case number, customer, plate…" value={search}
                onChange={(e) => setSearch(e.target.value)} className="h-9 bg-white/70 pl-9" />
            </label>
            <Select value={task} onValueChange={(v) => setTask(v as typeof task)}>
              <SelectTrigger aria-label="Task" className="h-9 w-auto min-w-[170px] bg-white/70"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tasks</SelectItem>
                {work.groups.map((g) => <SelectItem key={g.key} value={g.key}>{g.label} ({g.items.length})</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger aria-label="Channel" className="h-9 w-auto min-w-[150px] bg-white/70"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                {channels.map((c) => <SelectItem key={c} value={c}>{channelLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger aria-label="Sort" className="h-9 w-auto min-w-[140px] bg-white/70"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABEL) as Sort[]).map((s) => <SelectItem key={s} value={s}>{SORT_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            {filtering && <Button variant="ghost" size="sm" onClick={reset} className="text-text-2">Clear filters</Button>}
          </div>

          <div className="card-quiet overflow-hidden p-0">
            {visible.length === 0 ? (
              <div className="px-6 py-12 text-center text-[13px] text-text-2">
                No case matches these filters. <button onClick={reset} className="underline underline-offset-4 hover:text-foreground">Clear filters</button>
              </div>
            ) : (
              <table className="w-full table-fixed text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line">
                    {["Case", "What happened", "Why it's here", "Quote", "Waiting since"].map((h, i) => (
                      <th key={h} className={cn("label-mono px-4 py-2.5 font-normal", ["w-[108px]", "", "hidden w-[38%] md:table-cell", "w-[96px] text-right", "w-[108px] text-right"][i])}>{h}</th>
                    ))}
                  </tr>
                </thead>
                {groups.map((group) => {
                  const isCollapsed = collapsed.has(group.key);
                  return (
                    <tbody key={group.key}>
                      <tr className="border-b border-line bg-surface-2/60">
                        <td colSpan={5} className="p-0">
                          <button type="button" aria-expanded={!isCollapsed}
                            onClick={() => setCollapsed((cur) => { const next = new Set(cur); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; })}
                            className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2.5 text-left">
                            <ChevronDown className={cn("size-3.5 shrink-0 self-center transition-transform motion-reduce:transition-none", isCollapsed && "-rotate-90")} />
                            <span className="text-[13px] font-semibold">{group.label}</span>
                            <span className="num rounded-full bg-white px-1.5 text-[11px] font-medium text-text-2">{group.items.length}</span>
                            <span className="text-[12px] text-text-2">{group.instruction}</span>
                          </button>
                        </td>
                      </tr>
                      {!isCollapsed && group.items.map((item) => {
                        const { row } = item;
                        const id = row.claim.case_id;
                        const waited = age(row.claim.received_at, now);
                        return (
                          <tr key={id} className={cn("relative border-b border-line/70 last:border-0 hover:bg-white/70", selected === id && "bg-white/80")}>
                            <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px]">
                              <Link to="/claims/$caseId" params={{ caseId: id }} data-work-case={id}
                                ref={(el) => { if (el) links.current.set(id, el); else links.current.delete(id); }}
                                onFocus={() => setSelected(id)} onClick={() => remember(item)}
                                className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
                                {id}
                              </Link>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="flex items-center gap-1.5">
                                {row.intake?.channel === "phone" && <Phone aria-label="Reported by phone" className="size-3.5 shrink-0 text-text-3" />}
                                <span className="truncate">{row.claim.claim_summary || "Claim summary unknown"}</span>
                              </span>
                              <span className="mt-0.5 block truncate text-[12px] text-text-2 md:hidden">{item.why}</span>
                            </td>
                            <td className={cn("hidden truncate px-4 py-2.5 text-text-2 md:table-cell", item.nearLimit && "text-wait", item.group === "no_reply" && "text-wait")} title={item.why}>
                              {item.why}
                            </td>
                            <td className="num px-4 py-2.5 text-right">{row.claim.quote_eur === null ? <Unknown /> : money(row.claim.quote_eur)}</td>
                            <td className="num px-4 py-2.5 text-right font-mono text-[12px] text-text-2">{waited ?? <Unknown />}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
            )}
          </div>
          <p className="mt-4 text-[12px] text-text-2">
            <kbd className="rounded border border-line bg-white px-1 font-mono text-[11px]">J</kbd> / <kbd className="rounded border border-line bg-white px-1 font-mono text-[11px]">K</kbd> to move,{" "}
            <kbd className="rounded border border-line bg-white px-1 font-mono text-[11px]">Enter</kbd> to open ·{" "}
            <Link to="/claims" className="underline underline-offset-4 hover:text-foreground">See all claims</Link>
          </p>
        </>
      )}
    </div>
  );
}
