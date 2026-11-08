import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { CheckCircle2, ExternalLink } from "lucide-react";
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
  DEFAULT_ASSUMPTIONS,
  defaultInputs,
  eur0,
  eurCompact,
  pct,
  SOURCES,
  triageEconomics,
  type Assumption,
  type Inputs,
} from "@/lib/business";
import { KindBadge } from "@/components/triage/charts";

// Value & ROI: the pitch page. Same model as the Business case page (triageEconomics,
// policyChangeCost) on the shared claim mix (useClaimMix). Headline = base case, "up to" = optimistic.
// Scenarios and every input with its source are in the collapsed "Backup for Q&A".

export const Route = createFileRoute("/_authenticated/pitch")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Value & ROI — Claim Compass" },
      { property: "og:description", content: "What Claim Compass is worth to a mid-sized motor insurer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Value & ROI — Claim Compass" },
      { name: "description", content: "Savings, payback and impact of Claim Compass for a mid-sized motor insurer." },
    ],
  }),
  component: ValueRoi,
});

type ScenarioKey = "conservative" | "base" | "optimistic";
type Key = Assumption["key"];

const SCENARIOS: { key: ScenarioKey; title: string; overrides: Partial<Record<Key, number>>; why: string }[] = [
  {
    key: "conservative",
    title: "Conservative",
    overrides: { triageMinToday: 12, infoMin: 8, platformPerYear: 150000, implementation: 200000 },
    why: "12 min triage today, information requests by hand, licence +25%, integration +33%",
  },
  { key: "base", title: "Base case", overrides: {}, why: "Business case defaults; all headline numbers" },
  {
    key: "optimistic",
    title: "Optimistic",
    overrides: { triageMinToday: 18, reviewMin: 12, platformPerYear: 100000 },
    why: "18 min triage today, 12 min reviews, early-customer licence; all 'up to' numbers",
  },
];

const srcById = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

function fmtVal(a: Assumption, v: number) {
  if (a.unit === "€/year") return `${eur0(v)} / year`;
  if (a.unit === "€/day") return `${eur0(v)} / day`;
  if (a.unit === "€") return eur0(v);
  if (a.unit === "×") return `×${v}`;
  if (a.unit === "of claim") return `${pct(v)} of the claim`;
  return `${v.toLocaleString("en-US")} ${a.unit}`;
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="px-2">
      <p className="num text-[36px] font-bold leading-none" style={{ color }}>
        {value}
      </p>
      <p className="mt-2 text-[15px] text-text-2">{label}</p>
    </div>
  );
}

function HBar({ label, value, max, color, text }: { label: string; value: number; max: number; color: string; text: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[15px]">
        <span>{label}</span>
        <span className="num text-[18px] font-semibold">{text}</span>
      </div>
      <div className="h-4 w-full rounded-full bg-surface-2">
        <div className="h-4 rounded-full" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, background: color }} />
      </div>
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <h2 className="text-[22px] font-semibold leading-tight">{children}</h2>;
}

