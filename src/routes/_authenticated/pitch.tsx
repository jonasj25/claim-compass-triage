import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { BATCH_POLICY_V1, BATCH_POLICY_V2 } from "@/lib/batch";
import {
  breakEvenProbability,
  DEFAULT_ASSUMPTIONS,
  defaultInputs,
  eur0,
  eurCompact,
  pct,
  policyChangeCost,
  SOURCES,
  triageEconomics,
  unnecessaryReviewCost,
  wrongRoutineCost,
  type Assumption,
} from "@/lib/business";
import { isClosed } from "@/lib/csv";
import { labelledReport, VOLUME_CLAIMS, volumeMix } from "@/lib/quality";
import { secondCheckReason } from "@/lib/second-check";
import { decide } from "@/lib/triage";
import { Card, Kpi, PageHeader } from "@/components/triage/ui";
import { KindBadge } from "@/components/triage/charts";
import { cn } from "@/lib/utils";

// Value & ROI: the business case in one page, answering the three questions of the brief in order:
// 1) annual cost of triage today vs with the system, net benefit, payback
// 2) cost of errors from the measured v1 / v2 error rates, and how that sets the thresholds
// 3) cost of a policy change today vs with the system (v2 as the example)
// Fixed, reproducible inputs: the 500-claim demo mix and the labelled test set (not the live claims, which
// change during a demo). Every number recalculates on the Business case page from the same model.

export const Route = createFileRoute("/_authenticated/pitch")({
  head: () => ({
    meta: [
      { title: "Value & ROI — Clearpath" },
      { name: "description", content: "What Clearpath is worth to a mid-sized European motor insurer, from transparent assumptions." },
    ],
  }),
  component: ValueRoi,
});

const srcById = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
const byKey = Object.fromEntries(DEFAULT_ASSUMPTIONS.map((a) => [a.key, a])) as Record<Assumption["key"], Assumption>;

/** 95% upper bound for an error rate when 0 errors were seen in n cases ("rule of three") */
const upperBoundZero = (n: number) => (n ? 3 / n : 0);

