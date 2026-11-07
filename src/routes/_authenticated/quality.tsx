import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Download } from "lucide-react";
import { casesQuery, outcomesQuery, overridesQuery } from "@/lib/data";
import { isClosed, toCsv } from "@/lib/csv";
import { BATCH_POLICY_V1, BATCH_POLICY_V2 } from "@/lib/batch";
import { LABELLED_SETS, labelledReport, rate, RECS, type Metrics } from "@/lib/quality";
import { RECOMMENDATION_LABELS, type Recommendation } from "@/lib/triage";
import { Button } from "@/components/ui/button";
import { Card, Kpi, PageHeader, StatusDot, fmtTime } from "@/components/triage/ui";
import { HBars, HeatGrid, REC_COLOR, SERIES, ShareRow } from "@/components/triage/charts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/quality")({
  head: () => ({
    meta: [
      { title: "Quality — Clearpath" },
      {
        name: "description",
        content:
          "Before/after quality report, mistakes, reviewer overrides, late outcomes and the monitoring plan.",
      },
    ],
  }),
  component: QualityPage,
});

const SET_KEYS = Object.keys(LABELLED_SETS);
const v1 = BATCH_POLICY_V1.version.toUpperCase();
const v2 = BATCH_POLICY_V2.version.toUpperCase();
const pctOf = (m: Metrics) => `${Math.round(rate(m.correct, m.n) * 100)}%`;