function ValueRoi() {
  const { mix, policy: active, source } = useClaimMix();
  const second = mix.secondShare;

  const all = useMemo(() => {
    const out = {} as Record<ScenarioKey, { inputs: Inputs; e: ReturnType<typeof triageEconomics> }>;
    for (const s of SCENARIOS) {
      const inputs = { ...defaultInputs(), ...s.overrides } as Inputs;
      out[s.key] = { inputs, e: triageEconomics(inputs, mix, second) };
    }
    return out;
  }, [mix, second]);

  const { inputs, e } = all.base;
  const up = all.optimistic.e;
  const n = inputs.claimsPerYear;

  const hoursSaved = e.todayHours - e.withHours;
  const timeCut = e.todayHours > 0 ? hoursSaved / e.todayHours : 0;
  const gross = e.todayCost - e.withPeopleCost;
  const pricePerClaim = inputs.platformPerYear / n;
  const keeps = gross > 0 ? Math.max(0, e.netPerYear) / gross : 0;
  const payback = e.paybackMonths === null ? "—" : `${e.paybackMonths.toFixed(1)} mo`;

  const curve = useMemo(
    () =>
      Array.from({ length: 37 }, (_, m) => ({
        m,
        v: Math.round(-inputs.implementation + (e.netPerYear / 12) * m),
      })),
    [inputs.implementation, e.netPerYear],
  );

  const shares = [
    { label: "Processed at once", value: mix.share.routine_processing, color: "var(--ok)" },
    { label: "Missing facts requested", value: mix.share.request_information, color: "var(--chart-1)" },
    { label: "To a reviewer", value: mix.share.human_review, color: "var(--action)" },
  ];

  return (
    <div>
      {/* Hero: the three numbers */}
      <section
        className="rounded-2xl px-8 py-9 text-white"
        style={{ background: "linear-gradient(135deg, var(--ink) 0%, var(--chart-1) 100%)" }}
      >
        <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-white/70">Value &amp; ROI · Claim Compass</p>
        <div className="mt-6 grid gap-8 md:grid-cols-3">
          <div>
            <p className="num text-[60px] font-bold leading-none">{eurCompact(e.netPerYear)}</p>
            <p className="mt-2 text-[16px] text-white/85">saved per year</p>
          </div>
          <div>
            <p className="num text-[60px] font-bold leading-none">{payback}</p>
            <p className="mt-2 text-[16px] text-white/85">payback</p>
          </div>
          <div>
            <p className="num text-[60px] font-bold leading-none">−{pct(timeCut)}</p>
            <p className="mt-2 text-[16px] text-white/85">manual triage</p>
          </div>
        </div>
        <p className="mt-7 text-[16px] text-white/85">
          For an insurer with {n.toLocaleString("en-US")} claims a year · up to{" "}
          <span className="font-semibold text-white">{eurCompact(up.netPerYear)}</span>
        </p>
      </section>

      {/* Two visuals, no boxes */}
      <div className="mt-10 grid gap-12 lg:grid-cols-2">
        <section>
          <Title>
            In profit from month{" "}
            <span style={{ color: "var(--ok)" }}>{e.paybackMonths === null ? "—" : Math.ceil(e.paybackMonths)}</span>
          </Title>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={curve} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis
                  dataKey="m"
                  ticks={[0, 12, 24, 36]}
                  tickFormatter={(m) => `${m} mo`}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 13, fill: "var(--text-2)" }}
                />
                <YAxis
                  tickFormatter={(v) => eurCompact(Number(v))}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                  tick={{ fontSize: 13, fill: "var(--text-2)" }}
                />
                <ReferenceLine y={0} stroke="var(--text-3)" />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 13 }}
                  labelFormatter={(m) => `Month ${m}`}
                  formatter={(v: number) => [eur0(v), "Cumulative net"]}
                />
                <Line type="monotone" dataKey="v" stroke="var(--ok)" strokeWidth={3.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section>
          <Title>
            <span style={{ color: "var(--chart-1)" }}>{pct(mix.share.routine_processing + mix.share.request_information)}</span> of claims
            need no handler
          </Title>
          <div className="mt-6 flex h-10 w-full overflow-hidden rounded-lg">
            {shares.map((s) => (
              <div
                key={s.label}
                className="num flex items-center justify-center text-[14px] font-semibold text-white"
                style={{ width: `${s.value * 100}%`, background: s.color }}
              >
                {s.value >= 0.12 ? pct(s.value) : ""}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
            {shares.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-2">
                <span className="inline-block size-3.5 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
          <div className="mt-8 space-y-4">
            <HBar label="Triage cost today" value={e.todayCost} max={e.todayCost} color="var(--action)" text={eurCompact(e.todayCost)} />
            <HBar label="With Claim Compass" value={e.withCost} max={e.todayCost} color="var(--ok)" text={eurCompact(e.withCost)} />
          </div>
        </section>
      </div>

      {/* One strip of numbers */}
      <div className="mt-12 grid gap-6 border-y border-line py-7 md:grid-cols-4 md:divide-x md:divide-line">
        <Stat value={`${(e.fteToday - e.fteWith).toFixed(1)} FTE`} label="freed, no hiring" color="var(--chart-1)" />
        <Stat value={`€${(e.netPerYear / n).toFixed(2)}`} label="saved per claim" color="var(--ok)" />
        <Stat value={`${inputs.changeWeeksToday} wk → 1 day`} label="per rule change" color="var(--action)" />
        <Stat value={pct(keeps)} label={`of the value stays with the insurer (we charge €${pricePerClaim.toFixed(2)}/claim)`} color="var(--ink)" />
      </div>

      <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
        {["Every decision explained", "Same claim, same answer", "Every override logged"].map((t) => (
          <span key={t} className="inline-flex items-center gap-2">
            <CheckCircle2 className="size-5" style={{ color: "var(--ok)" }} />
            {t}
          </span>
        ))}
      </p>

      {/* Backup */}
      <details className="mt-10">
        <summary className="cursor-pointer text-[15px] font-medium">Backup for Q&amp;A: how these numbers are calculated</summary>
        <p className="mt-4 text-[14px] text-text-2">
          Net saving = (triage hours today − hours with the system) × hourly cost ({eur0(e.hourly)}) − licence.
          Claim mix from the {mix.open} open claims {source === "live" ? "in the system" : "of the demo set"} under
          policy {active.version.toUpperCase()}. Fewer leaked claims are not included.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-text-3">
                <th className="py-2 pr-4 font-medium">Scenario</th>
                <th className="py-2 pr-4 font-medium">Net / year</th>
                <th className="py-2 pr-4 font-medium">Payback</th>
                <th className="py-2 font-medium">Assumes</th>
              </tr>
            </thead>
            <tbody>
              {SCENARIOS.map((s) => {
                const x = all[s.key].e;
                return (
                  <tr key={s.key} className="border-t border-line align-top">
                    <td className="py-2 pr-4 font-medium">{s.title}</td>
                    <td className="num py-2 pr-4">{eur0(x.netPerYear)}</td>
                    <td className="num py-2 pr-4">{x.paybackMonths === null ? "—" : `${x.paybackMonths.toFixed(1)} mo`}</td>
                    <td className="py-2 text-text-2">{s.why}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-text-3">
                <th className="py-2 pr-4 font-medium">Input</th>
                <th className="py-2 pr-4 font-medium">Base value</th>
                <th className="py-2 pr-4 font-medium">Kind</th>
                <th className="py-2 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {DEFAULT_ASSUMPTIONS.map((a) => {
                const src = a.source ? srcById[a.source] : undefined;
                return (
                  <tr key={a.key} className="border-t border-line align-top">
                    <td className="py-2 pr-4">{a.label}</td>
                    <td className="num py-2 pr-4">{fmtVal(a, inputs[a.key])}</td>
                    <td className="py-2 pr-4">
                      <KindBadge kind={a.kind} />
                    </td>
                    <td className="py-2 text-text-2">
                      {a.note}
                      {src && (
                        <a href={src.url} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 text-link hover:underline">
                          source <ExternalLink className="size-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[14px] text-text-2">
          Change any input on the <Link to="/business-case" className="text-link hover:underline">Business case</Link> page ·
          decision quality on the <Link to="/quality" className="text-link hover:underline">quality report</Link>.
        </p>
      </details>
    </div>
  );
}
