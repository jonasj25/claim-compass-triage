import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BATCH_POLICY_V1, BATCH_POLICY_V2 } from "@/lib/batch";
import { isClosed } from "@/lib/csv";
import {
  defaultInputs,
  eur0,
  eurCompact,
  pct,
  policyChangeCost,
  triageEconomics,
  type Inputs,
} from "@/lib/business";
import { volumeMix, VOLUME_CLAIMS, type Mix } from "@/lib/quality";
import { secondCheckReason } from "@/lib/second-check";
import { decide, type Claim, type Policy } from "@/lib/triage";
import { Card, Kpi, PageHeader } from "@/components/triage/ui";
import { REC_COLOR, SERIES } from "@/components/triage/charts";
import { cn } from "@/lib/utils";

// Investor view: the business case on one screen for a 4-minute pitch.
// Uses the same model as the Business case page (triageEconomics, policyChangeCost) with the
// claim mix measured by replaying policy v2 on the synthetic volume set. Adds the cost of the
// random QA sample of auto-processed claims, so the headline is slightly more conservative.
// Quality savings (fewer leaked claims) are deliberately NOT in the headline.

export const Route = createFileRoute("/_authenticated/pitch")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Investor view — Clearpath" },
      { property: "og:description", content: "The business case in one screen: savings, payback, proof plan and risks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Investor view — Clearpath" },
      {
        name: "description",
        content: "Savings, payback, unit economics, proof plan and the weak points of the business case.",
      },
    ],
  }),
  component: Pitch,
});

type ScenarioKey = "conservative" | "base" | "optimistic";

const SCENARIOS: {
  key: ScenarioKey;
  title: string;
  blurb: string;
  overrides: Partial<Inputs>;
}[] = [
  {
    key: "conservative",
    title: "Conservative",
    blurb:
      "Triage is fast today (12 min), information requests stay manual (8 min), licence €150k, integration €200k.",
    overrides: { triageMinToday: 12, reviewMin: 15, infoMin: 8, platformPerYear: 150000, implementation: 200000 },
  },
  {
    key: "base",
    title: "Base case",
    blurb: "The defaults on the Business case page: 15 min triage today, automatic information requests.",
    overrides: {},
  },
  {
    key: "optimistic",
    title: "Optimistic",
    blurb: "Triage is slow today (18 min) and escalated claims arrive pre-sorted (12 min review), licence €100k.",
    overrides: { triageMinToday: 18, reviewMin: 12, platformPerYear: 100000 },
  },
];

function secondShare(claims: Claim[], policy: Policy) {
  const open = claims.filter((c) => !isClosed(c.case_status));
  if (!open.length) return 0;
  return (
    open.filter((c) => secondCheckReason(c, policy, decide(c, policy).recommendation)).length /
    open.length
  );
}

function model(i: Inputs, mix: Mix, second: number) {
  const e = triageEconomics(i, mix, second);
  const qaHours = (i.claimsPerYear * mix.share.routine_processing * i.qaShare * i.checkMin) / 60;
  const qaCost = qaHours * e.hourly;
  const peopleWith = e.withPeopleCost + qaCost;
  const gross = e.todayCost - peopleWith; // value created before our licence
  const net = gross - i.platformPerYear;
  const hoursSaved = e.todayHours - e.withHours - qaHours;
  const perClaimMinutesWith = ((e.withHours + qaHours) * 60) / i.claimsPerYear;
  return {
    e,
    qaCost,
    peopleWith,
    gross,
    net,
    hoursSaved,
    fteFreed: hoursSaved / i.productiveHours,
    timeCut: e.todayHours > 0 ? hoursSaved / e.todayHours : 0,
    paybackMonths: net > 0 ? (i.implementation / net) * 12 : null,
    // Today's triage time at which the customer only breaks even
    breakEvenMin: perClaimMinutesWith + (i.platformPerYear / e.hourly / i.claimsPerYear) * 60,
    reviewCost: e.breakdown.review * e.hourly,
    infoCost: e.breakdown.info * e.hourly,
    checksCost: e.breakdown.checks * e.hourly + qaCost,
  };
}

