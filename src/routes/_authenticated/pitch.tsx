import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
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
import { Card, Kpi, PageHeader } from "@/components/triage/ui";
import { KindBadge, SERIES } from "@/components/triage/charts";

// Business value & ROI: the pitch page for investors, buyers and judges.
// Every number is computed with the same model as the Business case page (triageEconomics,
// policyChangeCost) on the same claim mix as Workload & flow (useClaimMix). Headline numbers use the
// base case; "up to" numbers use the optimistic scenario. Assumptions, scenarios and sensitivities
// are in the collapsed "Backup for Q&A" section at the bottom.

export const Route = createFileRoute("/_authenticated/pitch")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Business value & ROI — Claim Compass" },
      { property: "og:description", content: "What Claim Compass is worth to a mid-sized motor insurer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Business value & ROI — Claim Compass" },
      {
        name: "description",
        content: "ROI, efficiency, cost, workforce and compliance impact of Claim Compass for a mid-sized motor insurer.",
      },
    ],
  }),
  component: Pitch,
});

type ScenarioKey = "conservative" | "base" | "optimistic";
type Key = Assumption["key"];

const SCENARIOS: {
  key: ScenarioKey;
  title: string;
  overrides: Partial<Record<Key, number>>;
  why: string;
}[] = [
  {
    key: "conservative",
    title: "Conservative",
    overrides: { triageMinToday: 12, infoMin: 8, platformPerYear: 150000, implementation: 200000 },
    why: "Fast manual triage today (12 min), information requests written by hand (8 min), licence +25%, integration +33%.",
  },
  {
    key: "base",
    title: "Base case",
    overrides: {},
    why: "The defaults of the Business case page. All headline numbers on this page.",
  },
  {
    key: "optimistic",
    title: "Optimistic",
    overrides: { triageMinToday: 18, reviewMin: 12, platformPerYear: 100000 },
    why: "Slow manual triage today (18 min), faster reviews with pre-sorted evidence (12 min), early-customer licence. Used for every 'up to' figure.",
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

/** One KPI: big value, name, one-line explanation */
function Metric({ value, name, line, accent }: { value: ReactNode; name: string; line: string; accent?: boolean }) {
  return (
    <div className="card-quiet flex flex-col p-5">
      <span className="num text-[30px] font-semibold leading-none" style={accent ? { color: SERIES.ink } : undefined}>
        {value}
      </span>
      <span className="mt-2 text-[13.5px] font-medium">{name}</span>
      <span className="mt-1 text-[12.5px] text-text-2">{line}</span>
    </div>
  );
}

/** Before/after bar pair for the "Typical impact" section */
function BeforeAfter({
  title,
  before,
  after,
  beforeLabel,
  afterLabel,
  gain,
  higherIsBetter,
}: {
  title: string;
  before: number;
  after: number;
  beforeLabel: string;
  afterLabel: string;
  gain: string;
  higherIsBetter?: boolean;
}) {
  const max = Math.max(before, after, 1e-9);
  const bar = (v: number, color: string) => (
    <div className="h-3 rounded-sm" style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: color }} />
  );
  return (
    <div className="card-quiet p-5">
      <p className="text-[12px] font-medium uppercase tracking-wide text-text-3">{title}</p>
      <p className="num mt-1 text-[24px] font-semibold" style={{ color: SERIES.ink }}>
        {gain}
      </p>
      <div className="mt-3 space-y-2 text-[12.5px]">
        <div>
          <div className="mb-1 flex justify-between text-text-2">
            <span>Today</span>
            <span className="num">{beforeLabel}</span>
          </div>
          {bar(before, higherIsBetter ? SERIES.soft : SERIES.grey)}
        </div>
        <div>
          <div className="mb-1 flex justify-between text-text-2">
            <span>With Claim Compass</span>
            <span className="num">{afterLabel}</span>
          </div>
          {bar(after, SERIES.ink)}
        </div>
      </div>
    </div>
  );
}

