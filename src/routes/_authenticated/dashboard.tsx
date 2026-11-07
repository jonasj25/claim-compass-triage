import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Phone,
  Search,
  TriangleAlert,
} from "lucide-react";
import { activePolicyQuery, casesQuery } from "@/lib/data";
import { dashboardActivityQuery, outreachRemindersQuery } from "@/lib/dashboard-activity";
import {
  buildWorkstream,
  isDone,
  claimStatuses,
  CLAIM_STATUSES,
  money,
  WORK_GROUPS,
  type ClaimStatus,
  type GroupKey,
  type WorkItem,
} from "@/lib/reviewer-workstream";
import { useRole } from "@/lib/role";
import { channelLabel } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WORK_TABS, workTab, type WorkTab } from "@/lib/workstream-presentation";
import { Chip } from "@/components/triage/ui";
import { ClaimsProgress } from "@/components/triage/ClaimsProgress";
import { Unknown } from "@/components/triage/ui";
import { saveCaseNav } from "@/lib/case-nav";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "To review — Clearpath" },
      {
        name: "description",
        content: "Every claim that needs the reviewer, grouped by what to do.",
      },
      { property: "og:title", content: "To review — Clearpath" },
      {
        property: "og:description",
        content:
          "The reviewer's task list: decisions, policy re-checks, silent customers and quick double-checks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
const SORT_LABEL: Record<Sort, string> = {
  oldest: "Oldest first",
  newest: "Newest first",
  amount: "Highest quote",
};

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
  const [task, setTask] = useState<"all" | WorkTab>("all");
  const [channel, setChannel] = useState("all");
  const [sort, setSort] = useState<Sort>("oldest");
  const links = useRef(new Map<string, HTMLAnchorElement>());
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const work = useMemo(
    () => buildWorkstream(data, policy, events, outreach),
    [data, policy, events, outreach],
  );
  const counts = useMemo(() => {
    const statuses = claimStatuses(data, new Set(work.ordered.map((i) => i.row.claim.case_id)));
    const c = Object.fromEntries(CLAIM_STATUSES.map((s) => [s, 0])) as Record<ClaimStatus, number>;
    for (const s of statuses.values()) c[s] += 1;
    return c;
  }, [data, work]);
  const channels = useMemo(
    () =>
      [
        ...new Set(work.ordered.map((i) => i.row.intake?.channel).filter((c): c is string => !!c)),
      ].sort(),
    [work],
  );

  const term = search.trim().toLowerCase();
  const matches = (item: WorkItem) => {
    const { row } = item;
    if (task !== "all" && workTab(item) !== task) return false;
    if (channel !== "all" && row.intake?.channel !== channel) return false;
    if (!term) return true;
    return [
      row.claim.case_id,
      row.claim.claim_summary,
      row.intake?.customer_name,
      row.intake?.plate,
      item.why,
    ].some((v) => v?.toLowerCase().includes(term));
  };
  const sorter = (a: WorkItem, b: WorkItem) => {
    if (sort === "amount") return (b.row.claim.quote_eur ?? -1) - (a.row.claim.quote_eur ?? -1);
    const ta = Date.parse(a.row.claim.received_at ?? "") || Infinity,
      tb = Date.parse(b.row.claim.received_at ?? "") || Infinity;
    return sort === "oldest"
      ? ta - tb
      : (tb === Infinity ? -Infinity : tb) - (ta === Infinity ? -Infinity : ta);
  };
  const groups = WORK_TABS.map((label) => ({
    key: label,
    label,
    items: work.ordered.filter((item) => workTab(item) === label && matches(item)).sort(sorter),
  })).filter((g) => g.items.length);
  const visible = groups.flatMap((g) => g.items);
  const filtering = !!term || task !== "all" || channel !== "all";
  const reset = () => {
    setSearch("");
    setTask("all");
    setChannel("all");
  };

  const ids = visible.map((item) => item.row.claim.case_id);
  const labels = Object.fromEntries(visible.map((item) => [item.row.claim.case_id, workTab(item)]));
  const remember = (item: WorkItem) =>
    saveCaseNav(labels[item.row.claim.case_id] ?? "To review", ids, labels);
  const open = (item: WorkItem) => {
    remember(item);
    void navigate({ to: "/claims/$caseId", params: { caseId: item.row.claim.case_id } });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.defaultPrevented ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            event.target.closest(
              "input, textarea, select, [role=dialog], [role=listbox], [role=combobox]",
            )))
      )
        return;
      const key = event.key.toLowerCase();
      if (!["j", "k", "enter"].includes(key) || !visible.length) return;
      if (key === "enter") {
        if (
          !selected ||
          !(event.target instanceof HTMLElement) ||
          !event.target.closest("[data-work-case]")
        )
          return;
        const item = visible.find((i) => i.row.claim.case_id === selected);
        if (item) {
          event.preventDefault();
          open(item);
        }
        return;
      }
      event.preventDefault();
      const shown = visible;
      if (!shown.length) return;
      const current = shown.findIndex((i) => i.row.claim.case_id === selected);
      const index =
        current < 0
          ? key === "j"
            ? 0
            : shown.length - 1
          : Math.max(0, Math.min(shown.length - 1, current + (key === "j" ? 1 : -1)));
      const id = shown[index]?.row.claim.case_id;
      if (!id) return;
      setSelected(id);
      links.current.get(id)?.focus();
      links.current.get(id)?.scrollIntoView({ block: "nearest" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // Header numbers. "Handled automatically" uses the same definition as Workload & flow:
  // open claims whose current recommendation is Auto-processed or Request info.
  const total = work.ordered.length;
  const openRows = data.filter((r) => r.decision && !isDone(r));
  const autoShare = openRows.length
    ? openRows.filter((r) => r.decision?.recommendation !== "human_review").length / openRows.length
    : 0;
  const reviewVolume = work.ordered.reduce((n, i) => n + (i.row.claim.quote_eur ?? 0), 0);
  const oldest = work.ordered.reduce<WorkItem | null>((o, i) => {
    const t = Date.parse(i.row.claim.received_at ?? "");
    if (!Number.isFinite(t)) return o;
    return !o || t < Date.parse(o.row.claim.received_at ?? "") ? i : o;
  }, null);
  const oldestAge = oldest ? age(oldest.row.claim.received_at, now) : null;
  const kpis: { value: string; label: string; sub: string; to?: { status: ClaimStatus } }[] = [
    { value: String(total), label: "To review", sub: "need your decision" },
    {
      value: String(counts.waiting_customer),
      label: "Waiting on customer",
      sub: "request sent, nothing to do",
      to: { status: "waiting_customer" },
    },
    {
      value: `${Math.round(autoShare * 100)}%`,
      label: "Handled automatically",
      sub: `of ${openRows.length} open claims`,
    },
    {
      value: reviewVolume >= 10_000 ? `€${Math.round(reviewVolume / 1000)}k` : money(reviewVolume),
      label: "Quote volume to review",
      sub: total ? `avg ${money(Math.round(reviewVolume / total))} per case` : "nothing waiting",
    },
    {
      value: oldestAge ?? "–",
      label: "Oldest open case",
      sub: oldest ? oldest.row.claim.case_id : "nothing waiting",
    },
  ];

  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="mb-3 text-[14px] font-medium">
            {greet}, {me.name.split(" ")[0]}
          </p>
          <div className="flex flex-wrap divide-x divide-line">
            {kpis.map((k) => {
              const body = (
                <>
                  <div className={cn("num text-[20px] font-semibold", k.label === "To review" && total > 0 && "text-action")}>{k.value}</div>
                  <div className="text-[11px] font-medium text-foreground">{k.label}</div>
                  <div className="text-[11px] text-text-2">{k.sub}</div>
                </>
              );
              return k.to ? (
                <Link key={k.label} to="/claims" search={k.to} className="px-5 first:pl-0 hover:opacity-80">{body}</Link>
              ) : k.label === "Oldest open case" && oldest ? (
                <Link key={k.label} to="/claims/$caseId" params={{ caseId: oldest.row.claim.case_id }} onClick={() => remember(oldest)} className="px-5 first:pl-0 hover:opacity-80">{body}</Link>
              ) : (
                <div key={k.label} className="px-5 first:pl-0">{body}</div>
              );
            })}
          </div>
        </div>
        {visible[0] && (
          <Button
            onClick={() => {
              const first = visible[0];
              if (first) open(first);
            }}
          >
            Start reviewing <ArrowRight className="size-4" />
          </Button>
        )}
      </header>

      <div className="card-quiet overflow-hidden">
        <div
          role="tablist"
          aria-label="Workstream groups"
          className="flex flex-wrap gap-1 border-b border-line px-3 pt-2"
        >
          {(["all", ...WORK_TABS] as const)
            .filter((tab) => tab === "all" || tab === task || work.ordered.some((i) => workTab(i) === tab))
            .map((tab) => (
            <Button
              key={tab}
              variant="ghost"
              role="tab"
              aria-selected={task === tab}
              onClick={() => setTask(tab)}
              className={cn(
                "h-10 rounded-none border-b-2 px-3 text-[12px]",
                task === tab ? "border-link text-link" : "border-transparent text-text-2",
              )}
            >
              {tab === "all" ? "All" : tab}
              <span className="num text-text-3">
                {tab === "all" ? total : work.ordered.filter((i) => workTab(i) === tab).length}
              </span>
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <label className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-3" />
            <Input
              aria-label="Search cases"
              placeholder="Search case number, customer, plate…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 bg-surface pl-8 text-[12px]"
            />
          </label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger aria-label="Channel" className="h-8 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {channels.map((c) => (
                <SelectItem key={c} value={c}>
                  {channelLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger aria-label="Sort" className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as Sort[]).map((v) => (
                <SelectItem key={v} value={v}>
                  {SORT_LABEL[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtering && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Clear filters
            </Button>
          )}
        </div>
        {!visible.length ? (
          <div className="p-12 text-center text-text-2">
            {total ? "No cases match these filters." : "All caught up"}
          </div>
        ) : (
          <table className="w-full table-fixed text-left text-[13px]">
            <thead>
              <tr className="border-b border-line">
                {[
                  "Case ID",
                  "Trigger",
                  "Summary",
                  "Amount",
                  "Received",
                ].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "px-3 py-3 text-[11px] font-medium text-text-2",
                      [
                        "w-[90px]",
                        "w-[220px]",
                        "",
                        "w-[90px] text-right",
                        "w-[100px]",
                      ][i],
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.key}>
                {task === "all" && (
                  <tr className="border-b border-line bg-surface-2">
                    <td colSpan={5} className="h-8 px-3 text-[11px] font-semibold text-text-2">
                      {group.label} · {group.items.length}
                    </td>
                  </tr>
                )}
                {group.items.map((item) => {
                  const { row } = item;
                  const id = row.claim.case_id;
                  const waited = age(row.claim.received_at, now);
                  return (
                    <tr
                      key={id}
                      className={cn(
                        "relative border-b border-line last:border-0 hover:bg-surface-2",
                        selected === id && "bg-surface-2",
                      )}
                    >
                      <td className="px-3 py-2 font-mono text-[12px]">
                        <Link
                          to="/claims/$caseId"
                          params={{ caseId: id }}
                          data-work-case={id}
                          ref={(el) => {
                            if (el) links.current.set(id, el);
                            else links.current.delete(id);
                          }}
                          onFocus={() => setSelected(id)}
                          onClick={() => remember(item)}
                          className="after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring"
                        >
                          {id}
                        </Link>
                      </td>
                      <td className="px-3 py-2" title={item.why}>
                        <Chip className="max-w-full whitespace-normal normal-case tracking-normal font-sans leading-snug">
                          <span className="line-clamp-2">
                            {item.nearLimit ? (
                              <>
                                <TriangleAlert className="mr-1 inline size-3 text-wait" />
                                Near limit
                              </>
                            ) : workTab(item) === "Risk cases" ? (
                              item.why.split(" · ")[0]
                            ) : (
                              workTab(item)
                            )}
                          </span>
                        </Chip>
                      </td>
                      <td
                        className="truncate px-3 py-2"
                        title={row.claim.claim_summary ?? undefined}
                      >
                        {row.claim.claim_summary ?? <Unknown />}
                      </td>
                      <td className="num px-3 py-2 text-right">
                        {row.claim.quote_eur === null ? <Unknown /> : money(row.claim.quote_eur)}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-text-2">
                        {waited ? `${waited} ago` : <Unknown />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        )}
      </div>
      <p className="mt-4 text-[12px] text-text-2">
        Running on its own · {counts.auto_processed} auto-processed · {counts.waiting_customer}{" "}
        waiting on customer · {counts.done} done{" "}
        <Link to="/claims" className="ml-3 underline underline-offset-4">
          See all claims
        </Link>
      </p>
    </div>
  );
}