function Pitch() {
  const [scenario, setScenario] = useState<ScenarioKey>("base");
  const mix = useMemo(() => volumeMix(BATCH_POLICY_V2, BATCH_POLICY_V1, VOLUME_CLAIMS), []);
  const second = useMemo(() => secondShare(VOLUME_CLAIMS, BATCH_POLICY_V2), []);

  const all = useMemo(() => {
    const out = {} as Record<ScenarioKey, { inputs: Inputs; m: ReturnType<typeof model> }>;
    for (const s of SCENARIOS) {
      const inputs = { ...defaultInputs(), ...s.overrides } as Inputs;
      out[s.key] = { inputs, m: model(inputs, mix, second) };
    }
    return out;
  }, [mix, second]);

  const { inputs, m } = all[scenario];
  const base = all.base;
  const change = policyChangeCost(inputs, mix);
  const manualInfo = model({ ...base.inputs, infoMin: 8 }, mix, second);
  const doubleIntegration = base.m.net > 0 ? ((base.inputs.implementation * 2) / base.m.net) * 12 : null;

  const pricePerClaim = inputs.platformPerYear / inputs.claimsPerYear;
  const valuePerClaim = m.gross / inputs.claimsPerYear;
  const customerKeeps = m.gross > 0 ? Math.max(0, m.net) / m.gross : 0;

  const today = m.e.todayCost;
  const seg = (v: number) => `${Math.max(0, (v / today) * 100)}%`;
  const parts = [
    { label: "Escalated reviews", value: m.reviewCost, color: REC_COLOR.human_review },
    { label: "Information requests", value: m.infoCost, color: REC_COLOR.request_information },
    { label: "Second checks + QA sample", value: m.checksCost, color: SERIES.mid },
    { label: "Our licence", value: inputs.platformPerYear, color: SERIES.soft },
    { label: "Saved", value: Math.max(0, m.net), color: REC_COLOR.routine_processing },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Ops lead"
        title="Investor view"
        sub="The business case in one screen. A model with stated assumptions, not a measured result: the pilot below is how we measure it."
      />

      {/* Scenario switch */}
      <div className="card-quiet mb-6 flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-[13.5px]">
        <p className="max-w-[60ch] text-text-2">
          {SCENARIOS.find((s) => s.key === scenario)?.blurb}
        </p>
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
          For a motor insurer with {inputs.claimsPerYear.toLocaleString("en-US")} own-damage claims a
          year, we cut manual triage time by <span className="font-semibold">{pct(m.timeCut)}</span> and
          save <span className="font-semibold">{eur0(m.net)}</span> a year after our licence
          {m.paybackMonths !== null && (
            <>
              , paying back the integration in{" "}
              <span className="font-semibold">{m.paybackMonths.toFixed(1)} months</span>
            </>
          )}
          .
        </p>
        <p className="mt-2 text-[12.5px] text-text-2">
          Range across scenarios: {eurCompact(all.conservative.m.net)} to {eurCompact(all.optimistic.m.net)} a
          year. Fewer leaked claims and faster customers are upside, not included.
        </p>
      </Card>

      <div className="kpi-strip grid grid-cols-4 gap-0">
        <Kpi
          label="Net saving per year"
          value={eurCompact(m.net)}
          sub={`${eur0(today)} today → ${eur0(m.peopleWith + inputs.platformPerYear)}`}
        />
        <Kpi
          label="Payback"
          value={m.paybackMonths === null ? "—" : `${m.paybackMonths.toFixed(1)} mo`}
          sub={`on ${eur0(inputs.implementation)} integration`}
        />
        <Kpi
          label="Net saving per claim"
          value={`€${(m.net / inputs.claimsPerYear).toFixed(2)}`}
          sub={`for a price of €${pricePerClaim.toFixed(2)} per claim`}
        />
        <Kpi
          label="Handler capacity freed"
          value={`${m.fteFreed.toFixed(1)} FTE`}
          sub={`${Math.round(m.hoursSaved).toLocaleString("en-US")} hours a year`}
        />
      </div>

      {/* Where today's triage euro goes */}
      <Card className="mt-6">
        <h2 className="section-title">Where every euro of today's triage cost goes</h2>
        <p className="mt-1 text-[13px] text-text-2">
          Today: {eur0(today)} a year, every claim read by a person. With the system, people only
          handle the claims that need them ({pct(mix.share.human_review)} escalated,{" "}
          {pct(mix.share.request_information)} missing information, measured by replaying policy{" "}
          {BATCH_POLICY_V2.version.toUpperCase()} on {mix.open} open claims).
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
              {p.label}: <span className="num font-medium">{eurCompact(p.value)}</span>
              <span className="text-text-3">({pct(p.value / today)})</span>
            </span>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Unit economics */}
        <Card>
          <h2 className="section-title">Unit economics</h2>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-[13.5px]">
            <dt className="text-text-2">Value created per claim (before our licence)</dt>
            <dd className="num font-medium">€{valuePerClaim.toFixed(2)}</dd>
            <dt className="text-text-2">Our price per claim (licence ÷ claims)</dt>
            <dd className="num font-medium">€{pricePerClaim.toFixed(2)}</dd>
            <dt className="text-text-2">Share of the value the insurer keeps</dt>
            <dd className="num font-medium">{pct(customerKeeps)}</dd>
            <dt className="text-text-2">Revenue per customer of this size</dt>
            <dd className="num font-medium">
              {eurCompact(inputs.platformPerYear)}/yr + {eurCompact(inputs.implementation)} once
            </dd>
          </dl>
          <p className="mt-3 text-[12.5px] text-text-2">
            Price grows with claim volume, so revenue scales with the customer, and the customer
            always keeps most of the saving.
          </p>
        </Card>

        {/* Policy change */}
        <Card>
          <h2 className="section-title">The second product: policy changes in hours</h2>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-[13.5px]">
            <dt className="text-text-2">One rule change today ({inputs.changeWeeksToday} weeks, {inputs.changePersonDays} person-days)</dt>
            <dd className="num font-medium">{eur0(change.today.total)}</dd>
            <dt className="text-text-2">Same change with us (draft, replay, approve, same day)</dt>
            <dd className="num font-medium">{eur0(change.withSystem.total)}</dd>
            <dt className="text-text-2">Of which: claims decided on outdated rules while waiting</dt>
            <dd className="num font-medium">{eur0(change.today.exposure)}</dd>
          </dl>
          <p className="mt-3 text-[12.5px] text-text-2">
            Not in the headline. Every regulatory or business rule change is extra value on top.
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
              Time 200 manual triages. Replaces our {base.inputs.triageMinToday}-minute assumption
              with a measured number.
            </p>
          </li>
          <li>
            <p className="font-medium">Weeks 1–6 · Shadow mode</p>
            <p className="mt-1 text-text-2">
              The system runs next to the handlers on the same claims without acting. Agreement,
              disagreements and who was right, case by case.
            </p>
          </li>
          <li>
            <p className="font-medium">Months 2–4 · Staggered rollout</p>
            <p className="mt-1 text-text-2">
              One team live, one team as control. Go-live gate: wrong-routine rate no higher than
              today's.
            </p>
          </li>
        </ol>
      </Card>

      {/* Weak points */}
      <Card className="mt-6">
        <h2 className="section-title">Weak points we state before you ask</h2>
        <ul className="mt-3 space-y-2 text-[13.5px]">
          <li>
            <span className="font-medium">Today's triage time is the key assumption.</span>{" "}
            <span className="text-text-2">
              The base case only breaks even if today's triage takes{" "}
              {base.m.breakEvenMin.toFixed(1)} minutes or less per claim; we assume{" "}
              {base.inputs.triageMinToday}. The time study settles it in two weeks.
            </span>
          </li>
          <li>
            <span className="font-medium">Information requests are not yet sent automatically.</span>{" "}
            <span className="text-text-2">
              If they stay manual (8 min each), the base saving falls from {eurCompact(base.m.net)} to{" "}
              {eurCompact(manualInfo.net)} a year.
            </span>
          </li>
          <li>
            <span className="font-medium">Integration is the real cost.</span>{" "}
            <span className="text-text-2">
              If it costs twice our estimate, payback moves from{" "}
              {base.m.paybackMonths?.toFixed(1) ?? "—"} to {doubleIntegration?.toFixed(1) ?? "—"} months.
            </span>
          </li>
          <li>
            <span className="font-medium">The claim mix comes from synthetic data.</span>{" "}
            <span className="text-text-2">
              {pct(mix.share.routine_processing)} auto-processed is a replay on {VOLUME_CLAIMS.length} generated
              claims. A real insurer's mix, and its own policy, set the ceiling for the saving.
            </span>
          </li>
          <li>
            <span className="font-medium">We include quality-control costs others leave out.</span>{" "}
            <span className="text-text-2">
              A {pct(inputs.qaShare)} random check of auto-processed claims costs {eur0(m.qaCost)} a year
              and is already subtracted.
            </span>
          </li>
        </ul>
        <p className="mt-4 text-[12.5px] text-text-2">
          Every input is listed with its source and can be changed on the{" "}
          <Link to="/business-case" className="text-link hover:underline">
            Business case
          </Link>{" "}
          page.
        </p>
      </Card>
    </div>
  );
}
