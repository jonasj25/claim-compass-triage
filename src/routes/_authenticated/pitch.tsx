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
  policyChangeCost,
  SOURCES,
  triageEconomics,
  type Assumption,
  type Inputs,
} from "@/lib/business";
import { Card, PageHeader } from "@/components/triage/ui";
import { KindBadge, SERIES } from "@/components/triage/charts";

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

function Big({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="num text-[52px] font-semibold leading-none" style={{ color: SERIES.ink }}>
        {value}
      </p>
      <p className="mt-2 text-[15px] text-text-2">{label}</p>
    </div>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="card-quiet p-5">
      <p className="num text-[32px] font-semibold leading-none" style={{ color: SERIES.ink }}>
        {value}
      </p>
      <p className="mt-2 text-[14.5px] text-text-2">{label}</p>
    </div>
  );
}

function ChartCard({ title, foot, children }: { title: string; foot: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-col">
      <h2 className="text-[16px] font-semibold">{title}</h2>
      <div className="mt-4 flex-1">{children}</div>
      <p className="mt-3 text-[14.5px] text-text-2">{foot}</p>
    </Card>
  );
}

function HBar({ label, value, max, color, text }: { label: string; value: number; max: number; color: string; text: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[14.5px]">
        <span>{label}</span>
        <span className="num font-semibold">{text}</span>
      </div>
      <div className="h-4 w-full rounded-sm bg-surface-2">
        <div className="h-4 rounded-sm" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, background: color }} />
      </div>
    </div>
  );
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
  const change = policyChangeCost(inputs, mix);

  const hoursSaved = e.todayHours - e.withHours;
  const timeCut = e.todayHours > 0 ? hoursSaved / e.todayHours : 0;
  const gross = e.todayCost - e.withPeopleCost;
  const valuePerClaim = gross / n;
  const pricePerClaim = inputs.platformPerYear / n;
  const keeps = gross > 0 ? Math.max(0, e.netPerYear) / gross : 0;
  const threeYear = 3 * e.netPerYear - inputs.implementation;
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
    { label: "Processed straight away", value: mix.share.routine_processing, color: SERIES.ink },
    { label: "Missing facts requested at once", value: mix.share.request_information, color: SERIES.mid },
    { label: "Sent to a reviewer", value: mix.share.human_review, color: SERIES.light },
  ];

  return (
    <div>
      <PageHeader title="Value & ROI" sub={`Claim Compass for a motor insurer with ${n.toLocaleString("en-US")} claims a year.`} />

      {/* Headline numbers */}
      <Card>
        <div className="grid gap-8 md:grid-cols-3">
          <Big value={eurCompact(e.netPerYear)} label="saved every year, after our licence" />
          <Big value={payback} label="to pay back the integration" />
          <Big value={`−${pct(timeCut)}`} label="manual triage time" />
        </div>
        <p className="mt-6 text-[15px]">
          Up to <span className="font-semibold">{eurCompact(up.netPerYear)}</span> a year ·{" "}
          <span className="font-semibold">{eurCompact(threeYear)}</span> net value over 3 years
        </p>
      </Card>

      {/* Three small charts */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <ChartCard
          title="Payback"
          foot={
            <>
              In profit from month <span className="font-semibold text-foreground">{e.paybackMonths === null ? "—" : Math.ceil(e.paybackMonths)}</span>
            </>
          }
        >
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={curve} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="m"
                ticks={[0, 12, 24, 36]}
                tickFormatter={(m) => `${m} mo`}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "var(--text-2)" }}
              />
              <YAxis
                tickFormatter={(v) => eurCompact(Number(v))}
                tickLine={false}
                axisLine={false}
                width={56}
                tick={{ fontSize: 12, fill: "var(--text-2)" }}
              />
              <ReferenceLine y={0} stroke="var(--text-3)" />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 13 }}
                labelFormatter={(m) => `Month ${m}`}
                formatter={(v: number) => [eur0(v), "Cumulative net"]}
              />
              <Line type="monotone" dataKey="v" stroke={SERIES.ink} strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Triage cost per year"
          foot={
            <>
              <span className="font-semibold text-foreground">{eur0(e.netPerYear)}</span> less, licence included
            </>
          }
        >
          <div className="space-y-5 pt-2">
            <HBar label="Today" value={e.todayCost} max={e.todayCost} color={SERIES.grey} text={eurCompact(e.todayCost)} />
            <HBar label="With Claim Compass" value={e.withCost} max={e.todayCost} color={SERIES.ink} text={eurCompact(e.withCost)} />
          </div>
        </ChartCard>

        <ChartCard
          title="Where claims go"
          foot={
            <>
              <span className="font-semibold text-foreground">{pct(mix.share.routine_processing + mix.share.request_information)}</span> get their next step without a handler
            </>
          }
        >
          <div className="flex h-5 w-full overflow-hidden rounded-sm">
            {shares.map((s) => (
              <div key={s.label} style={{ width: `${s.value * 100}%`, background: s.color }} />
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {shares.map((s) => (
              <div key={s.label} className="flex items-center justify-between text-[14.5px]">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block size-3 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="num font-semibold">{pct(s.value)}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Impact tiles */}
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Tile value={Math.round(hoursSaved).toLocaleString("en-US")} label="handler hours saved a year" />
        <Tile value={`${(e.fteToday - e.fteWith).toFixed(1)} FTE`} label="freed for complex claims, no hiring" />
        <Tile value={`€${(e.netPerYear / n).toFixed(2)}`} label="saved on every claim" />
        <Tile value={`${inputs.changeWeeksToday} wk → 1 day`} label={`per rule change, ${eurCompact(change.today.total - change.withSystem.total)} saved each time`} />
      </div>

      {/* Unit economics + trust */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-[16px] font-semibold">The insurer keeps {pct(keeps)} of the value</h2>
          <div className="mt-4 space-y-4">
            <HBar label="Value created per claim" value={valuePerClaim} max={valuePerClaim} color={SERIES.ink} text={`€${valuePerClaim.toFixed(2)}`} />
            <HBar label="Our price per claim" value={pricePerClaim} max={valuePerClaim} color={SERIES.light} text={`€${pricePerClaim.toFixed(2)}`} />
          </div>
          <p className="mt-4 text-[14.5px] text-text-2">
            {eurCompact(inputs.platformPerYear)} a year + {eurCompact(inputs.implementation)} once per mid-sized insurer
          </p>
        </Card>
        <Card>
          <h2 className="text-[16px] font-semibold">Built for control</h2>
          <ul className="mt-4 space-y-3 text-[15px]">
            {[
              "Every decision shows its rule, policy version and evidence",
              "Same claim, same answer: the written policy decides",
              "Rule changes recheck open claims; closed ones never change",
              "Every override is logged with reason and reviewer",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" style={{ color: SERIES.ink }} />
                {t}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Backup */}
      <details className="card-quiet mt-8 p-6">
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
