import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { useClaimMix } from "@/lib/claim-mix";
import {
  breakEvenProbability,
  defaultInputs,
  errorCost,
  eur0,
  eurCompact,
  pct,
  policyChangeCost,
  triageEconomics,
  unnecessaryReviewCost,
  wrongRoutineCost,
  type Inputs,
} from "@/lib/business";
import { labelledReport } from "@/lib/quality";
import { Slider } from "@/components/ui/slider";
import { Card, Kpi, PageHeader } from "@/components/triage/ui";
import { SERIES } from "@/components/triage/charts";
import { cn } from "@/lib/utils";

// Value & ROI: interactive numbers. Same model as the Business case page (src/lib/business.ts) on the
// shared claim mix (useClaimMix). Insurer size, manual triage time and challenged assumptions re-run the
// model live; nothing is saved.

export const Route = createFileRoute("/_authenticated/pitch")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Value & ROI — Clearpath" },
      { property: "og:description", content: "Triage cost, savings, payback and stress test for a motor insurer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Value & ROI — Clearpath" },
      { name: "description", content: "Triage cost, savings, payback and stress test for a motor insurer." },
    ],
  }),
  component: ValueRoi,
});

const SIZES = [50000, 100000, 250000];

const CHALLENGES: { key: string; label: string; o: Partial<Inputs> }[] = [
  { key: "review", label: "Reviews 20 min", o: { reviewMin: 20 } },
  { key: "info", label: "Manual info requests", o: { infoMin: 8 } },
  { key: "licence", label: "Licence +50%", o: { platformPerYear: 180000 } },
  { key: "integration", label: "Integration ×2", o: { implementation: 300000 } },
];

function Seg<T extends string | number>({
  options,
  value,
  onChange,
  fmt,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  fmt: (v: T) => string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-surface-2 p-0.5 text-[13px] ring-1 ring-line">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "rounded-full px-3 py-1",
            o === value ? "bg-surface font-medium shadow-[var(--shadow-lift)]" : "text-text-2",
          )}
        >
          {fmt(o)}
        </button>
      ))}
    </div>
  );
}

