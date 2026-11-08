import { createFileRoute, Link } from "@tanstack/react-router";
import { caseMix } from "@/lib/claim-mix";
import { effectiveRec } from "@/lib/effective";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { activePolicyQuery, casesQuery, type CaseRow } from "@/lib/data";
import { isClosed } from "@/lib/csv";
import { QUEUE_LABELS } from "@/lib/lifecycle";
import { secondCheckReason } from "@/lib/second-check";
import { decide, RECOMMENDATION_LABELS, type Policy, type Recommendation } from "@/lib/triage";
import { Card, Kpi, PageHeader, StatusDot } from "@/components/triage/ui";
import { HBars, REC_COLOR, SERIES, StackedShare } from "@/components/triage/charts";
import { AssignmentPanel } from "@/components/triage/AssignmentPanel";

export const Route = createFileRoute("/_authenticated/overview")({
  head: () => ({
    meta: [
      { title: "Workload & flow — Clearpath" },
      {
        name: "description",
        content:
          "Queues, automation rate, why claims need a person and the effect of policy changes.",
      },
      { property: "og:title", content: "Workload & flow — Clearpath" },
      {
        property: "og:description",
        content: "Live claim queues and reviewer workload.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

const TRIGGER_LABEL: Record<string, string> = {
  policy_active: "Policy not active",
  claim_type: "Not own damage",
  injury_reported: "Injury",
  liability_disputed: "Fault disputed",
  duplicate_flag: "Possible duplicate",
  evidence_conflict: "Evidence conflict",
  quote_limit: "Quote over limit",
  repair_type: "EV battery repair",
};

const RECS: Recommendation[] = ["routine_processing", "request_information", "human_review"];
const dayKey = (iso: string) => iso.slice(0, 10);

function Overview() {
  const { data: cases = [], isLoading } = useQuery(casesQuery);
  const { data: policy } = useQuery(activePolicyQuery);
  const s = useMemo(() => (policy ? stats(cases, policy) : null), [cases, policy]);

  if (isLoading || !s || !policy) return <p className="label-mono">Loading</p>;

  return (
    <div>
      <PageHeader
        eyebrow="Ops lead"
        title="Workload & flow"
        sub={`Live from ${s.total} claims in the system · active policy ${policy.version.toUpperCase()}`}
      />

      <div className="kpi-strip grid grid-cols-3 gap-0 lg:grid-cols-5">
        <Kpi label="Open claims" value={s.open} sub={`${s.closed} closed`} />
        <Kpi label={QUEUE_LABELS.on_you} value={s.queue.on_you} sub="need a reviewer" />
        <Kpi label="Second checks" value={s.second} sub="auto-processed, near limit" />
        <Kpi
          label={QUEUE_LABELS.waiting_customer}
          value={s.queue.waiting_customer}
          sub="request sent"
        />
        <Kpi
          label={QUEUE_LABELS.auto_processed}
          value={s.queue.auto_processed}
          sub="no human needed"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="section-title">Handled without a reviewer</h2>
              <p className="mt-1 text-[13px] text-text-2">
                Open claims, by next step under the decision they hold now.
              </p>
            </div>
            <p className="num text-[20px] font-semibold leading-none tracking-tight">
              {Math.round(s.automation * 100)}%
            </p>
          </div>
          <div className="mt-6">
            <StackedShare
              height={18}
              segments={RECS.map((r) => ({
                key: r,
                label: RECOMMENDATION_LABELS[r],
                value: s.recs[r],
                color: REC_COLOR[r],
              }))}
            />
          </div>
          <p className="mt-4 text-[12.5px] text-text-3">
            Auto-processed plus automatic requests for information. Second checks near the limit add
            a short human look afterwards without blocking the claim.
          </p>
        </Card>

        <Card>
          <h2 className="section-title">Why claims go to a person</h2>
          <p className="mb-4 mt-1 text-[13px] text-text-2">
            Review reasons on open claims waiting for a reviewer. One claim can have several.
          </p>
          <HBars
            items={s.reasons.map(([k, v]) => ({
              key: k,
              label: TRIGGER_LABEL[k] ?? k,
              value: v,
              color: SERIES.primary,
            }))}
            empty="No claims are waiting for review."
          />
        </Card>
      </div>

      <div className="mt-6 grid gap-6">
        <Card>
          <h2 className="section-title">Claims received, last 14 days</h2>
          <p className="mt-1 text-[13px] text-text-2">By the day they entered the system.</p>
          <div className="mt-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.inflow} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--text-2)" }}
                  interval={1}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--text-2)" }}
                />
                <Tooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }}
                  formatter={(v: number) => [v, "Claims"]}
                />
                <Bar dataKey="count" fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <AssignmentPanel cases={cases} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <h2 className="section-title">Decisions by policy version</h2>
          <p className="mb-5 mt-1 text-[13px] text-text-2">
            Current decisions on all claims. Closed claims keep the version they were decided under.
          </p>
          <div className="space-y-5">
            {s.versions.map(([v, recs]) => {
              const n = RECS.reduce((a, r) => a + recs[r], 0);
              return (
                <div key={v}>
                  <p className="mb-2 text-[13px]">
                    <span className="font-mono font-medium uppercase">{v}</span>
                    <span className="ml-2 text-text-2">{n} claims</span>
                  </p>
                  <StackedShare
                    segments={RECS.map((r) => ({
                      key: r,
                      label: RECOMMENDATION_LABELS[r],
                      value: recs[r],
                      color: REC_COLOR[r],
                    }))}
                  />
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-0">
          <div className="flex items-baseline justify-between px-6 pt-5 pb-3">
            <h2 className="section-title">Open claims to recheck after a policy change</h2>
            <span className="num text-[13px] text-text-2">{s.recheck.length}</span>
          </div>
          {s.recheck.length ? (
            <ul className="divide-y divide-line border-t border-line text-[13px]">
              {s.recheck.slice(0, 8).map((c) => (
                <li
                  key={c.claim.case_id}
                  className="flex items-center justify-between gap-3 px-6 py-2.5"
                >
                  <Link
                    to="/claims/$caseId"
                    params={{ caseId: c.claim.case_id }}
                    className="font-mono text-[12px] hover:underline"
                  >
                    {c.claim.case_id}
                  </Link>
                  <span className="truncate text-text-2">{c.claim.claim_summary}</span>
                  {c.decision && <StatusDot rec={effectiveRec(c) ?? c.decision.recommendation} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 pb-6 text-[13px] text-text-2">
              No open claim is waiting for a recheck.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function stats(cases: CaseRow[], policy: Policy) {
  const open = cases.filter((c) => !isClosed(c.claim.case_status));
  const queue = { on_you: 0, waiting_customer: 0, auto_processed: 0, done: 0 } as Record<
    string,
    number
  >;
  const recs = { routine_processing: 0, request_information: 0, human_review: 0 } as Record<
    Recommendation,
    number
  >;
  const reasons = new Map<string, number>();
  const load = new Map<string, number>();
  const versions = new Map<string, Record<Recommendation, number>>();
  let second = 0;
  const now = Date.now();

  for (const c of cases) {
    if (c.decision) {
      const v = versions.get(c.decision.policy_version) ?? {
        routine_processing: 0,
        request_information: 0,
        human_review: 0,
      };
      v[c.decision.recommendation]++;
      versions.set(c.decision.policy_version, v);
    }
  }
  for (const c of open) {
    const q = c.workflow?.queue;
    if (q) queue[q] = (queue[q] ?? 0) + 1;
    const needsPerson = q === "on_you" || (c.workflow?.qa_sample && q !== "done");
    if (needsPerson)
      load.set(
        c.workflow?.assignee ?? "Unassigned",
        (load.get(c.workflow?.assignee ?? "Unassigned") ?? 0) + 1,
      );
    if (q === "on_you")
      for (const ch of decide(c.claim, policy).checklist)
        if (ch.stage === "R1" && ch.status === "fail")
          reasons.set(ch.key, (reasons.get(ch.key) ?? 0) + 1);
  }

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now - (13 - i) * 864e5);
    return {
      key: dayKey(d.toISOString()),
      label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      count: 0,
    };
  });
  const byDay = new Map(days.map((d) => [d.key, d]));
  for (const c of cases)
    if (c.claim.received_at) {
      const d = byDay.get(dayKey(c.claim.received_at));
      if (d) d.count++;
    }

  // Counts shared with the Business case and Investor view (one definition, same numbers)
  const mix = caseMix(cases, policy);
  Object.assign(recs, mix.counts);
  second = mix.second;
  const openN = open.length || 1;
  return {
    total: cases.length,
    open: open.length,
    closed: cases.length - open.length,
    queue,
    recs,
    automation: (recs.routine_processing + recs.request_information) / openN,
    reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]),
    load: [...load.entries()].sort((a, b) => b[1] - a[1]),
    versions: [...versions.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    second,
    inflow: days,
    recheck: open.filter((c) => c.decision?.needs_recheck),
  };
}