function QualityPage() {
  const [sets, setSets] = useState<string[]>(SET_KEYS);
  const r = useMemo(() => labelledReport(sets), [sets]);
  const { data: cases = [] } = useQuery(casesQuery);
  const { data: overrides = [] } = useQuery(overridesQuery);
  const { data: outcomes = [] } = useQuery(outcomesQuery);

  const decided = cases.filter((c) => c.decision).length;
  const open = cases.filter((c) => !isClosed(c.claim.case_status));
  const overrideRate = rate(new Set(overrides.map((o) => o.case_id)).size, decided);
  const byOriginal = RECS.map((k) => ({
    k,
    n: overrides.filter((o) => o.original_recommendation === k).length,
  }));
  const routineOutcomes = outcomes.filter((o) => o.correct_next_step);
  const lateWrongRoutine = outcomes.filter(
    (o) => o.final_outcome === "denied" && o.correct_next_step === "routine_processing",
  ).length;
  const blankShare = rate(
    open.filter((c) =>
      (
        [
          "policy_active_on_incident",
          "claim_type",
          "quote_eur",
          "incident_report_present",
          "itemized_quote_present",
          "injury_reported",
          "liability_disputed",
          "duplicate_flag",
          "evidence_conflict",
        ] as const
      ).some((f) => c.claim[f] === null),
    ).length,
    open.length,
  );
  const evShare = rate(
    open.filter((c) => c.claim.repair_type === "ev_high_voltage_battery").length,
    open.length,
  );
  const secondShare = rate(open.filter((c) => c.workflow?.qa_sample).length, open.length);

  const signals: {
    name: string;
    now: string;
    limit: string;
    ok: boolean;
    owner: string;
    action: string;
  }[] = [
    {
      name: "Override rate",
      now: `${(overrideRate * 100).toFixed(1)}%`,
      limit: "≤ 10%",
      ok: overrideRate <= 0.1,
      owner: "Ops lead",
      action: "Read the reasons; if one rule dominates, the policy owner drafts a change",
    },
    {
      name: "Wrong routine found later",
      now: String(lateWrongRoutine),
      limit: "0",
      ok: lateWrongRoutine === 0,
      owner: "Ops lead → policy owner",
      action: "Root-cause each case; add it as a labelled test before any fix",
    },
    {
      name: "Open claims with blank fields",
      now: `${Math.round(blankShare * 100)}%`,
      limit: "≤ 20%",
      ok: blankShare <= 0.2,
      owner: "Ops lead",
      action: "Upstream data problem: fix the intake form or import",
    },
    {
      name: "EV battery share (input mix)",
      now: `${Math.round(evShare * 100)}%`,
      limit: "≤ 15%",
      ok: evShare <= 0.15,
      owner: "Ops lead",
      action: "Mix shift raises review load; check staffing and thresholds",
    },
    {
      name: "Open claims in second check / QA",
      now: `${Math.round(secondShare * 100)}%`,
      limit: "≤ 12%",
      ok: secondShare <= 0.12,
      owner: "Ops lead",
      action: "Too many near the limit: revisit the €70 margin",
    },
  ];

  const exportAudit = () => {
    const ov = new Map<string, (typeof overrides)[number]>();
    for (const o of overrides) if (!ov.has(o.case_id)) ov.set(o.case_id, o);
    const rows = cases.map((c) => {
      const o = ov.get(c.claim.case_id);
      return {
        case_id: c.claim.case_id,
        case_status: c.claim.case_status ?? "",
        policy_version: c.decision?.policy_version ?? "",
        recommendation: c.decision?.recommendation ?? "",
        rule_id: c.decision?.rule_id ?? "",
        needs_recheck: c.decision?.needs_recheck ? "True" : "False",
        explanation: c.decision?.explanation ?? "",
        override_to: o?.new_recommendation ?? "",
        override_reason: o ? [o.reason_code, o.reason_text].filter(Boolean).join(": ") : "",
        override_by: o?.reviewer ?? "",
        override_policy_version: o?.policy_version ?? "",
        override_at: o?.created_at ?? "",
      };
    });
    const csv = toCsv(rows, Object.keys(rows[0] ?? { case_id: "" }));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Ops lead"
        title="Quality"
        sub={`Tested on ${r.total} labelled claims that ship with the repo. ${v2} is scored on open claims only; closed claims must keep their ${v1} decision.`}
        right={
          <Button
            variant="outline"
            className="bg-white"
            onClick={exportAudit}
            disabled={!cases.length}
          >
            <Download className="size-4" strokeWidth={1.7} /> Export audit log
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {[["Both sets", SET_KEYS] as const, ...SET_KEYS.map((k) => [k, [k]] as const)].map(
          ([label, keys]) => {
            const active = keys.length === sets.length && keys.every((k) => sets.includes(k));
            return (
              <button
                key={label}
                type="button"
                onClick={() => setSets([...keys])}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12.5px] ring-1",
                  active
                    ? "bg-white font-medium shadow-[var(--shadow-lift)] ring-link/40"
                    : "bg-white/50 ring-line hover:bg-white",
                )}
              >
                {label}
              </button>
            );
          },
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={`Correct under ${v2}`}
          value={pctOf(r.v2)}
          sub={`${r.v2.correct} of ${r.v2.n} open claims`}
        />
        <Kpi label="Wrong routine" value={r.v2.wrongRoutine} sub="the expensive error" />
        <Kpi
          label="Unnecessary reviews"
          value={r.v2.unnecessaryReview}
          sub="sent to a person without need"
        />
        <Kpi
          label="Closed claims kept"
          value={`${r.closed.kept}/${r.closed.n}`}
          sub={`still show their ${v1} decision`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <h2 className="section-title">Before and after the policy change</h2>
          <p className="mb-3 mt-1 text-[13px] text-text-2">
            Share of correct next steps. The middle row is what happens if nobody updates the rules.
          </p>
          <div className="divide-y divide-line">
            <ShareRow
              label={`${v1} rules, ${v1} labels`}
              note={`all ${r.v1.n} claims`}
              share={rate(r.v1.correct, r.v1.n)}
              display={pctOf(r.v1)}
              color={SERIES.mid}
            />
            <ShareRow
              label={`${v1} rules kept after the change`}
              note={`${r.keepV1.wrongRoutine} wrong routine of ${r.keepV1.n}`}
              share={rate(r.keepV1.correct, r.keepV1.n)}
              display={pctOf(r.keepV1)}
              color={REC_COLOR.human_review}
            />
            <ShareRow
              label={`${v2} rules, ${v2} labels`}
              note={`${r.v2.n} open claims`}
              share={rate(r.v2.correct, r.v2.n)}
              display={pctOf(r.v2)}
              color={SERIES.strong}
              emphasis
            />
          </div>
          <table className="mt-5 w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="label-mono py-2 font-normal">Group</th>
                <th className="label-mono py-2 text-right font-normal">Keep {v1}</th>
                <th className="label-mono py-2 text-right font-normal">Switch to {v2}</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["All open claims", r.keepV1, r.v2],
                  ["Only the claims whose label changed", r.changedKeepV1, r.changedV2],
                ] as const
              ).map(([label, a, b]) => (
                <tr key={label} className="border-b border-line last:border-0">
                  <td className="py-2.5">{label}</td>
                  <td className="num py-2.5 text-right text-text-2">
                    {a.correct}/{a.n} · {a.wrongRoutine} wrong routine
                  </td>
                  <td className="num py-2.5 text-right font-medium">
                    {b.correct}/{b.n} · {b.wrongRoutine} wrong routine
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2.5">Claims with blank fields</td>
                <td className="num py-2.5 text-right text-text-2">
                  {r.blankV1.correct}/{r.blankV1.n} under {v1}
                </td>
                <td className="num py-2.5 text-right font-medium">
                  {r.blankV2.correct}/{r.blankV2.n} under {v2}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[12px] text-text-3">
            Blank fields are never guessed: they lead to a request for information unless a known
            fact already requires a person.
          </p>
        </Card>

        <Card>
          <h2 className="section-title">Labelled vs recommended · {v2}</h2>
          <p className="mb-4 mt-1 text-[13px] text-text-2">
            Everything on the diagonal is correct. Off-diagonal counts in the Auto-processed column
            would be the costly errors.
          </p>
          <HeatGrid
            rowTitle="Label"
            colTitle="System"
            rows={RECS.map((k) => ({ key: k, label: RECOMMENDATION_LABELS[k] }))}
            cols={RECS.map((k) => ({ key: k, label: RECOMMENDATION_LABELS[k] }))}
            cell={(a, b) => r.confusionV2[a as Recommendation][b as Recommendation]}
          />
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="section-title">Where it goes wrong</h2>
        {r.mistakesV2.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-[13.5px]">
            <CircleCheck className="size-4 text-ok" strokeWidth={1.8} /> No mistakes under {v2} on{" "}
            {r.v2.n} labelled open claims.
          </p>
        ) : (
          <MistakeTable rows={r.mistakesV2} />
        )}
        <p className="mb-2 mt-5 text-[13px] text-text-2">
          If the rules had not been updated, these {r.mistakesKeepV1.length} claims would get the
          wrong next step. They are exactly the ones the change flags for a recheck:
        </p>
        <MistakeTable rows={r.mistakesKeepV1} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-0">
          <div className="flex items-baseline justify-between px-6 pt-5">
            <h2 className="section-title">Reviewer corrections</h2>
            <span className="text-[13px] text-text-2">
              {overrides.length} overrides · {(overrideRate * 100).toFixed(1)}% of decided claims
            </span>
          </div>
          <p className="px-6 pb-3 pt-1 text-[13px] text-text-2">
            Each override records who, what, why and under which policy version. Nothing is
            overwritten.
          </p>
          {overrides.length ? (
            <table className="w-full text-[13px]">
              <tbody>
                {overrides.slice(0, 8).map((o) => (
                  <tr key={o.id} className="border-t border-line align-top">
                    <td className="px-6 py-2.5 font-mono text-[12px]">
                      <Link
                        to="/claims/$caseId"
                        params={{ caseId: o.case_id }}
                        className="hover:underline"
                      >
                        {o.case_id}
                      </Link>
                    </td>
                    <td className="py-2.5 whitespace-nowrap">
                      {o.original_recommendation && (
                        <StatusDot rec={o.original_recommendation as Recommendation} plain />
                      )}{" "}
                      → <StatusDot rec={o.new_recommendation as Recommendation} plain />
                    </td>
                    <td className="px-3 py-2.5 text-text-2">
                      {[o.reason_code, o.reason_text].filter(Boolean).join(": ")}
                    </td>
                    <td className="px-6 py-2.5 text-right text-[12px] whitespace-nowrap text-text-2">
                      {o.reviewer} · {String(o.policy_version ?? "").toUpperCase()}
                      <br />
                      {fmtTime(o.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="border-t border-line px-6 py-5 text-[13px] text-text-2">
              No overrides yet. Override any claim on its case page; it appears here immediately.
            </p>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="section-title">Overrides by original recommendation</h2>
            <div className="mt-4">
              <HBars
                items={byOriginal
                  .filter((x) => x.n)
                  .map((x) => ({
                    key: x.k,
                    label: RECOMMENDATION_LABELS[x.k],
                    value: x.n,
                    color: REC_COLOR[x.k],
                  }))}
                empty="No overrides yet."
              />
            </div>
          </Card>
          <Card>
            <h2 className="section-title">Outcomes that arrive later</h2>
            <p className="mt-1 text-[13px] text-text-2">
              Final outcomes are stored next to the decision they belong to, never on top of it.
              Accuracy is counted only once the outcome is known.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
              <div className="rounded-[10px] bg-surface-2 p-3">
                <dt className="text-text-2">Outcomes recorded</dt>
                <dd className="num mt-1 text-[22px] font-semibold">{outcomes.length}</dd>
              </div>
              <div className="rounded-[10px] bg-surface-2 p-3">
                <dt className="text-text-2">Matched the first decision</dt>
                <dd className="num mt-1 text-[22px] font-semibold">
                  {routineOutcomes.length
                    ? `${Math.round(rate(routineOutcomes.length - lateWrongRoutine, routineOutcomes.length) * 100)}%`
                    : "—"}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      <Card className="mt-6 p-0">
        <div className="px-6 pt-5 pb-3">
          <h2 className="section-title">Monitoring plan, live</h2>
          <p className="mt-1 text-[13px] text-text-2">
            What triggers an investigation, who acts, and what happens next. Every policy change is
            replayed on all past claims on Change impact and approved by the policy owner before it
            goes live.
          </p>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-y border-line text-left">
              {["Signal", "Now", "Trigger", "Status", "Who acts", "Next step"].map((h) => (
                <th key={h} className="label-mono px-4 py-2.5 font-normal first:pl-6">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => (
              <tr key={s.name} className="border-b border-line align-top last:border-0">
                <td className="py-3 pl-6 pr-4 font-medium">{s.name}</td>
                <td className="num px-4 py-3">{s.now}</td>
                <td className="num px-4 py-3 text-text-2">{s.limit}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {s.ok ? (
                    <span className="inline-flex items-center gap-1.5 text-ok">
                      <CircleCheck className="size-3.5" strokeWidth={1.8} /> OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-action">
                      <CircleAlert className="size-3.5" strokeWidth={1.8} /> Investigate
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-2">{s.owner}</td>
                <td className="px-4 py-3 text-text-2">{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-6 py-4 text-[12.5px] text-text-3">
          Sampling: about 7% of auto-processed claims get a random QA check, plus every claim within
          €70 of the quote limit. Reviewer overrides and late outcomes become new labelled tests, so
          the next policy change is checked against them.
        </p>
      </Card>
    </div>
  );
}

function MistakeTable({
  rows,
}: {
  rows: {
    case_id: string;
    set: string;
    expected: Recommendation;
    got: Recommendation;
    rule: string;
    why: string;
  }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-left">
            {["Claim", "Correct", "System said", "Rule", "Why"].map((h) => (
              <th key={h} className="label-mono py-2 pr-4 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.case_id} className="border-b border-line align-top last:border-0">
              <td className="py-2.5 pr-4 font-mono text-[12px]">{m.case_id}</td>
              <td className="py-2.5 pr-4 whitespace-nowrap">
                <StatusDot rec={m.expected} plain />
              </td>
              <td className="py-2.5 pr-4 whitespace-nowrap">
                <StatusDot rec={m.got} plain />
              </td>
              <td className="py-2.5 pr-4 font-mono text-[11px] uppercase text-text-2">{m.rule}</td>
              <td className="py-2.5 text-text-2">{m.why}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
