import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { BATCH_POLICY_V1, BATCH_POLICY_V2 } from "@/lib/batch";
import {
  breakEvenProbability,
  DEFAULT_ASSUMPTIONS,
  defaultInputs,
  eur0,
  eurCompact,
  hourlyCost,
  pct,
  policyChangeCost,
  triageEconomics,
  unnecessaryReviewCost,
  wrongRoutineCost,
  type AssumptionKey,
  type Inputs,
} from "@/lib/business";
import { labelledReport, VOLUME_CLAIMS } from "@/lib/quality";
import { caseMix, claimListMix, useClaimMix } from "@/lib/claim-mix";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/triage/ui";
import { KindBadge, SERIES } from "@/components/triage/charts";
import { cn } from "@/lib/utils";

// Business case (case brief D4): the transparent model behind Value & ROI.
// 1. triage cost today vs with the system, net benefit, payback (as a calculation, not KPIs)
// 2. cost of errors under V1 and V2 and how the cost gap sets the escalation threshold
// 3. cost of one policy change today vs with the system, V2 as the example
// Every number recalculates from the assumptions at the bottom (src/lib/business.ts).

export const Route = createFileRoute("/_authenticated/business-case")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Business case — Clearpath" },
      {
        property: "og:description",
        content: "Triage cost, cost of errors and cost of a policy change for a motor insurer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Business case — Clearpath" },
      {
        name: "description",
        content: "Triage cost, cost of errors and cost of a policy change for a motor insurer.",
      },
    ],
  }),
  component: BusinessCase,
});

const P1 = BATCH_POLICY_V1;
const P2 = BATCH_POLICY_V2;
const V1 = P1.version.toUpperCase();
const V2 = P2.version.toUpperCase();

/** Wrong-routine rate budgeted for bad input data, on top of what the labelled tests measure. */
const RESIDUAL_DEFAULT = 0.005;

// Short labels for the assumptions list (the long notes live in src/lib/business.ts).
const SHORT: Record<AssumptionKey, string> = {
  claimsPerYear: "Small own-damage claims a year",
  salary: "Handler salary",
  loadFactor: "Employer load",
  productiveHours: "Productive hours a year",
  triageMinToday: "Manual triage today",
  reviewMin: "Person review",
  infoMin: "Information request",
  checkMin: "Second check",
  avgClaim: "Average claim",
  overpayShare: "Loss when it wrongly goes routine",
  platformPerYear: "Licence and running",
  implementation: "Integration, one-off",
  changeWeeksToday: "Rule change lead time today",
  changePersonDays: "Rule change effort today",
  dayRate: "Internal day rate",
  changeHoursWithSystem: "Rule change effort with Clearpath",
};

const eur2 = (n: number) => `€${n.toFixed(2)}`;
const num = (n: number) => Math.round(n).toLocaleString("en-US");