function ValueRoi() {
  const m = useMemo(() => {
    const i = defaultInputs();
    const mix = volumeMix(BATCH_POLICY_V2, BATCH_POLICY_V1);
    const open = VOLUME_CLAIMS.filter((c) => !isClosed(c.case_status));
    const second = open.filter((c) => secondCheckReason(c, BATCH_POLICY_V2, decide(c, BATCH_POLICY_V2).recommendation)).length;
    const econ = triageEconomics(i, mix, open.length ? second / open.length : 0);
    const q = labelledReport();
    const change = policyChangeCost(i, mix);
    return { i, mix, econ, q, change, wrong: wrongRoutineCost(i), unnecessary: unnecessaryReviewCost(i), be: breakEvenProbability(i) };
  }, []);
  const { i, mix, econ, q, change } = m;

  const rows = [
    { name: "v1 rules, before the change", metric: q.v1, note: "v1 labels, all claims" },
    { name: "v1 rules kept after the change", metric: q.keepV1, note: "stale rules, judged by v2", bad: true },
    { name: "v2 rules", metric: q.v2, note: "after the update" },
  ];
  const ratio = Math.round(m.wrong / m.unnecessary);

  return (
    <div>
      <PageHeader
        eyebrow="Ops lead"
        title="Value & ROI"
        sub={
          <>
            A mid-sized European motor insurer with {i.claimsPerYear.toLocaleString("en-US")} small own-damage claims a year (glass, parking,
            minor bodywork). The three questions of the business case, in order. Every input is listed at the bottom and can be changed on{" "}
            <Link to="/business-case" className="text-link hover:underline">
              Business case
            </Link>
            .
          </>
        }
      />

      {/* 1 — Annual cost of triage */}
      <Section n={1} title="Annual cost of triage" lead="People time to decide the next step for every claim, plus what the system costs to run.">
        <div className="kpi-strip grid grid-cols-2 gap-0 lg:grid-cols-4">
          <Kpi label="Triage cost today" value={eurCompact(econ.todayCost)} sub={`${i.triageMinToday} min per claim by hand`} />
          <Kpi label="With Clearpath" value={eurCompact(econ.withCost)} sub={`people ${eurCompact(econ.withPeopleCost)} + platform ${eurCompact(i.platformPerYear)}`} />
          <Kpi label="Net benefit per year" value={eurCompact(econ.netPerYear)} sub={`${(econ.fteToday - econ.fteWith).toFixed(1)} FTE freed for real reviews`} />
          <Kpi label="Payback" value={econ.paybackMonths === null ? "—" : `${econ.paybackMonths.toFixed(1)} months`} sub={`on ${eurCompact(i.implementation)} one-off implementation`} />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <CompareBar label="Today" value={econ.todayCost} max={econ.todayCost} tone="bg-text-3/50" />
            <CompareBar label="With Clearpath" value={econ.withCost} max={econ.todayCost} tone="bg-link" />
          </div>
          <ul className="space-y-1.5 text-[13px] text-text-2">
            <li>
              <span className="text-foreground">{pct(econ.automation)}</span> of claims need no reviewer: {pct(mix.share.routine_processing)} go straight to
              processing, {pct(mix.share.request_information)} get an automatic request for the missing facts.
            </li>
            <li>
              <span className="text-foreground">{pct(mix.share.human_review)}</span> still go to a person ({i.reviewMin} min each); routine claims close to the
              limit get a short second check.
            </li>
            <li>Not counted: faster payouts, fewer customer calls, and the error savings below.</li>
          </ul>
        </div>
      </Section>

      {/* 2 — Cost of errors */}
      <Section
        n={2}
        title="Cost of errors"
        lead="Measured on the labelled test set (provided dev cases + hand-labelled edge cases). Priced with the unit costs below."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.06em] text-text-3">
                <th className="py-2 pr-4 font-medium">Rules</th>
                <th className="py-2 pr-4 font-medium">Correct</th>
                <th className="py-2 pr-4 font-medium">Wrong routine</th>
                <th className="py-2 pr-4 font-medium">Unnecessary review</th>
                <th className="py-2 text-right font-medium">Error cost per 1,000 claims</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const wr = r.metric.n ? r.metric.wrongRoutine / r.metric.n : 0;
                const ur = r.metric.n ? r.metric.unnecessaryReview / r.metric.n : 0;
                const cost = 1000 * (wr * m.wrong + ur * m.unnecessary);
                return (
                  <tr key={r.name} className="border-b border-line/60">
                    <td className="py-2.5 pr-4">
                      {r.name} <span className="text-[12px] text-text-3">· {r.note}</span>
                    </td>
                    <td className="num py-2.5 pr-4">
                      {r.metric.correct} / {r.metric.n}
                    </td>
                    <td className={cn("num py-2.5 pr-4", r.bad && r.metric.wrongRoutine > 0 && "font-medium text-action")}>
                      {r.metric.wrongRoutine} ({pct(wr, 1)})
                    </td>
                    <td className="num py-2.5 pr-4">
                      {r.metric.unnecessaryReview} ({pct(ur, 1)})
                    </td>
                    <td className={cn("num py-2.5 text-right", r.bad && cost > 0 && "font-medium text-action")}>{eur0(cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-text-3">
          Zero errors on {q.v2.n} claims does not mean zero errors in production: the 95% upper bound is {pct(upperBoundZero(q.v2.n), 1)}. The
          labelled set is rich in edge cases; on the realistic 500-claim mix, stale v1 rules would wrongly wave through {pct(mix.open ? mix.staleWrongRoutine / mix.open : 0, 1)} of
          claims.
        </p>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.3fr]">
          <div className="grid grid-cols-2 gap-3">
            <UnitCost label="A wrong routine decision" value={eur0(m.wrong)} sub={`${pct(i.overpayShare)} avoidable on a ${eur0(i.avgClaim)} claim`} tone="text-action" />
            <UnitCost label="An unnecessary review" value={eur0(m.unnecessary)} sub={`${i.reviewMin} min of a reviewer`} />
          </div>
          <div className="rounded-[12px] bg-surface-2 p-4 text-[13.5px] ring-1 ring-line">
            <p className="font-medium">How this sets the thresholds</p>
            <p className="mt-1.5 leading-relaxed text-text-2">
              Waving a claim through wrongly costs about <span className="text-foreground">{ratio}×</span> more than a needless review. So escalating
              pays as soon as there is more than a <span className="text-foreground">{pct(m.be, 1)}</span> chance that a person is needed. That is why every
              red flag goes to a person, a blank field is asked for instead of guessed, and routine claims within €70 of the quote limit get a second
              check.
            </p>
          </div>
        </div>
      </Section>

      {/* 3 — Cost of a policy change */}
      <Section n={3} title="Cost of a policy change: the v2 example" lead="v2 lowers the quote limit from €1,500 to €1,200 and sends every EV high-voltage battery repair to a person.">
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.06em] text-text-3">
                <th className="py-2 pr-4 font-medium" />
                <th className="py-2 pr-4 font-medium">Today</th>
                <th className="py-2 font-medium">With Clearpath</th>
              </tr>
            </thead>
            <tbody>
              <Row label="Time until the new rules are live" today={`${i.changeWeeksToday} weeks (specification, IT change, test, release)`} withSys="Same day (draft, replay on past claims, approve, activate)" />
              <Row label="Effort" today={`${i.changePersonDays} person-days · ${eur0(change.today.process)}`} withSys={`${i.changeHoursWithSystem} hours · ${eur0(change.withSystem.process)}`} />
              <Row
                label="Claims wrongly waved through meanwhile"
                today={`${pct(change.staleShare, 1)} of claims · ${eur0(change.today.exposure)}`}
                withSys={`one working day · ${eur0(change.withSystem.exposure)}`}
              />
              <Row label="Open claims rechecked, closed ones untouched" today="Manual search" withSys={`Automatic: ${mix.changed} of ${mix.open} open claims flagged`} />
              <tr>
                <td className="py-3 pr-4 font-medium">Total cost of the change</td>
                <td className="num py-3 pr-4 font-semibold">{eur0(change.today.total)}</td>
                <td className="num py-3 font-semibold text-ok">{eur0(change.withSystem.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-text-3">
          The exposure is the claims that are routine under v1 but need a person under v2 ({mix.staleWrongRoutine} of {mix.open} open demo claims), priced at{" "}
          {eur0(m.wrong)} each, for every week the old rules stay live.
        </p>
      </Section>

      {/* What it rests on */}
      <Section n={4} title="What these numbers rest on" lead="Each input is sourced, measured in this prototype, or an explicit assumption.">
        <div className="divide-y divide-line">
          {(["claimsPerYear", "salary", "triageMinToday", "reviewMin", "avgClaim", "overpayShare", "platformPerYear", "implementation", "changeWeeksToday"] as const).map((k) => {
            const a = byKey[k];
            const src = a.source ? srcById[a.source] : null;
            return (
              <div key={k} className="grid gap-1 py-2.5 text-[13px] md:grid-cols-[1.3fr_0.7fr_auto_2fr] md:items-center md:gap-4">
                <span>{a.label}</span>
                <span className="num font-medium">{fmt(a, i[k])}</span>
                <KindBadge kind={a.kind} />
                <span className="text-[12px] text-text-2">
                  {a.note}
                  {src && (
                    <a href={src.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-link hover:underline">
                      source <ExternalLink className="size-3" />
                    </a>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <Link to="/business-case" className="mt-4 inline-flex items-center gap-1 text-[13px] text-link hover:underline">
          Change any assumption on Business case <ArrowRight className="size-3.5" />
        </Link>
      </Section>
    </div>
  );
}

function fmt(a: Assumption, v: number) {
  if (a.unit === "€/year") return `${eur0(v)} / year`;
  if (a.unit === "€") return eur0(v);
  if (a.unit === "of claim") return pct(v);
  return `${v.toLocaleString("en-US")} ${a.unit}`;
}

function Section({ n, title, lead, children }: { n: number; title: string; lead: string; children: ReactNode }) {
  return (
    <Card className="mb-6">
      <div className="mb-4">
        <p className="label-mono">Question {n}</p>
        <h2 className="mt-1 text-[17px] font-semibold">{title}</h2>
        <p className="mt-1 text-[13px] text-text-2">{lead}</p>
      </div>
      {children}
    </Card>
  );
}

function CompareBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-[13px]">
        <span className="text-text-2">{label}</span>
        <span className="num font-medium">{eur0(value)} / year</span>
      </div>
      <div className="h-2.5 rounded-full bg-surface-2 ring-1 ring-line">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}

function UnitCost({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-[12px] p-4 ring-1 ring-line">
      <p className="text-[12px] text-text-2">{label}</p>
      <p className={cn("num mt-1 text-[24px] font-semibold leading-none", tone)}>{value}</p>
      <p className="mt-1.5 text-[11.5px] text-text-3">{sub}</p>
    </div>
  );
}

function Row({ label, today, withSys }: { label: string; today: string; withSys: string }) {
  return (
    <tr className="border-b border-line/60">
      <td className="py-2.5 pr-4 text-text-2">{label}</td>
      <td className="py-2.5 pr-4">{today}</td>
      <td className="py-2.5">{withSys}</td>
    </tr>
  );
}
