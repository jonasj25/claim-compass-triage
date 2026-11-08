import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ExternalLink, RotateCcw } from "lucide-react";
import { BATCH_POLICY_V1, BATCH_POLICY_V2 } from "@/lib/batch";
import { isClosed } from "@/lib/csv";
import {
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
import { labelledReport, VOLUME_CLAIMS } from "@/lib/quality";
import { useClaimMix, type MixSource } from "@/lib/claim-mix";
import { secondCheckReason } from "@/lib/second-check";
import { decide, RECOMMENDATION_LABELS, type Claim } from "@/lib/triage";
import { Input } from "@/components/ui/input";
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
          "Cost of triage today vs with the system, cost of errors and the cost of a policy change.",
      },
    ],
  }),
  component: BusinessCase,
});

const P1 = BATCH_POLICY_V1;
const P2 = BATCH_POLICY_V2;
const srcById = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
const GROUPS = [...new Set(DEFAULT_ASSUMPTIONS.map((a) => a.group))];

function BusinessCase() {
  const [inputs, setInputs] = useState<Inputs>(defaultInputs);
  // Same claims and counts as Workload & flow and the Investor view (live claims, active policy)
  const [picked, setSource] = useState<MixSource>("live");
  const { mix, policy: active, source, hasLive, liveCount } = useClaimMix(picked);
  const second = mix.secondShare;
  const quality = useMemo(() => labelledReport(), []);
  const econ = triageEconomics(inputs, mix, second);
  const change = policyChangeCost(inputs, mix);
  const errV1 = errorCost(inputs, quality.v1);
  const errV2 = errorCost(inputs, quality.v2);
  const staleRate = mix.open ? mix.staleWrongRoutine / mix.open : 0;
  const staleCostYear = staleRate * inputs.claimsPerYear * wrongRoutineCost(inputs);

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
              ["live", `Live claims (${liveCount})`],
              ["demo", `Demo set (${VOLUME_CLAIMS.length} synthetic)`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              disabled={k === "live" && !hasLive}
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
          sub={`${mix.open} open claims under ${active.version.toUpperCase()} · same as Workload & flow`}
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
                    color: SERIES.primary,
                  },
                  {
                    label: "Info requests",
                    value: econ.breakdown.info * econ.hourly,
                    color: SERIES.mid,
                  },
                  {
                    label: "Second checks",
                    value: econ.breakdown.checks * econ.hourly,
                    color: SERIES.light,
                  },
                  { label: "Platform", value: inputs.platformPerYear, color: SERIES.grey },
                ],
              },
            ]}
          />
          <div className="mt-5">
            <p className="mb-2 text-[13px] text-text-2">
              Claim mix this is based on ({active.version.toUpperCase()}, open claims)
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