function BusinessCase() {
  const [inputs, setInputs] = useState<Inputs>(defaultInputs);
  const [residual, setResidual] = useState(RESIDUAL_DEFAULT);
  const [risk, setRisk] = useState(5); // % chance a claim needs a person (threshold explorer)

  const { mix, cases, hasLive } = useClaimMix();
  const quality = useMemo(() => labelledReport(), []);

  // The V2 change measured on the same claims; falls back to the 500 demo claims if the live set has none.
  const v2Mix = useMemo(() => {
    const live = hasLive ? caseMix(cases, P2, P1, P2) : null;
    return live && live.staleWrongRoutine > 0 ? live : claimListMix(VOLUME_CLAIMS, P2, P1);
  }, [cases, hasLive]);

  const e = triageEconomics(inputs, mix, mix.secondShare);
  const change = policyChangeCost(inputs, v2Mix);
  const h = hourlyCost(inputs);
  const n = inputs.claimsPerYear;
  const wrongCost = wrongRoutineCost(inputs);
  const escCost = unnecessaryReviewCost(inputs);
  const threshold = breakEvenProbability(inputs);
  const ratio = wrongCost / Math.max(escCost, 0.01);

  // Wrong routine decisions per year
  const residualCost = residual * n * wrongCost;
  const staleRate = change.staleShare;
  const staleCost = staleRate * n * wrongCost;

  const set = (k: AssumptionKey, v: number) => setInputs((s) => ({ ...s, [k]: v }));
  const changed =
    residual !== RESIDUAL_DEFAULT || DEFAULT_ASSUMPTIONS.some((a) => inputs[a.key] !== a.value);

  const limit1 = P1.human_review.quote_limit_eur;
  const limit2 = P2.human_review.quote_limit_eur;
  const newTypes = P2.human_review.review_repair_types.filter(
    (t) => !P1.human_review.review_repair_types.includes(t),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Ops lead"
        title="Business case"
        sub={`Mid-sized European motor insurer · ${num(n)} small own-damage claims a year · reviewer ${eur2(h)}/h`}
      />

      {/* 1 · Triage cost */}
      <Card>
        <SectionTitle n={1} title="Triage cost per year" />
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <Ledger
            title="Today"
            sub="Every claim read by a person"
            tone="grey"
            rows={[
              { label: "Claims a year", value: num(n) },
              { label: "Manual triage", value: `× ${inputs.triageMinToday} min` },
              { label: "Handler hours", value: `= ${num(e.todayHours)} h` },
              { label: "Reviewer cost", value: `× ${eur2(h)}/h` },
            ]}
            total={e.todayCost}
          />
          <Ledger
            title="With Clearpath"
            sub="People only see what needs them"
            tone="primary"
            rows={[
              {
                label: `Person review · ${pct(mix.share.human_review)} × ${inputs.reviewMin} min`,
                value: eur0(e.breakdown.review * h),
              },
              {
                label: `Information request · ${pct(mix.share.request_information)} × ${inputs.infoMin} min`,
                value: eur0(e.breakdown.info * h),
              },
              {
                label: `Second check · ${pct(mix.secondShare, 1)} × ${inputs.checkMin} min`,
                value: eur0(e.breakdown.checks * h),
              },
              { label: "Licence and running", value: eur0(inputs.platformPerYear) },
            ]}
            total={e.withCost}
          />
        </div>
        <ResultBand
          good={e.netPerYear > 0}
          items={[
            {
              label: "Net benefit",
              value: `${eurCompact(e.netPerYear)} / year`,
              how: `${eurCompact(e.todayCost)} − ${eurCompact(e.withCost)}`,
            },
            {
              label: "Payback",
              value: e.paybackMonths === null ? "—" : `${e.paybackMonths.toFixed(1)} months`,
              how: `${eurCompact(inputs.implementation)} integration ÷ ${eurCompact(e.netPerYear)} × 12`,
            },
          ]}
        />
      </Card>

      {/* 2 · Cost of errors */}
      <Card className="mt-6">
        <SectionTitle n={2} title={`Cost of errors · ${V1} and ${V2}`} />
        <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_1.15fr]">
          {/* Unit costs and the threshold they set */}
          <div className="min-w-0">
            <p className="text-[14px] text-text-2">Cost of one wrong decision</p>
            <UnitBar
              label="Wrongly sent to routine"
              how={`${eur0(inputs.avgClaim)} claim × ${pct(inputs.overpayShare)} loss`}
              value={wrongCost}
              max={wrongCost}
              color="var(--action)"
            />
            <UnitBar
              label="Escalated without need"
              how={`${inputs.reviewMin} min × ${eur2(h)}/h`}
              value={escCost}
              max={wrongCost}
              color="var(--wait)"
            />
            <p className="mt-4 text-[15px]">
              A wrong routine costs <strong>{Math.round(ratio)}×</strong> more, so a claim goes to a
              person once the chance of a problem passes{" "}
              <strong className="num" style={{ color: "var(--action)" }}>
                {pct(threshold, 1)}
              </strong>
              .
            </p>

            <div className="mt-5 rounded-lg bg-surface-2 p-4 ring-1 ring-line">
              <div className="flex items-center gap-3">
                <span className="whitespace-nowrap text-[13px] text-text-2">Chance of a problem</span>
                <Slider
                  value={[risk]}
                  min={1}
                  max={15}
                  step={0.5}
                  onValueChange={([v]) => setRisk(v)}
                  aria-label="Chance this claim needs a person, in percent"
                  className="flex-1 py-2"
                />
                <span className="num w-12 text-right text-[14px] font-semibold">{risk}%</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
                <Choice
                  label="Send to routine"
                  value={(risk / 100) * wrongCost}
                  best={(risk / 100) * wrongCost < escCost}
                />
                <Choice
                  label="Send to a person"
                  value={escCost}
                  best={(risk / 100) * wrongCost >= escCost}
                />
              </div>
              <p className="mt-3 text-[12.5px] text-text-2">
                Expected cost per claim. Why unknown, conflicting and over-limit facts always go to a
                person.
              </p>
            </div>
          </div>

          {/* Measured rates under V1 and V2 */}
          <div className="min-w-0">
            <p className="text-[14px] text-text-2">Wrong routine decisions per year</p>
            <table className="mt-3 w-full text-[14px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="label-mono py-2 font-normal">Rules running</th>
                  <th className="label-mono py-2 text-right font-normal">Rate</th>
                  <th className="label-mono py-2 text-right font-normal">Per year</th>
                </tr>
              </thead>
              <tbody>
                <ErrorRow
                  title={`${V1}, before the change`}
                  note={`Tests pass on ${quality.v1.n} labelled claims · budget for bad data`}
                  rate={residual}
                  cost={residualCost}
                />
                <ErrorRow
                  title={`${V1} still live after ${V2}`}
                  note={`${quality.keepV1.wrongRoutine} of ${quality.keepV1.n} labelled open claims · ${v2Mix.staleWrongRoutine} of ${v2Mix.open} open claims`}
                  rate={staleRate + residual}
                  cost={staleCost + residualCost}
                  tone="action"
                />
                <ErrorRow
                  title={`${V2} with Clearpath`}
                  note={`Tests pass on ${quality.v2.n} labelled open claims · same budget`}
                  rate={residual}
                  cost={residualCost}
                  tone="ok"
                />
              </tbody>
            </table>
            <div
              className="mt-5 rounded-lg px-4 py-3 text-[15px]"
              style={{ background: "var(--action-tint)", border: "1px solid var(--action-border)" }}
            >
              Every year the old rules stay live costs{" "}
              <strong className="num" style={{ color: "var(--action)" }}>
                {eurCompact(staleCost)}
              </strong>{" "}
              in claims paid that a person should have seen.
            </div>
          </div>
        </div>
      </Card>

      {/* 3 · Policy change */}
      <Card className="mt-6">
        <SectionTitle n={3} title={`Cost of one policy change · ${V2} as the example`} />
        <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
          {limit1 !== limit2 && (
            <span className="rounded-full bg-surface-2 px-3 py-1 ring-1 ring-line">
              Quote limit {limit1 === null ? "none" : eur0(limit1)} →{" "}
              {limit2 === null ? "none" : eur0(limit2)}
            </span>
          )}
          {newTypes.map((t) => (
            <span key={t} className="rounded-full bg-surface-2 px-3 py-1 ring-1 ring-line">
              {t === "ev_high_voltage_battery" ? "EV battery repairs" : t.replaceAll("_", " ")} →
              person
            </span>
          ))}
          <span
            className="rounded-full px-3 py-1"
            style={{ background: "var(--action-tint)", color: "var(--action)" }}
          >
            {pct(change.staleShare, 1)} of open claims now need a person
          </span>
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <Ledger
            title={`Today · ${inputs.changeWeeksToday} weeks`}
            sub="Spec, IT ticket, test, release, re-review"
            tone="grey"
            rows={[
              {
                label: `Effort · ${inputs.changePersonDays} days × ${eur0(inputs.dayRate)}`,
                value: eur0(change.today.process),
              },
              {
                label: `Old rules live · ${inputs.changeWeeksToday} weeks × ${eur0(change.perWeekExposure)}`,
                value: eur0(change.today.exposure),
              },
            ]}
            total={change.today.total}
          />
          <Ledger
            title="With Clearpath · same day"
            sub="Draft, replay on every claim, approve"
            tone="primary"
            rows={[
              {
                label: `Effort · ${inputs.changeHoursWithSystem} h × ${eur2(h)}`,
                value: eur0(change.withSystem.process),
              },
              {
                label: `Old rules live · 1 day × ${eur0(change.perWeekExposure / 5)}`,
                value: eur0(change.withSystem.exposure),
              },
            ]}
            total={change.withSystem.total}
          />
        </div>
        <ResultBand
          good
          items={[
            {
              label: "Saved per change",
              value: eurCompact(change.today.total - change.withSystem.total),
              how: `${eurCompact(change.today.total)} − ${eurCompact(change.withSystem.total)}`,
            },
            {
              label: "Old rules live",
              value: `${inputs.changeWeeksToday} weeks → 1 day`,
              how: "Open claims rechecked, closed claims keep their decision",
            },
          ]}
        />
      </Card>

      {/* Assumptions */}
      <Card className="mt-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[18px] font-semibold">Assumptions</h2>
          <Button
            variant="outline"
            size="sm"
            className="bg-surface"
            disabled={!changed}
            onClick={() => {
              setInputs(defaultInputs());
              setResidual(RESIDUAL_DEFAULT);
            }}
          >
            <RotateCcw className="size-3.5" strokeWidth={1.8} /> Reset
          </Button>
        </div>
        <ul className="mt-3 grid gap-x-10 lg:grid-cols-2">
          {DEFAULT_ASSUMPTIONS.map((a) => (
            <AssumptionRow
              key={a.key}
              label={SHORT[a.key]}
              kind={a.kind}
              unit={a.unit}
              value={inputs[a.key]}
              min={a.min}
              max={a.max}
              step={a.step}
              onChange={(v) => set(a.key, v)}
            />
          ))}
          <AssumptionRow
            label="Data-quality error budget"
            kind="assumption"
            unit="share"
            value={residual}
            min={0.001}
            max={0.05}
            step={0.001}
            decimals={1}
            onChange={setResidual}
          />
        </ul>
      </Card>
    </div>
  );
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-3 text-[18px] font-semibold">
      <span
        className="num inline-flex size-7 items-center justify-center rounded-full text-[13px] text-white"
        style={{ background: SERIES.primary }}
      >
        {n}
      </span>
      {title}
    </h2>
  );
}

