import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useClaimMix } from "@/lib/claim-mix";
import {
  defaultInputs,
  eur0,
  eurCompact,
  pct,
  triageEconomics,
  type Inputs,
} from "@/lib/business";
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
  // €20/h all-in, German-speaking offshore claims desk: salary that gives 20 × 1600 / 1.3
  { key: "offshore", label: "Offshore team €20/h", o: { salary: 24615 } },
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
  const n = inputs.claimsPerYear;
  const challenged = on.length > 0 || triageMin !== base.triageMinToday;

  const timeCut = e.todayHours > 0 ? (e.todayHours - e.withHours) / e.todayHours : 0;
  const breakEvenMin = ((e.withHours + inputs.platformPerYear / e.hourly) * 60) / n;
  const mo = (m: number | null) => (m === null ? "—" : `${m.toFixed(1)} mo`);
  const positive = e.netPerYear > 0;

  const max = Math.max(e.todayCost, e.withCost, 1);
  const w = (v: number) => `${Math.max(0, (v / max) * 100)}%`;

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
          <span className="text-[13px] text-text-2">Stress test</span>
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
        <Kpi label="Break-even triage time" value={`${breakEvenMin.toFixed(1)} min`} sub={`today ${inputs.triageMinToday} min`} />
      </div>

      <div className="mt-6">
        {/* Cost today vs with: readable at first sight */}
        <Card>
          <h2 className="text-[18px] font-semibold">Triage cost per year</h2>
          <div className="mt-6 space-y-7">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[15px] text-text-2">Today: every claim read by a person</span>
                <span className="num text-[22px] font-semibold">{eurCompact(e.todayCost)}</span>
              </div>
              <div className="h-9 rounded-lg" style={{ width: w(e.todayCost), background: SERIES.grey }} />
            </div>
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[15px] text-text-2">With Clearpath</span>
                <span className="num text-[22px] font-semibold">{eurCompact(e.withCost)}</span>
              </div>
              <div className="flex h-9 gap-1">
                <div className="rounded-l-lg" style={{ width: w(e.withPeopleCost), background: SERIES.primary }} />
                <div className="rounded-r-lg" style={{ width: w(inputs.platformPerYear), background: SERIES.light }} />
                {positive && (
                  <div
                    className="num flex items-center justify-center rounded-lg text-[15px] font-semibold"
                    style={{
                      width: w(e.netPerYear),
                      color: "var(--ok)",
                      border: "2px dashed var(--ok)",
                      background: "color-mix(in oklab, var(--ok) 8%, var(--surface))",
                    }}
                  >
                    −{eurCompact(e.netPerYear)}
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-text-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-3 rounded-sm" style={{ background: SERIES.primary }} />
                  Reviewers and requests
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-3 rounded-sm" style={{ background: SERIES.light }} />
                  Licence
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-3 rounded-sm border-2 border-dashed" style={{ borderColor: "var(--ok)" }} />
                  Saved
                </span>
              </div>
            </div>
          </div>
          <p className="mt-6 text-[16px]">
            <span className="num font-semibold" style={{ color: positive ? "var(--ok)" : "var(--action)" }}>
              {positive ? `−${eurCompact(e.netPerYear)} a year` : `+${eurCompact(-e.netPerYear)} a year`}
            </span>
            <span className="text-text-2"> · payback {mo(e.paybackMonths)}</span>
          </p>
        </Card>

      </div>
    </div>
  );
}
