import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { BATCH_POLICY_V1, BATCH_POLICY_V2 } from "@/lib/batch";
import { isClosed } from "@/lib/csv";
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
import { volumeMix, VOLUME_CLAIMS } from "@/lib/quality";
import { secondCheckReason } from "@/lib/second-check";
import { decide, type Claim, type Policy } from "@/lib/triage";
import { Card, Kpi, PageHeader } from "@/components/triage/ui";
import { KindBadge, REC_COLOR, SERIES } from "@/components/triage/charts";
import { cn } from "@/lib/utils";

// Investor view: the business case on one screen for a 4-minute pitch.
// Same model and same numbers as the Business case page (triageEconomics, policyChangeCost),
// with the claim mix measured by replaying policy v2 on the synthetic volume set.
// Every number shown is explained in "Where every number comes from" at the bottom.
// Quality savings (fewer leaked claims) are deliberately NOT in the headline.

export const Route = createFileRoute("/_authenticated/pitch")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Investor view — Clearpath" },
      { property: "og:description", content: "The business case in one screen, with the reason behind every number." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Investor view — Clearpath" },
      {
        name: "description",
        content: "Savings, payback, unit economics, proof plan, weak points and the source of every number.",
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
  blurb: string;
  overrides: Partial<Record<Key, number>>;
  why: Partial<Record<Key, string>>;
}[] = [
  {
    key: "conservative",
    title: "Conservative",
    blurb: "Everything set against us: fast triage today, manual information requests, higher costs.",
    overrides: { triageMinToday: 12, infoMin: 8, platformPerYear: 150000, implementation: 200000 },
    why: {
      triageMinToday: "Lower end: some insurers already triage simple claims quickly with forms and checklists.",
      infoMin: "Our prototype does not send emails yet, so a handler writes each request by hand.",
      platformPerYear: "+25%: enterprise licences, hosting and support often cost more than planned.",
      implementation: "+33%: integration with claims and policy systems usually overruns.",
    },
  },
  {
    key: "base",
    title: "Base case",
    blurb: "The defaults of the Business case page. This is the number we say on stage.",
    overrides: {},
    why: {},
  },
  {
    key: "optimistic",
    title: "Optimistic",
    blurb: "Slow manual triage today and faster reviews thanks to pre-sorted evidence.",
    overrides: { triageMinToday: 18, reviewMin: 12, platformPerYear: 100000 },
    why: {
      triageMinToday: "Upper end: claim data spread over several systems makes manual triage slow.",
      reviewMin: "Escalated claims arrive with the trigger, the evidence and the missing facts already listed.",
      platformPerYear: "Early-customer price.",
    },
  },
];

const srcById = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

function secondShare(claims: Claim[], policy: Policy) {
  const open = claims.filter((c) => !isClosed(c.case_status));
  if (!open.length) return 0;
  return (
    open.filter((c) => secondCheckReason(c, policy, decide(c, policy).recommendation)).length /
    open.length
  );
}

function fmtVal(a: Assumption, v: number) {
  if (a.unit === "€/year") return `${eur0(v)} / year`;
  if (a.unit === "€/day") return `${eur0(v)} / day`;
  if (a.unit === "€") return eur0(v);
  if (a.unit === "×") return `×${v}`;
  if (a.unit === "of claim") return `${pct(v)} of the claim`;
  return `${v.toLocaleString("en-US")} ${a.unit}`;
}

function Pitch() {
  const [scenario, setScenario] = useState<ScenarioKey>("base");
  const mix = useMemo(() => volumeMix(BATCH_POLICY_V2, BATCH_POLICY_V1, VOLUME_CLAIMS), []);
  const second = useMemo(() => secondShare(VOLUME_CLAIMS, BATCH_POLICY_V2), []);

  const all = useMemo(() => {
    const out = {} as Record<ScenarioKey, { inputs: Inputs; e: ReturnType<typeof triageEconomics> }>;
    for (const s of SCENARIOS) {
      const inputs = { ...defaultInputs(), ...s.overrides } as Inputs;
      out[s.key] = { inputs, e: triageEconomics(inputs, mix, second) };
    }
    return out;
  }, [mix, second]);

  const current = SCENARIOS.find((s) => s.key === scenario) ?? SCENARIOS[1];
  const { inputs, e } = all[scenario];
  const base = all.base;
  const n = inputs.claimsPerYear;
  const change = policyChangeCost(inputs, mix);

  const hoursSaved = e.todayHours - e.withHours;
  const timeCut = e.todayHours > 0 ? hoursSaved / e.todayHours : 0;
  const gross = e.todayCost - e.withPeopleCost; // value created before our licence
  const pricePerClaim = inputs.platformPerYear / n;
  const customerKeeps = gross > 0 ? Math.max(0, e.netPerYear) / gross : 0;

  // What-ifs on the base case, all computed with the same model
  const baseMinutesWith = (base.e.withHours * 60) / base.inputs.claimsPerYear;
  const breakEvenMin =
    baseMinutesWith + (base.inputs.platformPerYear / base.e.hourly / base.inputs.claimsPerYear) * 60;
  const manualInfo = triageEconomics({ ...base.inputs, infoMin: 8 }, mix, second);
  const doubleIntegration =
    base.e.netPerYear > 0 ? ((base.inputs.implementation * 2) / base.e.netPerYear) * 12 : null;

  const today = e.todayCost;
  const seg = (v: number) => `${today > 0 ? Math.max(0, (v / today) * 100) : 0}%`;
  const parts = [
    { label: "Escalated reviews", value: e.breakdown.review * e.hourly, color: SERIES.primary },
    { label: "Information requests", value: e.breakdown.info * e.hourly, color: SERIES.mid },
    { label: "Second checks", value: e.breakdown.checks * e.hourly, color: SERIES.light },
    { label: "Our licence", value: inputs.platformPerYear, color: SERIES.grey },
    { label: "Saved", value: Math.max(0, e.netPerYear), color: REC_COLOR.routine_processing },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Ops lead"
        title="Investor view"
        sub="The business case in one screen. It is a model with stated assumptions, not a measured result; the proof plan shows how a pilot measures it."
      />

      {/* Scenario switch */}
      <div className="card-quiet mb-6 flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-[13.5px]">
        <p className="max-w-[60ch] text-text-2">{current.blurb}</p>
        <div className="flex items-center gap-1 rounded-full bg-surface-2 p-0.5 text-[12px] ring-1 ring-line">
          {SCENARIOS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setScenario(s.key)}
              className={cn(
                "rounded-full px-3 py-1",
                scenario === s.key ? "bg-surface font-medium shadow-[var(--shadow-lift)]" : "text-text-2",
              )}
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>

      {/* Headline */}
      <Card className="mb-6">
        <p className="text-[12px] font-medium uppercase tracking-wide text-text-3">The one sentence</p>
        <p className="mt-2 text-[20px] leading-snug">
          For a motor insurer with {n.toLocaleString("en-US")} own-damage claims a year, we cut manual
          triage time by <span className="font-semibold">{pct(timeCut)}</span> and save{" "}
          <span className="font-semibold">{eur0(e.netPerYear)}</span> a year after our licence
          {e.paybackMonths !== null && (
            <>
              , paying back the integration in{" "}
              <span className="font-semibold">{e.paybackMonths.toFixed(1)} months</span>
            </>
          )}
          .
        </p>
        <p className="mt-2 text-[12.5px] text-text-2">
          Range across the three scenarios: {eur0(all.conservative.e.netPerYear)} to{" "}
          {eur0(all.optimistic.e.netPerYear)} a year. Fewer leaked claims and faster answers for
          customers are upside and not included.
        </p>
      </Card>

      <div className="kpi-strip grid grid-cols-4 gap-0">
        <Kpi
          label="Net saving per year"
          value={eurCompact(e.netPerYear)}
          sub={`${eur0(today)} today → ${eur0(e.withCost)} incl. licence`}
        />
        <Kpi
          label="Payback"
          value={e.paybackMonths === null ? "—" : `${e.paybackMonths.toFixed(1)} mo`}
          sub={`integration ${eur0(inputs.implementation)} ÷ net saving × 12`}
        />
        <Kpi
          label="Net saving per claim"
          value={`€${(e.netPerYear / n).toFixed(2)}`}
          sub={`net saving ÷ ${n.toLocaleString("en-US")} claims`}
        />
        <Kpi
          label="Handler capacity freed"
          value={`${(e.fteToday - e.fteWith).toFixed(1)} FTE`}
          sub={`${Math.round(hoursSaved).toLocaleString("en-US")} h ÷ ${inputs.productiveHours.toLocaleString("en-US")} h per person`}
        />
      </div>

      {/* Where today's triage euro goes */}
      <Card className="mt-6">
        <h2 className="section-title">Where every euro of today's triage cost goes</h2>
        <p className="mt-1 text-[13px] text-text-2">
          Today every claim is read by a person: {eur0(today)} a year. With the system people only
          handle claims that need them: {pct(mix.share.human_review)} go to review and{" "}
          {pct(mix.share.request_information)} need missing information. Both shares are measured by
          replaying policy {BATCH_POLICY_V2.version.toUpperCase()} on {mix.open} open claims.
        </p>
        <div className="mt-4 flex h-9 w-full overflow-hidden rounded-md ring-1 ring-line">
          {parts.map((p) => (
            <div key={p.label} title={`${p.label}: ${eur0(p.value)}`} style={{ width: seg(p.value), background: p.color }} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
          {parts.map((p) => (
            <span key={p.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} />
              {p.label}: <span className="num font-medium">{eur0(p.value)}</span>
              <span className="text-text-3">({today > 0 ? pct(p.value / today) : "—"})</span>
            </span>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="section-title">Unit economics</h2>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-[13.5px]">
            <dt className="text-text-2">Value created per claim (saving before our licence)</dt>
            <dd className="num font-medium">€{(gross / n).toFixed(2)}</dd>
            <dt className="text-text-2">Our price per claim (licence ÷ claims)</dt>
            <dd className="num font-medium">€{pricePerClaim.toFixed(2)}</dd>
            <dt className="text-text-2">Share of the value the insurer keeps (net ÷ value created)</dt>
            <dd className="num font-medium">{pct(customerKeeps)}</dd>
            <dt className="text-text-2">Revenue from one customer of this size</dt>
            <dd className="num font-medium">
              {eur0(inputs.platformPerYear)} / year + {eur0(inputs.implementation)} once
            </dd>
          </dl>
          <p className="mt-3 text-[12.5px] text-text-2">
            The price is per claim, so revenue grows with the customer, and the customer always keeps
            most of the saving.
          </p>
        </Card>

        <Card>
          <h2 className="section-title">Second benefit: rule changes in hours, not weeks</h2>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-[13.5px]">
            <dt className="text-text-2">
              One rule change today: {inputs.changePersonDays} person-days × {eur0(inputs.dayRate)}, plus{" "}
              {inputs.changeWeeksToday} weeks of claims decided on old rules
            </dt>
            <dd className="num font-medium">{eur0(change.today.total)}</dd>
            <dt className="text-text-2">
              Same change with us: {inputs.changeHoursWithSystem} hours, live the same day
            </dt>
            <dd className="num font-medium">{eur0(change.withSystem.total)}</dd>
          </dl>
          <p className="mt-3 text-[12.5px] text-text-2">
            Measured on the {BATCH_POLICY_V2.version.toUpperCase()} change: {pct(change.staleShare)} of
            open claims would have stayed routine under the old rules although the new rules send them
            to a person. Not included in the headline.
          </p>
        </Card>
      </div>

      {/* Proof plan */}
      <Card className="mt-6">
        <h2 className="section-title">How we prove it with the customer's own claims</h2>
        <ol className="mt-3 grid gap-4 text-[13.5px] md:grid-cols-3">
          <li>
            <p className="font-medium">Weeks 1–2 · Time study</p>
            <p className="mt-1 text-text-2">
              Time 200 manual triages. Replaces our {base.inputs.triageMinToday}-minute assumption,
              the one input everything depends on, with a measured number.
            </p>
          </li>
          <li>
            <p className="font-medium">Weeks 1–6 · Shadow mode</p>
            <p className="mt-1 text-text-2">
              The system runs next to the handlers on the same claims without acting: agreement,
              disagreements and who was right, case by case.
            </p>
          </li>
          <li>
            <p className="font-medium">Months 2–4 · Staggered rollout</p>
            <p className="mt-1 text-text-2">
              One team live, one comparable team as control. Go-live gate: the wrong-routine rate is
              no higher than today's.
            </p>
          </li>
        </ol>
        <p className="mt-4 text-[12.5px] text-text-2">
          Decision accuracy on the labelled claims, before and after the policy change, is on the{" "}
          <Link to="/quality" className="text-link hover:underline">
            quality report
          </Link>
          .
        </p>
      </Card>

      {/* Weak points */}
      <Card className="mt-6">
        <h2 className="section-title">Weak points we state before you ask</h2>
        <ul className="mt-3 space-y-2 text-[13.5px]">
          <li>
            <span className="font-medium">Today's triage time is the key assumption.</span>{" "}
            <span className="text-text-2">
              The base case breaks even if manual triage takes {breakEvenMin.toFixed(1)} minutes per
              claim; we assume {base.inputs.triageMinToday}. The time study settles it in two weeks.
            </span>
          </li>
          <li>
            <span className="font-medium">Information requests are not sent automatically yet.</span>{" "}
            <span className="text-text-2">
              If a handler writes each one (8 min instead of {base.inputs.infoMin}), the base saving
              falls from {eur0(base.e.netPerYear)} to {eur0(manualInfo.netPerYear)} a year.
            </span>
          </li>
          <li>
            <span className="font-medium">Integration is the real cost.</span>{" "}
            <span className="text-text-2">
              If it costs twice our estimate, payback moves from{" "}
              {base.e.paybackMonths?.toFixed(1) ?? "—"} to {doubleIntegration?.toFixed(1) ?? "—"} months.
            </span>
          </li>
          <li>
            <span className="font-medium">The claim mix comes from synthetic data.</span>{" "}
            <span className="text-text-2">
              {pct(mix.share.routine_processing)} auto-processed comes from replaying the policy on{" "}
              {VOLUME_CLAIMS.length} generated claims. A real insurer's claims and its own policy set the
              ceiling for the saving.
            </span>
          </li>
        </ul>
      </Card>

      {/* Every number explained */}
      <Card className="mt-6">
        <h2 className="section-title">Where every number comes from</h2>
        <p className="mt-1 text-[13px] text-text-2">
          Formula: net saving = (today's triage hours − hours with the system) × hourly cost − licence.
          Hours with the system = claims × (review share × review minutes + information share ×
          information minutes + second-check share × check minutes) ÷ 60. Hourly cost = salary ×
          employer load ÷ productive hours = {eur0(e.hourly)}.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-text-3">
                <th className="py-2 pr-4 font-medium">Input</th>
                <th className="py-2 pr-4 font-medium">Value</th>
                <th className="py-2 pr-4 font-medium">Kind</th>
                <th className="py-2 font-medium">Why this value</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line align-top">
                <td className="py-2 pr-4">Share sent to review / information / routine</td>
                <td className="num py-2 pr-4">
                  {pct(mix.share.human_review)} / {pct(mix.share.request_information)} /{" "}
                  {pct(mix.share.routine_processing)}
                </td>
                <td className="py-2 pr-4">
                  <KindBadge kind="measured" />
                </td>
                <td className="py-2 text-text-2">
                  Our engine applied to {mix.open} open claims under policy{" "}
                  {BATCH_POLICY_V2.version.toUpperCase()}.
                </td>
              </tr>
              <tr className="border-t border-line align-top">
                <td className="py-2 pr-4">Share needing a second check</td>
                <td className="num py-2 pr-4">{pct(second, 1)}</td>
                <td className="py-2 pr-4">
                  <KindBadge kind="measured" />
                </td>
                <td className="py-2 text-text-2">
                  Routine claims just below the quote limit, counted on the same claims.
                </td>
              </tr>
              {DEFAULT_ASSUMPTIONS.map((a) => {
                const v = inputs[a.key];
                const reason = current.why[a.key];
                const src = a.source ? srcById[a.source] : undefined;
                return (
                  <tr key={a.key} className="border-t border-line align-top">
                    <td className="py-2 pr-4">{a.label}</td>
                    <td className={cn("num py-2 pr-4", reason && "font-semibold")}>{fmtVal(a, v)}</td>
                    <td className="py-2 pr-4">
                      <KindBadge kind={a.kind} />
                    </td>
                    <td className="py-2 text-text-2">
                      {reason ? (
                        <>
                          <span className="font-medium text-foreground">{current.title}: </span>
                          {reason}
                        </>
                      ) : (
                        a.note
                      )}
                      {src && (
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1.5 inline-flex items-center gap-0.5 text-link hover:underline"
                        >
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
          The same inputs can be changed with sliders on the{" "}
          <Link to="/business-case" className="text-link hover:underline">
            Business case
          </Link>{" "}
          page; the base case here always equals that page's defaults.
        </p>
      </Card>
    </div>
  );
}
