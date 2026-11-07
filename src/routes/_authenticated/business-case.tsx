import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ExternalLink, RotateCcw } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { casesQuery } from "@/lib/data";
import { BATCH_POLICY_V1, BATCH_POLICY_V2 } from "@/lib/batch";
import { isClosed } from "@/lib/csv";
import {
  breakEvenProbability,
  DEFAULT_ASSUMPTIONS,
  defaultInputs,
  errorCost,
  eur0,
  eurCompact,
  pct,
  policyChangeCost,
  SOURCES,
  triageEconomics,
  unnecessaryReviewCost,
  wrongRoutineCost,
  type Assumption,
  type Inputs,
} from "@/lib/business";
import { labelledReport, volumeMix, VOLUME_CLAIMS } from "@/lib/quality";
import { secondCheckReason } from "@/lib/second-check";
import { decide, RECOMMENDATION_LABELS, type Claim, type Policy } from "@/lib/triage";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, Kpi, PageHeader } from "@/components/triage/ui";
import { KindBadge, REC_COLOR, SERIES, StackedShare } from "@/components/triage/charts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/business-case")({
  head: () => ({
    meta: [
{ property: "og:title", content: "Business case — Clearpath" },
{ property: "og:description", content: "Clearpath claims workspace: review evidence, policy decisions and case activity." },
{ property: "og:type", content: "website" },
{ name: "twitter:card", content: "summary" },
      { title: "Business case — Clearpath" },
      {
        name: "description",
        content:
          "Cost of triage today vs with the system, cost of errors, threshold logic and the cost of a policy change.",
      },
    ],
  }),
  component: BusinessCase,
});

const P1 = BATCH_POLICY_V1;
const P2 = BATCH_POLICY_V2;
const srcById = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
const GROUPS = [...new Set(DEFAULT_ASSUMPTIONS.map((a) => a.group))];

function secondShare(claims: Claim[], policy: Policy) {
  const open = claims.filter((c) => !isClosed(c.case_status));
  if (!open.length) return 0;
  return (
    open.filter((c) => secondCheckReason(c, policy, decide(c, policy).recommendation)).length /
    open.length
  );
}

