import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
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
import { Card, Kpi, PageHeader } from "@/components/triage/ui";

// Value & ROI: the numbers only. Same model as the Business case page (src/lib/business.ts) on the
// shared claim mix (useClaimMix). The stress test re-runs the same model with challenged inputs.

export const Route = createFileRoute("/_authenticated/pitch")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Value & ROI — Clearpath" },
      { property: "og:description", content: "Triage cost, savings, payback and stress test for a mid-sized motor insurer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Value & ROI — Clearpath" },
      { name: "description", content: "Triage cost, savings, payback and stress test for a mid-sized motor insurer." },
    ],
  }),
  component: ValueRoi,
});

const STRESS: { label: string; o: Partial<Inputs> }[] = [
  { label: "Base case", o: {} },
  { label: "Manual triage 12 min instead of 15", o: { triageMinToday: 12 } },
  { label: "Reviews take 20 min instead of 15", o: { reviewMin: 20 } },
  { label: "Information requests by hand (8 min)", o: { infoMin: 8 } },
  { label: "Licence +50% (€180k)", o: { platformPerYear: 180000 } },
  { label: "Integration ×2 (€300k)", o: { implementation: 300000 } },
  {
    label: "Combined: 12 min triage, manual requests, licence €150k, integration €200k",
    o: { triageMinToday: 12, infoMin: 8, platformPerYear: 150000, implementation: 200000 },
  },
];

function ValueRoi() {
  const { mix } = useClaimMix();
  const second = mix.secondShare;
  const quality = useMemo(() => labelledReport(), []);
  const inputs = useMemo(() => defaultInputs(), []);
  const e = triageEconomics(inputs, mix, second);
  const change = policyChangeCost(inputs, mix);
  const n = inputs.claimsPerYear;

  const stress = STRESS.map((s) => {
    const i = { ...inputs, ...s.o } as Inputs;
    return { ...s, r: triageEconomics(i, mix, second) };
  });

  const timeCut = e.todayHours > 0 ? (e.todayHours - e.withHours) / e.todayHours : 0;
  const breakEvenMin = ((e.withHours + inputs.platformPerYear / e.hourly) * 60) / n;
  const errStale = errorCost(inputs, quality.keepV1);
  const errV2 = errorCost(inputs, quality.v2);
  const pStar = breakEvenProbability(inputs);
  const mo = (m: number | null) => (m === null ? "—" : `${m.toFixed(1)} mo`);

  return (
    <div>
      <PageHeader
        eyebrow="Ops lead"
        title="Value & ROI"
        sub={`Mid-sized motor insurer · ${n.toLocaleString("en-US")} claims a year`}
      />

      <div className="kpi-strip grid grid-cols-4 gap-0">
        <Kpi label="Triage cost today / year" value={eurCompact(e.todayCost)} />
        <Kpi label="Triage cost with Clearpath / year" value={eurCompact(e.withCost)} sub="incl. licence" />
        <Kpi label="Net saving / year" value={eurCompact(e.netPerYear)} />
        <Kpi label="Payback" value={mo(e.paybackMonths)} sub={`on ${eurCompact(inputs.implementation)} integration`} />
      </div>
      <div className="kpi-strip mt-4 grid grid-cols-4 gap-0">
        <Kpi label="Net saving per claim" value={`€${(e.netPerYear / n).toFixed(2)}`} />
        <Kpi label="Manual triage time" value={`−${pct(timeCut)}`} />
        <Kpi label="Handler capacity freed" value={`${(e.fteToday - e.fteWith).toFixed(1)} FTE`} />
        <Kpi
          label="Cost per policy change"
          value={`${eurCompact(change.today.total)} → ${eurCompact(change.withSystem.total)}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="section-title">Stress test</h2>
          <table className="mt-3 w-full text-[14px]">
            <thead>
              <tr className="text-left text-text-3">
                <th className="py-2 pr-4 font-medium">Assumption challenged</th>
                <th className="py-2 pr-4 text-right font-medium">Net / year</th>
                <th className="py-2 text-right font-medium">Payback</th>
              </tr>
            </thead>
            <tbody>
              {stress.map((s, k) => (
                <tr
                  key={s.label}
                  className={k === 0 || k === stress.length - 1 ? "border-t border-line font-semibold" : "border-t border-line"}
                >
                  <td className="py-2 pr-4">{s.label}</td>
                  <td className="num py-2 pr-4 text-right">{eur0(s.r.netPerYear)}</td>
                  <td className="num py-2 text-right">{mo(s.r.paybackMonths)}</td>
                </tr>
              ))}
              <tr className="border-t border-line text-text-2">
                <td className="py-2 pr-4">Break-even manual triage time</td>
                <td className="num py-2 pr-4 text-right" colSpan={2}>
                  {breakEvenMin.toFixed(1)} min per claim
                </td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="section-title">Cost of errors</h2>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2.5 text-[14px]">
            <dt className="text-text-2">Wrong routine (false approval)</dt>
            <dd className="num font-semibold">{eur0(wrongRoutineCost(inputs))}</dd>
            <dt className="text-text-2">Unnecessary escalation</dt>
            <dd className="num font-semibold">{eur0(unnecessaryReviewCost(inputs))}</dd>
            <dt className="text-text-2">Escalate when chance of a problem exceeds</dt>
            <dd className="num font-semibold">{pct(pStar, 1)}</dd>
            <dt className="border-t border-line pt-2.5 text-text-2">Errors / year, rules not updated to {"V2"}</dt>
            <dd className="num border-t border-line pt-2.5 font-semibold">{eurCompact(errStale.total)}</dd>
            <dt className="text-text-2">Errors / year with Clearpath on V2</dt>
            <dd className="num font-semibold">{eurCompact(errV2.total)}</dd>
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
