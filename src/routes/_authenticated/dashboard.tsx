import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { casesQuery } from "@/lib/data";
import { useRole } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { Card, Kpi } from "@/components/triage/ui";
import { ClaimsTable } from "@/components/triage/ClaimsTable";
import type { Queue } from "@/lib/lifecycle";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Triage" }, { name: "description", content: "Cases that need you today." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { me } = useRole();
  const { data = [] } = useQuery(casesQuery);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Queue | null>(null);

  const onYou = data.filter((c) => c.workflow && (c.workflow.queue === "on_you" || c.workflow.qa_sample) && c.workflow.queue !== "done");
  const overdue = onYou.filter((c) => c.workflow?.sla_due_at && new Date(c.workflow.sla_due_at) < new Date());
  const waiting = data.filter((c) => c.workflow?.queue === "waiting_customer");
  const auto = data.filter((c) => c.workflow?.queue === "auto_processed");
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const mine = onYou.filter((c) => c.workflow?.assignee === me.name).sort((a, b) => (a.claim.received_at ?? "").localeCompare(b.claim.received_at ?? ""));

  const rows = filter === "on_you" ? onYou : filter ? data.filter((c) => c.workflow?.queue === filter) : onYou;
  const toggle = (q: Queue) => setFilter((f) => (f === q ? null : q));

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-mono mb-2">{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
          <h1 className="page-title">{greet}, {me.name.split(" ")[0]}</h1>
          <p className="mt-2 text-text-2">
            {onYou.length} cases need you. {overdue.length} {overdue.length === 1 ? "is" : "are"} past their SLA.
          </p>
        </div>
        <Button
          disabled={!mine.length && !onYou.length}
          onClick={() => {
            const next = mine[0] ?? onYou[0];
            if (next) navigate({ to: "/claims/$caseId", params: { caseId: next.claim.case_id } });
          }}
        >
          Start next case <ArrowRight />
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="On you" value={onYou.length} sub={`${overdue.length} overdue · SLA 24h`} tone={onYou.length ? "action" : undefined} onClick={() => toggle("on_you")} active={filter === "on_you"} />
        <Kpi label="Waiting on customer" value={waiting.length} sub="Outreach sent automatically" onClick={() => toggle("waiting_customer")} active={filter === "waiting_customer"} />
        <Kpi label="Auto-processed" value={auto.length} sub="Routine, not a payment approval" onClick={() => toggle("auto_processed")} active={filter === "auto_processed"} />
        <Kpi label="Avg handling time" value="—" sub="Measured from the first decision" />
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="section-title">{filter ? filter.replace("_", " ").replace(/^\w/, (s) => s.toUpperCase()) : "On you"}</h2>
          <span className="label-mono">{rows.length} of {data.length} cases</span>
        </div>
        <ClaimsTable rows={rows} />
      </Card>
    </div>
  );
}