function BusinessCase() {
  const [inputs, setInputs] = useState<Inputs>(defaultInputs);
  const [source, setSource] = useState<"synthetic" | "live">("synthetic");
  const [limit, setLimit] = useState<number>(P2.human_review.quote_limit_eur ?? 1200);
  const { data: cases = [] } = useQuery(casesQuery);
  const liveClaims = useMemo(() => cases.map((c) => c.claim), [cases]);
  const claims = source === "live" && liveClaims.length ? liveClaims : VOLUME_CLAIMS;

  const mix = useMemo(() => volumeMix(P2, P1, claims), [claims]);
  const second = useMemo(() => secondShare(claims, P2), [claims]);
  const quality = useMemo(() => labelledReport(), []);
  const econ = triageEconomics(inputs, mix, second);
  const change = policyChangeCost(inputs, mix);
  const errV1 = errorCost(inputs, quality.v1);
  const errV2 = errorCost(inputs, quality.v2);
  const staleRate = mix.open ? mix.staleWrongRoutine / mix.open : 0;
  const staleCostYear = staleRate * inputs.claimsPerYear * wrongRoutineCost(inputs);
  const be = breakEvenProbability(inputs);

  const explore = useMemo(() => {
    const pol: Policy = { ...P2, human_review: { ...P2.human_review, quote_limit_eur: limit } };
    const m = volumeMix(pol, P2, claims);
    return { mix: m, econ: triageEconomics(inputs, m, secondShare(claims, pol)) };
  }, [limit, claims, inputs]);

  const curve = useMemo(() => {
    const W = wrongRoutineCost(inputs);
    const U = unnecessaryReviewCost(inputs);
    return Array.from({ length: 21 }, (_, k) => {
      const p = (k / 20) * Math.max(0.04, be * 3);
      return { p, auto: p * W, escalate: (1 - p) * U };
    });
  }, [inputs, be]);

  const set = (k: keyof Inputs, v: number) => setInputs((s) => ({ ...s, [k]: v }));
  const changed = DEFAULT_ASSUMPTIONS.some((a) => inputs[a.key] !== a.value);

  return (
    <div>
      <PageHeader
        eyebrow="Ops lead"
        title="Business case"
        sub="A mid-sized European motor insurer. Every number below recalculates from the assumptions at the bottom; each one is marked as sourced, measured or assumed."
      />

      <div className="card-quiet mb-6 flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-[13.5px]">
        <p>
          <span className="font-medium">Why now:</span>{" "}
          <span className="text-text-2">
            German motor insurers lost about €2.9 bn in 2023; every premium euro cost €1.10 in
            claims and expenses.
          </span>
          <a
            href={srcById["gdv-loss"].url}
            target="_blank"
            rel="noreferrer"
            className="ml-1.5 inline-flex items-center gap-0.5 text-link hover:underline"
          >
            GDV <ExternalLink className="size-3" />
          </a>
        </p>
        <div className="flex items-center gap-1 rounded-full bg-surface-2 p-0.5 text-[12px] ring-1 ring-line">
          {(
            [
              ["synthetic", `${VOLUME_CLAIMS.length} synthetic claims`],
              ["live", `Live claims (${liveClaims.length})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              disabled={k === "live" && !liveClaims.length}
              onClick={() => setSource(k)}
              className={cn(
                "rounded-full px-3 py-1",
                source === k ? "bg-surface font-medium shadow-[var(--shadow-lift)]" : "text-text-2",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="kpi-strip grid grid-cols-4 gap-0">
        <Kpi
          label="Net benefit per year"
          value={eurCompact(econ.netPerYear)}
          sub={`${eur0(econ.todayCost)} today → ${eur0(econ.withCost)}`}
        />
        <Kpi
          label="Payback"
          value={econ.paybackMonths === null ? "—" : `${econ.paybackMonths.toFixed(1)} mo`}
          sub={`on ${eur0(inputs.implementation)} implementation`}
        />
        <Kpi
          label="Reviewer capacity freed"
          value={`${(econ.fteToday - econ.fteWith).toFixed(1)} FTE`}
          sub={`${econ.fteToday.toFixed(1)} → ${econ.fteWith.toFixed(1)} people on triage`}
        />
        <Kpi
          label="Handled without a reviewer"
          value={pct(econ.automation)}
          sub={`measured on ${mix.open} open claims under ${P2.version.toUpperCase()}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <h2 className="section-title">Annual cost of triage</h2>
          <p className="mt-1 text-[13px] text-text-2">
            Today every claim is triaged by hand. With the system people only see escalations,
            information requests and checks. Reviewer cost {eur0(econ.hourly)}/h fully loaded.
          </p>
          <CostBars
            max={Math.max(econ.todayCost, econ.withCost)}
            rows={[
              {
                label: "Today",
                parts: [{ label: "Manual triage", value: econ.todayCost, color: SERIES.soft }],
              },
              {
                label: "With the system",
                parts: [
                  {
                    label: "Reviews",
                    value: econ.breakdown.review * econ.hourly,
                    color: REC_COLOR.human_review,
                  },
                  {
                    label: "Info requests",
                    value: econ.breakdown.info * econ.hourly,
                    color: REC_COLOR.request_information,
                  },
                  {
                    label: "QA & second checks",
                    value: econ.breakdown.checks * econ.hourly,
                    color: REC_COLOR.routine_processing,
                  },
                  { label: "Platform", value: inputs.platformPerYear, color: SERIES.strong },
                ],
              },
            ]}
          />
          <div className="mt-5">
            <p className="mb-2 text-[13px] text-text-2">
              Claim mix this is based on ({P2.version.toUpperCase()}, open claims)
            </p>
            <StackedShare
              segments={(
                ["routine_processing", "request_information", "human_review"] as const
              ).map((r) => ({
                key: r,
                label: RECOMMENDATION_LABELS[r],
                value: mix.counts[r],
                color: REC_COLOR[r],
              }))}
            />
          </div>
        </Card>

        <Card>
          <h2 className="section-title">Cost of errors</h2>
          <p className="mt-1 text-[13px] text-text-2">
            A wrong routine decision costs about{" "}
            <strong className="text-foreground">{eur0(wrongRoutineCost(inputs))}</strong>, an
            unnecessary escalation about{" "}
            <strong className="text-foreground">{eur0(unnecessaryReviewCost(inputs))}</strong>:
            roughly{" "}
            {Math.round(wrongRoutineCost(inputs) / Math.max(1, unnecessaryReviewCost(inputs)))}×
            more.
          </p>
          <table className="mt-4 w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="label-mono py-2 font-normal">Rules in use</th>
                <th className="label-mono py-2 text-right font-normal">Wrong routine</th>
                <th className="label-mono py-2 text-right font-normal">Per year</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <td className="py-2.5">
                  {P1.version.toUpperCase()} before the change <KindBadge kind="measured" />
                </td>
                <td className="num py-2.5 text-right">{pct(errV1.wrongRate, 1)}</td>
                <td className="num py-2.5 text-right">{eur0(errV1.total)}</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2.5">
                  {P2.version.toUpperCase()} after the change <KindBadge kind="measured" />
                </td>
                <td className="num py-2.5 text-right">{pct(errV2.wrongRate, 1)}</td>
                <td className="num py-2.5 text-right">{eur0(errV2.total)}</td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium">
                  {P1.version.toUpperCase()} still running after the change
                </td>
                <td className="num py-2.5 text-right font-medium text-action">
                  {pct(staleRate, 1)}
                </td>
                <td className="num py-2.5 text-right font-semibold text-action">
                  {eur0(staleCostYear)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[12px] text-text-3">
            Rows 1–2: error rates measured on the {quality.total} labelled test claims. Row 3: share
            of open claims that {P2.version.toUpperCase()} sends to a person but{" "}
            {P1.version.toUpperCase()} would still auto-process. Residual production errors come
            from data quality, which the monitoring plan watches.
          </p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="section-title">Where to set the threshold</h2>
          <p className="mt-1 text-[13px] text-text-2">
            Expected cost of one claim if we auto-process it vs send it to a person, by the chance
            that it really needs a person. Escalate above{" "}
            <strong className="text-foreground">{pct(be, 1)}</strong>.
          </p>
          <div className="mt-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curve} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis
                  dataKey="p"
                  type="number"
                  domain={[0, "dataMax"]}
                  tickFormatter={(v) => pct(v)}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--text-2)" }}
                />
                <YAxis
                  tickFormatter={(v) => `€${v}`}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--text-2)" }}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }}
                  labelFormatter={(v) => `Chance it needs a person: ${pct(Number(v), 1)}`}
                  formatter={(v: number, name: string) => [
                    eur0(v),
                    name === "auto" ? "Auto-process" : "Send to a person",
                  ]}
                />
                <ReferenceLine
                  x={be}
                  stroke="var(--text-3)"
                  strokeDasharray="0"
                  label={{
                    value: `break-even ${pct(be, 1)}`,
                    position: "insideTopRight",
                    fontSize: 11,
                    fill: "var(--text-2)",
                  }}
                />
                <Line
                  type="linear"
                  dataKey="auto"
                  stroke={REC_COLOR.routine_processing}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="linear"
                  dataKey="escalate"
                  stroke={REC_COLOR.human_review}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex gap-5 text-[12.5px]">
            <li className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-4 rounded"
                style={{ background: REC_COLOR.routine_processing }}
              />{" "}
              Auto-process
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: REC_COLOR.human_review }} />{" "}
              Send to a person
            </li>
          </ul>
          <p className="mt-3 text-[12.5px] text-text-2">
            Because a wrong routine is so much more expensive, the system escalates on any known red
            flag, asks instead of guessing when a fact is blank, and adds a second check within €70
            of the limit.
          </p>
        </Card>

        <Card>
          <h2 className="section-title">Quote limit explorer</h2>
          <p className="mt-1 text-[13px] text-text-2">
            What a different routine limit would mean for workload, on the same claims (the policy
            itself sets {eur0(P2.human_review.quote_limit_eur ?? 0)}).
          </p>
          <div className="mt-6 flex items-center gap-4">
            <Slider
              value={[limit]}
              min={600}
              max={2000}
              step={50}
              onValueChange={([v]) => setLimit(v)}
              aria-label="Quote limit"
              className="flex-1"
            />
            <span className="num w-20 text-right text-[18px] font-semibold">{eur0(limit)}</span>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-3 text-[13px]">
            {[
              [
                "Auto-processed",
                pct(explore.mix.share.routine_processing),
                `${pct(mix.share.routine_processing)} at ${eur0(P2.human_review.quote_limit_eur ?? 0)}`,
              ],
              [
                "Sent to a person",
                pct(explore.mix.share.human_review),
                `${pct(mix.share.human_review)} at ${eur0(P2.human_review.quote_limit_eur ?? 0)}`,
              ],
              [
                "People on triage",
                `${explore.econ.fteWith.toFixed(1)} FTE`,
                `${econ.fteWith.toFixed(1)} FTE at the policy limit`,
              ],
              [
                "Net benefit / year",
                eurCompact(explore.econ.netPerYear),
                `${eurCompact(econ.netPerYear)} at the policy limit`,
              ],
            ].map(([k, v, sub]) => (
              <div key={k} className="rounded-[10px] bg-surface-2 p-3">
                <dt className="text-text-2">{k}</dt>
                <dd className="num mt-1 text-[22px] font-semibold">{v}</dd>
                <dd className="mt-0.5 text-[12px] text-text-3">{sub}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[12px] text-text-3">
            A higher limit saves reviewer time but lets more large claims through unchecked; the
            break-even chart says how much risk each saved review may carry.
          </p>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="section-title">
          Cost of one policy change · the {P2.version.toUpperCase()} change as the example
        </h2>
        <p className="mt-1 text-[13px] text-text-2">
          {P2.version.toUpperCase()} sends {pct(change.staleShare, 1)} of open claims to a person
          that {P1.version.toUpperCase()} would auto-process. Every week the old rules keep running
          costs about <strong className="text-foreground">{eur0(change.perWeekExposure)}</strong> in
          wrong routine decisions.
        </p>
        <CostBars
          max={Math.max(change.today.total, change.withSystem.total)}
          rows={[
            {
              label: `Today · ${inputs.changeWeeksToday} weeks`,
              parts: [
                {
                  label: "Spec, IT, test, re-review",
                  value: change.today.process,
                  color: SERIES.strong,
                },
                {
                  label: "Old rules still live",
                  value: change.today.exposure,
                  color: REC_COLOR.human_review,
                },
              ],
            },
            {
              label: "With the system · same day",
              parts: [
                {
                  label: "Draft, replay, approve",
                  value: change.withSystem.process,
                  color: SERIES.strong,
                },
                {
                  label: "Old rules still live",
                  value: change.withSystem.exposure,
                  color: REC_COLOR.human_review,
                },
              ],
            },
          ]}
        />
        <p className="mt-3 text-[12.5px] text-text-2">
          Saving per change:{" "}
          <strong className="text-foreground">
            {eur0(change.today.total - change.withSystem.total)}
          </strong>
          . Open claims affected by the change are flagged for recheck automatically; closed claims
          are never rewritten.
        </p>
      </Card>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Assumptions</h2>
            <p className="mt-1 text-[13px] text-text-2">
              Change any value; every number on this page updates.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-surface"
            disabled={!changed}
            onClick={() => setInputs(defaultInputs())}
          >
            <RotateCcw className="size-3.5" strokeWidth={1.8} /> Reset
          </Button>
        </div>
        <div className="mt-5 grid gap-x-8 gap-y-6 lg:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g}>
              <h3 className="mb-2 text-[13px] font-medium">{g}</h3>
              <ul className="divide-y divide-line">
                {DEFAULT_ASSUMPTIONS.filter((a) => a.group === g).map((a) => (
                  <AssumptionRow
                    key={a.key}
                    a={a}
                    value={inputs[a.key]}
                    onChange={(v) => set(a.key, v)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="section-title">Sources</h2>
        <ol className="mt-3 space-y-2 text-[13px]">
          {SOURCES.map((s) => (
            <li key={s.id}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-link hover:underline"
              >
                {s.title} <ExternalLink className="size-3" />
              </a>
              <p className="text-text-2">{s.note}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function AssumptionRow({
  a,
  value,
  onChange,
}: {
  a: Assumption;
  value: number;
  onChange: (v: number) => void;
}) {
  const src = a.source ? srcById[a.source] : null;
  const shown = a.unit === "share" ? Math.round(value * 100) : value;
  return (
    <li className="grid grid-cols-[1fr_auto] items-start gap-3 py-2.5 text-[13px]">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          {a.label} <KindBadge kind={a.kind} />
          {src && (
            <a
              href={src.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-[12px] text-link hover:underline"
              title={src.title}
            >
              source <ExternalLink className="size-3" />
            </a>
          )}
        </p>
        <p className="mt-0.5 text-[12px] text-text-3">{a.note}</p>
      </div>
      <label className="flex items-center gap-1.5">
        <Input
          type="number"
          aria-label={a.label}
          value={shown}
          min={a.unit === "share" ? a.min * 100 : a.min}
          max={a.unit === "share" ? a.max * 100 : a.max}
          step={a.unit === "share" ? 1 : a.step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(a.unit === "share" ? n / 100 : n);
          }}
          className="h-8 w-28 bg-surface text-right font-mono"
        />
        <span className="w-20 text-[12px] text-text-2">
          {a.unit === "share" ? "%" : a.unit === "of claim" ? "× claim" : a.unit}
        </span>
      </label>
    </li>
  );
}

function CostBars({
  rows,
  max,
}: {
  rows: { label: string; parts: { label: string; value: number; color: string }[] }[];
  max: number;
}) {
  const legend = [...new Map(rows.flatMap((r) => r.parts).map((p) => [p.label, p])).values()];
  return (
    <div className="mt-5">
      <div className="space-y-4">
        {rows.map((r) => {
          const total = r.parts.reduce((s, p) => s + p.value, 0);
          return (
            <div key={r.label}>
              <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                <span className="text-text-2">{r.label}</span>
                <span className="num font-semibold">{eur0(total)}</span>
              </div>
              <div
                className="flex h-[18px] gap-[2px]"
                style={{ width: `${max ? (total / max) * 100 : 0}%` }}
              >
                {r.parts
                  .filter((p) => p.value > 0)
                  .map((p, i, arr) => (
                    <span
                      key={p.label}
                      title={`${p.label}: ${eur0(p.value)}`}
                      className={cn(i === arr.length - 1 && "rounded-r-[4px]")}
                      style={{
                        width: `${(p.value / total) * 100}%`,
                        background: p.color,
                        minWidth: 2,
                      }}
                    />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-2">
        {legend.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: p.color }} /> {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
