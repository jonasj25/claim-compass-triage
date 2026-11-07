import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, Phone, Search, TriangleAlert, ListFilter } from "lucide-react";
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
import { WORK_TABS, workTab, workPriority, type WorkTab } from "@/lib/workstream-presentation";
import { Avatar, Chip } from "@/components/triage/ui";
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
  const [task, setTask] = useState<"all" | WorkTab>("all");
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
    if (task !== "all" && workTab(item) !== task) return false;
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
  const groups = WORK_TABS.map((label) => ({ key: label, label, items: work.ordered.filter((item) => workTab(item) === label && matches(item)).sort(sorter) })).filter((g) => g.items.length);
  const visible = groups.flatMap((g) => g.items);
  const filtering = !!term || task !== "all" || channel !== "all";
  const reset = () => { setSearch(""); setTask("all"); setChannel("all"); };

  const ids = visible.map((item) => item.row.claim.case_id);
  const labels = Object.fromEntries(visible.map((item) => [item.row.claim.case_id, workTab(item)]));
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
      const shown = visible;
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
      <header className="mb-5 flex items-end justify-between gap-4">
        <div><p className="mb-3 text-[14px] font-medium">{greet}, {me.name.split(" ")[0]}</p>
          <div className="flex divide-x divide-line">
            {[[total, "To review"], [work.ordered.filter((i) => workTab(i) === "Overdue").length, "Overdue"], [work.ordered.filter((i) => !i.row.workflow?.assignee).length, "Unassigned"], [`~${work.ordered.reduce((n, i) => n + (i.group === "double_check" ? 1 : 3), 0)} min`, "Estimated effort"]].map(([v, label]) => <div key={label} className="px-5 first:pl-0"><div className="num text-[20px] font-semibold">{v}</div><div className="text-[11px] text-text-2">{label}</div></div>)}
          </div>
        </div>
        {visible[0] && <Button onClick={() => { const first = visible[0]; if (first) open(first); }}>Start reviewing <ArrowRight className="size-4" /></Button>}
      </header>

      {total === 0 ? (
        <div className="card-quiet flex flex-col items-center px-6 py-16 text-center">
          <CheckCircle2 className="size-8 text-ok" strokeWidth={1.5} />
          <p className="mt-4 text-[12px] text-text-2">Running on its own · {counts.auto_processed} auto-processed · {counts.waiting_customer} waiting on customer · {counts.done} done <Link to="/claims" className="ml-3 underline underline-offset-4">See all claims</Link></p>
        </>
      )}
    </div>
  );
}
