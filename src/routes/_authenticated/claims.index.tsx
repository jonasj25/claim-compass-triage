import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { casesQuery } from "@/lib/data";
import { ClaimsTable } from "@/components/triage/ClaimsTable";
import { Card, PageHeader } from "@/components/triage/ui";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/claims/")({
  head: () => ({ meta: [
    { title: "All claims — Clearpath" },
    { name: "description", content: "Look up any Clearpath claim, its recommendation and assignee." },
    { property: "og:title", content: "All claims — Clearpath" },
    { property: "og:description", content: "Search all claims, including automated, waiting and closed cases." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(casesQuery),
  component: ClaimsLookup,
});

function ClaimsLookup() {
  const { data } = useSuspenseQuery(casesQuery);
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const rows = data.filter((row) => [row.claim.case_id, row.claim.claim_summary, row.intake?.customer_name, row.intake?.plate]
    .some((value) => value?.toLowerCase().includes(term)));
  return <div>
    <PageHeader title="All claims" />
    <label className="relative mb-5 block max-w-sm">
      <Search className="absolute left-3 top-3 size-4 text-text-3" />
      <Input aria-label="Search claims" placeholder="Search claims" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
    </label>
    <Card className="p-0"><ClaimsTable rows={rows} navLabel="All claims" /></Card>
  </div>;
}