function Pitch() {
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

  // Derived figures (base case)
  const hoursSaved = e.todayHours - e.withHours;
  const timeCut = e.todayHours > 0 ? hoursSaved / e.todayHours : 0;
  const upTimeCut = up.todayHours > 0 ? (up.todayHours - up.withHours) / up.todayHours : 0;
  const minToday = inputs.triageMinToday;
  const minWith = (e.withHours * 60) / n;
  const gross = e.todayCost - e.withPeopleCost; // saving before our licence
  const fteFreed = e.fteToday - e.fteWith;
  const upFteFreed = up.fteToday - up.fteWith;
  const instant = mix.share.routine_processing + mix.share.request_information; // next step without a handler
  const reachReviewer = mix.share.human_review;
  const capacityMultiple = e.withHours > 0 ? e.todayHours / e.withHours : 0; // same team, more claims
  const threeYearSpend = inputs.implementation + 3 * inputs.platformPerYear;
  const threeYearNet = 3 * e.netPerYear - inputs.implementation;
  const returnPerEuro = threeYearSpend > 0 ? (3 * gross) / threeYearSpend : 0;
  const pricePerClaim = inputs.platformPerYear / n;
  const customerKeeps = gross > 0 ? Math.max(0, e.netPerYear) / gross : 0;
  const changeFactor = change.withSystem.total > 0 ? change.today.total / change.withSystem.total : 0;

  // Sensitivities for the backup
  const breakEvenMin = minWith + (inputs.platformPerYear / e.hourly / n) * 60;
  const manualInfo = triageEconomics({ ...inputs, infoMin: 8 }, mix, second);
  const doubleIntegration = e.netPerYear > 0 ? ((inputs.implementation * 2) / e.netPerYear) * 12 : null;

  const payback = e.paybackMonths === null ? "—" : `${e.paybackMonths.toFixed(1)} months`;
  const claimsText = source === "live" ? `the ${mix.open} open claims in the system` : `the ${mix.open} open claims of the demo set`;

  return (
    <div>
      <PageHeader
        eyebrow="Ops lead"
        title="Business value & ROI"
        sub={`Claim Compass for a mid-sized motor insurer with ${n.toLocaleString("en-US")} own-damage claims a year.`}
      />

      {/* Hero */}
      <Card className="mb-6">
        <p className="text-[26px] font-semibold leading-tight">
          {pct(timeCut)} less manual triage. Payback in {payback}.
        </p>
        <p className="mt-2 max-w-[70ch] text-[14.5px] text-text-2">
          Claim Compass takes over intake, policy checks and routing, so claims teams spend their time on
          the claims that need judgement, and every decision can be explained.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <p className="font-medium">Every claim triaged in seconds</p>
            <p className="mt-1 text-[13px] text-text-2">
              {pct(instant)} of claims get their next step without a handler touching them; only{" "}
              {pct(reachReviewer)} reach a reviewer.
            </p>
          </div>
          <div>
            <p className="font-medium">Rule changes live the same day</p>
            <p className="mt-1 text-[13px] text-text-2">
              A policy change goes from {inputs.changeWeeksToday} weeks of specification, IT and testing
              to a same-day replay, approval and release.
            </p>
          </div>
          <div>
            <p className="font-medium">Every decision explainable</p>
            <p className="mt-1 text-[13px] text-text-2">
              Each recommendation carries the policy rule, the policy version and the evidence behind it.
            </p>
          </div>
        </div>
      </Card>

      {/* A. Executive summary */}
      <Section title="Executive summary">
        <ul className="space-y-2 text-[14px]">
          <li>
            <span className="font-medium">{eur0(e.netPerYear)} net saving a year</span>{" "}
            <span className="text-text-2">
              for a {n.toLocaleString("en-US")}-claim insurer after our licence, up to{" "}
              {eur0(up.netPerYear)}.
            </span>
          </li>
          <li>
            <span className="font-medium">Payback in {payback}</span>{" "}
            <span className="text-text-2">on a {eur0(inputs.implementation)} integration.</span>
          </li>
          <li>
            <span className="font-medium">{fteFreed.toFixed(1)} handlers freed for complex claims</span>{" "}
            <span className="text-text-2">without hiring, up to {upFteFreed.toFixed(1)}.</span>
          </li>
          <li>
            <span className="font-medium">Policy changes {changeFactor >= 2 ? `${Math.round(changeFactor)}× cheaper` : "cheaper"}</span>{" "}
            <span className="text-text-2">
              and live the same day: {eur0(change.today.total)} today vs {eur0(change.withSystem.total)} with Claim
              Compass.
            </span>
          </li>
        </ul>
      </Section>

      {/* B. ROI dashboard */}
      <Section title="ROI dashboard">
        <div className="kpi-strip grid grid-cols-4 gap-0">
          <Kpi label="Net saving per year" value={eurCompact(e.netPerYear)} sub={`up to ${eurCompact(up.netPerYear)}`} />
          <Kpi label="Payback" value={e.paybackMonths === null ? "—" : `${e.paybackMonths.toFixed(1)} mo`} sub={`on ${eur0(inputs.implementation)} integration`} />
          <Kpi label="3-year net value" value={eurCompact(threeYearNet)} sub="3 × net saving − integration" />
          <Kpi label="Return per €1 spent (3 years)" value={`€${returnPerEuro.toFixed(1)}`} sub="savings ÷ (integration + 3 years licence)" />
        </div>
      </Section>

      {/* C. Efficiency */}
      <Section title="Efficiency">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric value={`−${pct(timeCut)}`} name="Manual triage time" line={`Up to −${pct(upTimeCut)}. Handlers stop reading, sorting and routing every claim.`} accent />
          <Metric value={`${minToday} → ${minWith.toFixed(1)} min`} name="Handler minutes per claim" line="Averaged over all claims, including reviews and checks." />
          <Metric value={pct(instant)} name="Claims with an instant next step" line="Routine processing or a request for the missing facts, decided on arrival." />
          <Metric value={Math.round(hoursSaved).toLocaleString("en-US")} name="Handler hours saved a year" line="Time that moves from administration to judgement." />
        </div>
      </Section>

      {/* D. Cost savings */}
      <Section title="Cost savings">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric value={eurCompact(e.todayCost)} name="Triage cost today" line="Every claim read by a person at fully loaded handler cost." />
          <Metric value={eurCompact(e.withCost)} name="Triage cost with Claim Compass" line="Reviews, information requests, second checks and our licence." accent />
          <Metric value={`€${(e.netPerYear / n).toFixed(2)}`} name="Net saving per claim" line={`For a price of €${pricePerClaim.toFixed(2)} per claim.`} />
          <Metric value={eurCompact(change.today.total - change.withSystem.total)} name="Saved on every policy change" line="Less specification and IT work, no weeks of decisions on outdated rules." />
        </div>
      </Section>

      {/* E. Workforce */}
      <Section title="Workforce impact">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric value={`${fteFreed.toFixed(1)} FTE`} name="Handler capacity freed" line={`Up to ${upFteFreed.toFixed(1)} FTE, redeployed to complex claims and customers.`} accent />
          <Metric value={pct(reachReviewer)} name="Claims that reach a reviewer" line="Reviewers see the claims that need them, with the reason on top." />
          <Metric value={`${capacityMultiple.toFixed(1)}×`} name="Claim volume per triage team" line="The same team handles growth and peaks without new hires." />
          <Metric value={`${second > 0 ? pct(second, 1) : "0%"}`} name="Targeted second checks" line="Only routine claims just under the limit get a quick extra look." />
        </div>
      </Section>

      {/* F. Compliance & consistency */}
      <Section title="Compliance & consistency">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric value="Every decision" name="Rule, version and evidence recorded" line="Audit-ready: who, what, which policy version, and why." />
          <Metric value="Same claim, same answer" name="Deterministic decisions" line="The written policy decides; the batch engine and the app give identical results." />
          <Metric value="Never" name="Closed decisions changed by a rule update" line="Open claims are rechecked automatically; closed ones stay as decided." />
          <Metric value="Every override" name="Logged with reason and reviewer" line="Human judgement stays in control and becomes measurable." />
        </div>
      </Section>

      {/* Typical impact */}
      <Section title={`Typical impact for a mid-sized insurer (${n.toLocaleString("en-US")} claims a year)`}>
        <div className="grid gap-4 md:grid-cols-4">
          <BeforeAfter
            title="Time"
            gain={`−${Math.round(hoursSaved).toLocaleString("en-US")} h / year`}
            before={e.todayHours}
            after={e.withHours}
            beforeLabel={`${Math.round(e.todayHours).toLocaleString("en-US")} h`}
            afterLabel={`${Math.round(e.withHours).toLocaleString("en-US")} h`}
          />
          <BeforeAfter
            title="Cost"
            gain={`−${eurCompact(e.netPerYear)} / year`}
            before={e.todayCost}
            after={e.withCost}
            beforeLabel={eur0(e.todayCost)}
            afterLabel={eur0(e.withCost)}
          />
          <BeforeAfter
            title="Capacity"
            gain={`+${fteFreed.toFixed(1)} FTE for complex claims`}
            before={e.fteToday}
            after={e.fteWith}
            beforeLabel={`${e.fteToday.toFixed(1)} FTE on triage`}
            afterLabel={`${e.fteWith.toFixed(1)} FTE on triage`}
          />
          <BeforeAfter
            title="Customer experience"
            gain={`${pct(instant)} answered on arrival`}
            before={0}
            after={instant}
            beforeLabel="every claim waits in the queue"
            afterLabel={`${pct(instant)} get their next step at once`}
            higherIsBetter
          />
        </div>
      </Section>

      {/* G. Enterprise benefits */}
      <Section title="Enterprise benefits">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Faster answers for customers", "Simple claims move on the day they arrive; missing facts are requested immediately."],
            ["Lower leakage risk", "Clear triggers send risky claims to people; claims just under the limit get a second check."],
            ["Regulatory agility", "Policy owners change rules themselves, see the impact on every open claim first, then release."],
            ["Audit readiness", "Every decision, override and policy version is recorded and reproducible."],
            ["Growth without hiring", "Volume peaks after storms or price changes are absorbed by the same team."],
            ["Fits existing systems", "Works on claim data from existing systems through a batch interface and a web workspace."],
          ].map(([t, d]) => (
            <div key={t} className="card-quiet p-5">
              <p className="font-medium">{t}</p>
              <p className="mt-1 text-[13px] text-text-2">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* H. Investor takeaways */}
      <Section title="Investor takeaways">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric value={pct(customerKeeps)} name="Of the value stays with the customer" line="An easy yes for the buyer: the licence is a fraction of the saving." />
          <Metric value={eurCompact(inputs.platformPerYear)} name="Annual revenue per mid-sized insurer" line={`Plus ${eur0(inputs.implementation)} one-off integration.`} />
          <Metric value={`< ${Math.ceil(e.paybackMonths ?? 0)} months`} name="Payback for the buyer" line="Fits inside one budget year, which shortens sales cycles." />
          <Metric value="2 products" name="Triage automation + policy agility" line="Savings on every claim and on every rule change." />
        </div>
      </Section>

      {/* Backup */}
      <details className="card-quiet mt-8 p-6">
        <summary className="cursor-pointer text-[14px] font-medium">Backup for Q&amp;A: model, scenarios and assumptions</summary>

        <p className="mt-4 text-[13px] text-text-2">
          Formula: net saving = (today's triage hours − hours with the system) × hourly cost − licence. Hours
          with the system = claims × (review share × review minutes + information share × information minutes
          + second-check share × check minutes) ÷ 60. Hourly cost = salary × employer load ÷ productive hours ={" "}
          {eur0(e.hourly)}. Claim mix measured on {claimsText} under policy {active.version.toUpperCase()}.
          Fewer leaked claims are not included.
        </p>

        <h3 className="mt-5 text-[13.5px] font-medium">Scenarios</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-text-3">
                <th className="py-2 pr-4 font-medium">Scenario</th>
                <th className="py-2 pr-4 font-medium">Net saving / year</th>
                <th className="py-2 pr-4 font-medium">Payback</th>
                <th className="py-2 font-medium">What changes</th>
              </tr>
            </thead>
            <tbody>
              {SCENARIOS.map((s) => (
                <tr key={s.key} className="border-t border-line align-top">
                  <td className="py-2 pr-4 font-medium">{s.title}</td>
                  <td className="num py-2 pr-4">{eur0(all[s.key].e.netPerYear)}</td>
                  <td className="num py-2 pr-4">
                    {all[s.key].e.paybackMonths === null ? "—" : `${all[s.key].e.paybackMonths?.toFixed(1)} mo`}
                  </td>
                  <td className="py-2 text-text-2">{s.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-5 text-[13.5px] font-medium">Sensitivities</h3>
        <ul className="mt-2 space-y-1.5 text-[13px] text-text-2">
          <li>Break-even: manual triage at {breakEvenMin.toFixed(1)} min per claim (we assume {inputs.triageMinToday}). A two-week time study settles it.</li>
          <li>Information requests written by hand (8 min): net saving {eur0(manualInfo.netPerYear)} instead of {eur0(e.netPerYear)}.</li>
          <li>Integration at twice the estimate: payback {doubleIntegration === null ? "—" : `${doubleIntegration.toFixed(1)} months`}.</li>
          <li>Claim mix from {source === "live" ? "the claims in the system, generated for the demo" : "generated demo claims"}; a pilot measures the real mix in shadow mode.</li>
        </ul>

        <h3 className="mt-5 text-[13.5px] font-medium">Every input</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-text-3">
                <th className="py-2 pr-4 font-medium">Input</th>
                <th className="py-2 pr-4 font-medium">Base value</th>
                <th className="py-2 pr-4 font-medium">Kind</th>
                <th className="py-2 font-medium">Why this value</th>
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
        <p className="mt-4 text-[12.5px] text-text-2">
          Sliders for every input are on the{" "}
          <Link to="/business-case" className="text-link hover:underline">Business case</Link> page; decision accuracy
          before and after the policy change is on the{" "}
          <Link to="/quality" className="text-link hover:underline">quality report</Link>.
        </p>
      </details>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="section-title mb-3">{title}</h2>
      {children}
    </section>
  );
}
