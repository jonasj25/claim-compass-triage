import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { activePolicyQuery, casesQuery } from "@/lib/data";
import { dashboardActivityQuery, outreachRemindersQuery } from "@/lib/dashboard-activity";
import { buildWorkstream, claimStatuses, CLAIM_STATUS_LABEL, CLAIM_STATUSES, type ClaimStatus } from "@/lib/reviewer-workstream";
import { channelLabel } from "@/lib/labels";
import { ClaimsTable } from "@/components/triage/ClaimsTable";
import { PageHeader } from "@/components/triage/ui";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "all" | ClaimStatus;
type Sort = "newest" | "oldest" | "amount" | "case";
const SORT_LABEL: Record<Sort, string> = { newest: "Newest first", oldest: "Oldest first", amount: "Highest quote", case: "Case number" };

export const Route = createFileRoute("/_authenticated/claims/")({
  head: () => ({ meta: [
    { title: "All claims — Clearpath" },
    { name: "description", content: "Every Clearpath claim with its status and recommendation." },
    { property: "og:title", content: "All claims — Clearpath" },
    { property: "og:description", content: "Search all claims, including auto-processed, waiting and done cases." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (s: Record<string, unknown>): { status?: ClaimStatus } =>
    typeof s.status === "string" && (CLAIM_STATUSES as string[]).includes(s.status) ? { status: s.status as ClaimStatus } : {},
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(casesQuery),
      context.queryClient.ensureQueryData(activePolicyQuery),
      context.queryClient.ensureQueryData(dashboardActivityQuery),
      context.queryClient.ensureQueryData(outreachRemindersQuery),
    ]);
  },
  component: AllClaims,
});

function AllClaims() {
  const { data } = useSuspenseQuery(casesQuery);
  const { data: policy } = useSuspenseQuery(activePolicyQuery);
  const { data: events } = useSuspenseQuery(dashboardActivityQuery);
  const { data: outreach } = useSuspenseQuery(outreachRemindersQuery);
  const { status } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab: Tab = status ?? "all";
  const setTab = (t: Tab) => void navigate({ search: t === "all" ? {} : { status: t }, replace: true });
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [sort, setSort] = useState<Sort>("newest");

  const statuses = useMemo(() => {
    const work = buildWorkstream(data, policy, events, outreach);
    return claimStatuses(data, new Set(work.ordered.map((i) => i.row.claim.case_id)));
  }, [data, policy, events, outreach]);
  const count = (t: Tab) => (t === "all" ? data.length : data.filter((r) => statuses.get(r.claim.case_id) === t).length);
  const channels = [...new Set(data.map((r) => r.intake?.channel).filter((c): c is string => !!c))].sort();

  const term = search.trim().toLowerCase();
  const time = (iso: string | null) => Date.parse(iso ?? "") || 0;
  const rows = data
    .filter((r) => tab === "all" || statuses.get(r.claim.case_id) === tab)
    .filter((r) => channel === "all" || r.intake?.channel === channel)
    .filter((r) => !term || [r.claim.case_id, r.claim.claim_summary, r.intake?.customer_name, r.intake?.plate].some((v) => v?.toLowerCase().includes(term)))
    .sort((a, b) =>
      sort === "case" ? a.claim.case_id.localeCompare(b.claim.case_id) :
      sort === "amount" ? (b.claim.quote_eur ?? -1) - (a.claim.quote_eur ?? -1) :
      sort === "oldest" ? time(a.claim.received_at) - time(b.claim.received_at) : time(b.claim.received_at) - time(a.claim.received_at));
  const filtering = !!term || channel !== "all";

  return (
    <div>
      <PageHeader title="All claims" sub="Every claim, whatever its status. Your tasks are on the To review page." />
      {/* Same look as the Workstream: tabs, filters and table in one card */}
      <div className="card-quiet overflow-hidden">
        <div role="tablist" aria-label="Status" className="flex flex-wrap gap-1 border-b border-line px-3 pt-2">
          {(["all", ...CLAIM_STATUSES] as Tab[]).map((t) => (
            <Button
              variant="ghost"
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "h-10 gap-1.5 rounded-none border-b-2 px-3 text-[12px] hover:bg-transparent",
                tab === t ? "border-link text-link" : "border-transparent text-text-2 hover:text-foreground",
              )}
            >
              {t === "all" ? "All" : CLAIM_STATUS_LABEL[t]}
              <span className="num text-text-3">{count(t)}</span>
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <label className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-3" />
            <Input aria-label="Search claims" placeholder="Search case number, customer, plate…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="h-8 bg-surface pl-8 text-[12px]" />
          </label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger aria-label="Channel" className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {channels.map((c) => <SelectItem key={c} value={c}>{channelLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger aria-label="Sort" className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as Sort[]).map((s) => <SelectItem key={s} value={s}>{SORT_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          {filtering && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setChannel("all"); }}>Clear filters</Button>}
          <span className="ml-auto text-[11px] text-text-2">{rows.length} shown</span>
        </div>
        <ClaimsTable rows={rows} statuses={statuses} navLabel={tab === "all" ? "All claims" : CLAIM_STATUS_LABEL[tab]} />
      </div>
    </div>
  );
}