function ValueRoi() {
  const { mix } = useClaimMix();
  const second = mix.secondShare;
  const quality = useMemo(() => labelledReport(), []);
  const base = useMemo(() => defaultInputs(), []);

  const [size, setSize] = useState(base.claimsPerYear);
  const [triageMin, setTriageMin] = useState(base.triageMinToday);
  const [on, setOn] = useState<string[]>([]);
  const toggle = (k: string) => setOn((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]));

  const inputs = useMemo(() => {
    const o = Object.assign({}, ...CHALLENGES.filter((c) => on.includes(c.key)).map((c) => c.o));
    return { ...base, ...o, claimsPerYear: size, triageMinToday: triageMin } as Inputs;
  }, [base, on, size, triageMin]);

  const e = triageEconomics(inputs, mix, second);
  const change = policyChangeCost(inputs, mix);
  const n = inputs.claimsPerYear;
  const challenged = on.length > 0 || triageMin !== base.triageMinToday;

  const timeCut = e.todayHours > 0 ? (e.todayHours - e.withHours) / e.todayHours : 0;
  const breakEvenMin = ((e.withHours + inputs.platformPerYear / e.hourly) * 60) / n;
  const errStale = errorCost(inputs, quality.keepV1);
  const errV2 = errorCost(inputs, quality.v2);
  const pStar = breakEvenProbability(inputs);
  const mo = (m: number | null) => (m === null ? "—" : `${m.toFixed(1)} mo`);
  const positive = e.netPerYear > 0;

  const curve = useMemo(
    () =>
      Array.from({ length: 37 }, (_, m) => ({
        m,
        v: Math.round(-inputs.implementation + (e.netPerYear / 12) * m),
      })),
    [inputs.implementation, e.netPerYear],
  );

  return (
    <div>
      <PageHeader eyebrow="Ops lead" title="Value & ROI" sub="Motor insurer · triage cost, savings and payback" />

      {/* Controls */}
      <div className="card-quiet mb-6 flex flex-wrap items-center gap-x-8 gap-y-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-text-2">Claims / year</span>
          <Seg options={SIZES} value={size} onChange={setSize} fmt={(v) => `${v / 1000}k`} />
        </div>
        <div className="flex min-w-[260px] flex-1 items-center gap-3">
          <span className="whitespace-nowrap text-[13px] text-text-2">Manual triage today</span>
          <Slider
            value={[triageMin]}
            min={6}
            max={20}
            step={1}
            onValueChange={([v]) => setTriageMin(v)}
            aria-label="Manual triage minutes per claim today"
            className="flex-1 py-2"
          />
          <span className="num w-14 text-right text-[14px] font-semibold">{triageMin} min</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-text-2">Challenge</span>
          {CHALLENGES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => toggle(c.key)}
              aria-pressed={on.includes(c.key)}
              className={cn(
                "rounded-full px-3 py-1 text-[13px] ring-1 ring-line",
                on.includes(c.key) ? "bg-[var(--ink)] text-white ring-transparent" : "bg-surface text-text-2",
              )}
            >
              {c.label}
            </button>
          ))}
          {challenged && (
            <button
              type="button"
              onClick={() => {
                setOn([]);
                setTriageMin(base.triageMinToday);
              }}
              className="text-[13px] text-link hover:underline"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Headline numbers */}
      <div className="kpi-strip grid grid-cols-4 gap-0">
        <Kpi label="Triage cost today / year" value={eurCompact(e.todayCost)} />
        <Kpi label="With Clearpath / year" value={eurCompact(e.withCost)} sub="incl. licence" />
        <Kpi
          label="Net saving / year"
          value={<span style={{ color: positive ? "var(--ok)" : "var(--action)" }}>{eurCompact(e.netPerYear)}</span>}
        />
        <Kpi label="Payback" value={mo(e.paybackMonths)} sub={`on ${eurCompact(inputs.implementation)} integration`} />
      </div>
      <div className="kpi-strip mt-4 grid grid-cols-4 gap-0">
        <Kpi label="Net saving per claim" value={`€${(e.netPerYear / n).toFixed(2)}`} />
        <Kpi label="Manual triage time" value={`−${pct(timeCut)}`} />
        <Kpi label="Handler capacity freed" value={`${(e.fteToday - e.fteWith).toFixed(1)} FTE`} />
        <Kpi label="Cost per policy change" value={`${eurCompact(change.today.total)} → ${eurCompact(change.withSystem.total)}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Payback curve */}
        <Card>
          <div className="flex items-baseline justify-between">
            <h2 className="section-title">Cumulative net, first 3 years</h2>
            <span className="num text-[14px] font-semibold" style={{ color: positive ? "var(--ok)" : "var(--action)" }}>
              {eurCompact(3 * e.netPerYear - inputs.implementation)} after 3 years
            </span>
          </div>
          <div className="mt-3">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={curve} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis
                  dataKey="m"
                  type="number"
                  domain={[0, 36]}
                  ticks={[0, 6, 12, 18, 24, 30, 36]}
                  tickFormatter={(m) => `${m} mo`}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "var(--text-2)" }}
                />
                <YAxis
                  tickFormatter={(v) => eurCompact(Number(v))}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                  tick={{ fontSize: 12, fill: "var(--text-2)" }}
                />
                <ReferenceLine y={0} stroke="var(--text-3)" />
                {e.paybackMonths !== null && e.paybackMonths <= 36 && (
                  <ReferenceLine
                    x={e.paybackMonths}
                    stroke="var(--ok)"
                    strokeDasharray="4 4"
                    label={{
                      value: `payback ${e.paybackMonths.toFixed(1)} mo`,
                      position: "insideTopLeft",
                      fontSize: 12,
                      fill: "var(--text-2)",
                    }}
                  />
                )}
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }}
                  labelFormatter={(m) => `Month ${m}`}
                  formatter={(v: number) => [eur0(v), "Cumulative net"]}
                />
                <Line type="monotone" dataKey="v" stroke={SERIES.ink} strokeWidth={3} dot={false} isAnimationActive />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[13px] text-text-2">
            Break-even at <span className="num font-semibold text-foreground">{breakEvenMin.toFixed(1)} min</span> manual
            triage per claim
          </p>
        </Card>

        {/* Cost of errors */}
        <Card>
          <h2 className="section-title">Cost of errors</h2>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2.5 text-[14px]">
            <dt className="text-text-2">Wrong routine (false approval)</dt>
            <dd className="num font-semibold">{eur0(wrongRoutineCost(inputs))}</dd>
            <dt className="text-text-2">Unnecessary escalation</dt>
            <dd className="num font-semibold">{eur0(unnecessaryReviewCost(inputs))}</dd>
            <dt className="text-text-2">Escalate above chance of a problem</dt>
            <dd className="num font-semibold">{pct(pStar, 1)}</dd>
            <dt className="border-t border-line pt-2.5 text-text-2">Errors / year, rules not updated to V2</dt>
            <dd className="num border-t border-line pt-2.5 font-semibold" style={{ color: "var(--action)" }}>
              {eurCompact(errStale.total)}
            </dd>
            <dt className="text-text-2">Errors / year with Clearpath on V2</dt>
            <dd className="num font-semibold" style={{ color: "var(--ok)" }}>
              {eurCompact(errV2.total)}
            </dd>
          </dl>
          <p className="mt-3 text-[12.5px] text-text-2">
            Wrong routine: {quality.keepV1.wrongRoutine} of {quality.keepV1.n} open labelled claims without the update,{" "}
            {quality.v2.wrongRoutine} of {quality.v2.n} with V2.
          </p>
        </Card>
      </div>
    </div>
  );
}