function Ledger({
  title,
  sub,
  rows,
  total,
  tone,
}: {
  title: string;
  sub: string;
  rows: { label: string; value: string }[];
  total: number;
  tone: "grey" | "primary";
}) {
  const accent = tone === "grey" ? SERIES.grey : SERIES.primary;
  return (
    <div
      className="min-w-0 rounded-lg bg-surface ring-1 ring-line"
      style={{ borderTop: `4px solid ${accent}` }}
    >
      <div className="px-5 pt-4">
        <p className="text-[16px] font-semibold">{title}</p>
        <p className="text-[13px] text-text-2">{sub}</p>
      </div>
      <dl className="mt-3 px-5">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-4 border-b border-line py-2 text-[14px]"
          >
            <dt className="text-text-2">{r.label}</dt>
            <dd className="num whitespace-nowrap">{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-baseline justify-between px-5 py-3">
        <span className="text-[14px] font-medium">Total</span>
        <span className="num text-[24px] font-semibold">{eur0(total)}</span>
      </div>
    </div>
  );
}

function ResultBand({
  items,
  good,
}: {
  items: { label: string; value: string; how: string }[];
  good: boolean;
}) {
  const c = good ? "var(--ok)" : "var(--action)";
  return (
    <div
      className="mt-5 grid gap-4 rounded-lg px-5 py-4 sm:grid-cols-2"
      style={{
        background: `color-mix(in oklab, ${c} 9%, var(--surface))`,
        border: `1px solid color-mix(in oklab, ${c} 30%, var(--surface))`,
      }}
    >
      {items.map((it) => (
        <div key={it.label}>
          <p className="text-[13px] text-text-2">{it.label}</p>
          <p className="num text-[24px] font-semibold" style={{ color: c }}>
            {it.value}
          </p>
          <p className="num text-[12.5px] text-text-2">{it.how}</p>
        </div>
      ))}
    </div>
  );
}

function UnitBar({
  label,
  how,
  value,
  max,
  color,
}: {
  label: string;
  how: string;
  value: number;
  max: number;
  color: string;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[14px]">
          {label} <span className="text-[12.5px] text-text-2">· {how}</span>
        </span>
        <span className="num text-[20px] font-semibold" style={{ color }}>
          {eur0(value)}
        </span>
      </div>
      <div className="h-3 rounded-full bg-surface-2">
        <div
          className="h-3 rounded-full"
          style={{ width: `${Math.max(1.5, (value / Math.max(max, 1)) * 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

function Choice({ label, value, best }: { label: string; value: number; best: boolean }) {
  return (
    <div
      className={cn("rounded-md px-3 py-2", !best && "bg-surface ring-1 ring-line")}
      style={
        best
          ? {
              background: "color-mix(in oklab, var(--ok) 12%, var(--surface))",
              outline: "2px solid var(--ok)",
            }
          : undefined
      }
    >
      <p className="text-text-2">{label}</p>
      <p className="num text-[18px] font-semibold" style={best ? { color: "var(--ok)" } : undefined}>
        {eur2(value)}
      </p>
    </div>
  );
}

function ErrorRow({
  title,
  note,
  rate,
  cost,
  tone,
}: {
  title: string;
  note: string;
  rate: number;
  cost: number;
  tone?: "ok" | "action";
}) {
  const color = tone ? `var(--${tone})` : undefined;
  return (
    <tr className="border-b border-line align-top">
      <td className="py-3 pr-3">
        <p className="font-medium">{title}</p>
        <p className="text-[12.5px] text-text-2">{note}</p>
      </td>
      <td className="num py-3 text-right">{pct(rate, 1)}</td>
      <td className="num py-3 text-right text-[16px] font-semibold" style={{ color }}>
        {eurCompact(cost)}
      </td>
    </tr>
  );
}

function AssumptionRow({
  label,
  kind,
  unit,
  value,
  min,
  max,
  step,
  decimals = 0,
  onChange,
}: {
  label: string;
  kind: "sourced" | "measured" | "assumption";
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  onChange: (v: number) => void;
}) {
  const share = unit === "share" || unit === "of claim";
  const shown = share ? Number((value * 100).toFixed(decimals)) : value;
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-2 text-[14px]">
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        {label} <KindBadge kind={kind} />
      </span>
      <label className="flex shrink-0 items-center gap-1.5">
        <Input
          type="number"
          aria-label={label}
          value={shown}
          min={share ? min * 100 : min}
          max={share ? max * 100 : max}
          step={share ? (decimals ? 0.1 : 1) : step}
          onChange={(ev) => {
            const v = Number(ev.target.value);
            if (Number.isFinite(v)) onChange(share ? v / 100 : v);
          }}
          className="h-8 w-24 bg-surface text-right font-mono"
        />
        <span className="w-16 text-[12px] text-text-2">{share ? "%" : unit}</span>
      </label>
    </li>
  );
}
