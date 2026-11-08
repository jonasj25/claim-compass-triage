import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { casesQuery, outcomesQuery, overridesQuery } from "@/lib/data";
import { isClosed } from "@/lib/csv";
import { BATCH_POLICY_V1, BATCH_POLICY_V2 } from "@/lib/batch";
import { labelledReport, rate, RECS, type Metrics, type Mistake } from "@/lib/quality";
import { runIntakeEval } from "@/lib/intake-eval";
import { RECOMMENDATION_LABELS, type Recommendation } from "@/lib/triage";
import { Card, Kpi, PageHeader, StatusDot } from "@/components/triage/ui";
import { HeatGrid } from "@/components/triage/charts";
import { cn } from "@/lib/utils";

// Building block 3 of the case: test on labelled examples before and after the policy change,
// show where decisions go wrong (above all wrong auto-processing), and how quality keeps being
// measured after launch when reviewer corrections and real outcomes arrive later.
export const Route = createFileRoute("/_authenticated/tests")({
  head: () => ({
    meta: [
      { title: "Test results — Clearpath" },
      {
        name: "description",
        content:
          "Labelled test claims before and after the policy change, where decisions go wrong, and how quality is measured after launch.",
      },
    ],
  }),
  component: TestResults,
});

const V1 = BATCH_POLICY_V1.version.toUpperCase();
const V2 = BATCH_POLICY_V2.version.toUpperCase();
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const pct = (x: number, n: number) => (n ? `${Math.round((x / n) * 1000) / 10}%` : "—");

function TestResults() {
  const q = useMemo(() => labelledReport(), []);
  const intake = useMemo(() => runIntakeEval(BATCH_POLICY_V2), []);
  const { data: cases = [] } = useQuery(casesQuery);
  const { data: overrides = [] } = useQuery(overridesQuery);
  const { data: outcomes = [] } = useQuery(outcomesQuery);

  // Live signals after launch
  const decided = cases.filter((c) => c.decision).length;
  const overrideRate = rate(new Set(overrides.map((o) => o.case_id)).size, decided);
  const lateWrongRoutine = outcomes
    .filter((o) => o.correct_next_step && o.correct_next_step !== "routine_processing")
    .filter((o) => {
      const c = cases.find((x) => x.claim.case_id === o.case_id);
      return c?.decision?.recommendation === "routine_processing";
    }).length;
  const open = cases.filter((c) => !isClosed(c.claim.case_status));
  const secondChecks = open.filter((c) => c.workflow?.qa_sample).length;

  const versionRows: { label: string; note: string; m: Metrics; strong?: boolean }[] = [
    { label: `${V1} rules, before the change`, note: `${V1} labels · all claims`, m: q.v1 },
    {
      label: `${V1} rules still running after the change`,
      note: `${V2} labels · open claims`,
      m: q.keepV1,
    },
    {
      label: `${V2} rules after the change`,
      note: `${V2} labels · open claims`,
      m: q.v2,
      strong: true,
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Policy owner"
        title="Test results"
        sub={`Every policy version is tested on ${q.total} labelled claims before it goes live: claims where the correct next step was written down by hand, once under ${V1} and once under ${V2}. The ${q.sets.join(" and ").toLowerCase()} are the same files the batch report uses.`}
      />

      <div className="kpi-strip grid grid-cols-4 gap-0">
        <Kpi
          label={`Correct under ${V2}`}
          value={pct(q.v2.correct, q.v2.n)}
          sub={`${q.v2.correct} of ${q.v2.n} open claims`}
        />
        <Kpi
          label={`Wrong auto-processing under ${V2}`}
          value={String(q.v2.wrongRoutine)}
          sub={`${q.keepV1.wrongRoutine} if ${V1} had kept running`}
        />
        <Kpi
          label="Claims affected by the change"
          value={`${q.changedV2.correct} / ${q.changedV2.n}`}
          sub={`right under ${V2} · ${q.changedKeepV1.correct} of ${q.changedKeepV1.n} with ${V1}`}
        />
        <Kpi
          label="Closed claims left untouched"
          value={`${q.closed.kept} / ${q.closed.n}`}
          sub={`keep their ${V1} decision`}
        />
      </div>

      <Card className="mt-6">
        <h2 className="section-title">Before and after the change</h2>
        <p className="mt-1 text-[13px] text-text-2">
          Scored the way the case asks: the share of correct next steps, wrong auto-processing (the
          expensive error) and unnecessary escalations, per policy version. The claims the change
          affects and the claims with blank fields are shown separately, so a good overall score
          can't hide a failure.
        </p>
        <table className="mt-4 w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="label-mono py-2 font-normal">Rules · labels</th>
              <th className="label-mono py-2 text-right font-normal">Claims</th>
              <th className="label-mono py-2 text-right font-normal">Correct</th>
              <th className="label-mono py-2 text-right font-normal">Wrong auto-processing</th>
              <th className="label-mono py-2 text-right font-normal">Unnecessary review</th>
            </tr>
          </thead>
          <tbody>
            {versionRows.map((r) => (
              <MetricRow key={r.label} label={r.label} note={r.note} m={r.m} strong={r.strong} />
            ))}
            <tr>
              <td colSpan={5} className="label-mono pb-1 pt-5 text-[11px]">
                Only the claims whose correct next step changed
              </td>
            </tr>
            <MetricRow
              label={`${V1} rules still running`}
              note="changed claims"
              m={q.changedKeepV1}
            />
            <MetricRow label={`${V2} rules`} note="changed claims" m={q.changedV2} strong />
            <tr>
              <td colSpan={5} className="label-mono pb-1 pt-5 text-[11px]">
                Claims with a blank or unreadable field
              </td>
            </tr>
            <MetricRow label={`${V1} rules`} note="blank fields" m={q.blankV1} />
            <MetricRow label={`${V2} rules`} note="blank fields" m={q.blankV2} strong />
          </tbody>
        </table>
        <p className="mt-4 text-[12.5px] text-text-2">
          A blank field is treated as an absent fact, never guessed as yes or no: Clearpath asks the
          customer for it, unless a red flag already sends the claim to a person. Closed claims are
          not re-decided; all {q.closed.n} keep their {V1} decision. {q.recheck.length} open claims
          are flagged for recheck by the change.
        </p>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="section-title">Where it goes wrong</h2>
          <p className="mt-1 text-[13px] text-text-2">
            If nobody updates the rules, {V1} keeps auto-processing claims that now need a person.
            These are the claims {V1} gets wrong under the new policy;{" "}
            <span className="text-action">wrong auto-processing</span> is marked.
          </p>
          <MistakeTable rows={q.mistakesKeepV1} />
          <p className="mt-4 text-[13px] text-text-2">
            {q.mistakesV2.length
              ? `${V2} still gets ${q.mistakesV2.length} labelled claims wrong:`
              : `${V2} gets every labelled claim right. These labels were written by our team, so the hidden test set will be harder; that is why the live signals below matter.`}
          </p>
          {q.mistakesV2.length > 0 && <MistakeTable rows={q.mistakesV2} />}
        </Card>

        <Card>
          <h2 className="section-title">Right answer vs {V2}</h2>
          <p className="mb-4 mt-1 text-[13px] text-text-2">
            The labelled answer vs Clearpath on the {q.v2.n} open claims. Everything off the
            diagonal is a mistake; anything off the diagonal in the Routine column is the costly
            one.
          </p>
          <HeatGrid
            rowTitle="Labelled"
            colTitle="Clearpath"
            rows={RECS.map((k) => ({ key: k, label: RECOMMENDATION_LABELS[k] }))}
            cols={RECS.map((k) => ({ key: k, label: RECOMMENDATION_LABELS[k] }))}
            cell={(a, b) => q.confusionV2[a as Recommendation][b as Recommendation]}
          />
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="section-title">Where mistakes come from in practice</h2>
        <p className="mt-1 text-[13px] text-text-2">
          The rules are only as good as the facts they get. On {intake.n} realistic customer
          reports, read from free text and documents the way the live service reads them, Clearpath
          picks the right next step for{" "}
          <strong className="text-foreground">{pct(intake.correct, intake.n)}</strong>.{" "}
          {intake.wrongRoutine} were auto-processed when a person was needed,{" "}
          {intake.unnecessaryReview} went to a person without need and {intake.unnecessaryRequest}{" "}
          asked the customer for something we already had. Asking or escalating when unsure is
          deliberate: it costs minutes, a wrong auto-processing costs a claim.
        </p>
      </Card>

      <Card className="mt-6">
        <h2 className="section-title">How we keep measuring after launch</h2>
        <p className="mt-1 text-[13px] text-text-2">
          After launch there are no labels. Quality is measured against what people and real
          outcomes say later, never against Clearpath's own first recommendation.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Step
            n={1}
            title="Second checks"
            text="Every auto-processed claim within €70 of the quote limit gets a quick check by a person afterwards. Every claim a person handles is a review anyway."
            live={`${plural(secondChecks, "open claim")} in second check`}
          />
          <Step
            n={2}
            title="Reviewer corrections"
            text="Every override is recorded with the new decision, the reason, the reviewer, the policy version and the time. Corrected claims become new labelled tests."
            live={`${plural(overrides.length, "correction")} recorded`}
          />
          <Step
            n={3}
            title="Outcomes that arrive later"
            text="When a claim is settled weeks later, the final outcome is stored next to the first decision. Accuracy is counted against the outcome, not the recommendation."
            live={`${plural(outcomes.length, "outcome")} recorded`}
          />
          <Step
            n={4}
            title="Before every release"
            text="A policy change starts as a draft and is replayed on all past claims and this labelled set (Change impact). The policy owner approves it; only open claims are re-decided."
            link
          />
        </div>

        <table className="mt-6 w-full text-[13px]">
          <thead>
            <tr className="border-y border-line text-left">
              {["Signal", "Now", "Investigate when", "Who acts", "Next step"].map((h) => (
                <th key={h} className="label-mono px-3 py-2.5 font-normal first:pl-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              {
                name: "Auto-processed claims that needed a person, found by a second check or a later outcome",
                now: String(lateWrongRoutine),
                limit: "any single case",
                ok: lateWrongRoutine === 0,
                owner: "Ops lead → policy owner",
                action: "Root-cause the case and add it as a labelled test before any fix",
              },
              {
                name: "Decisions corrected by reviewers",
                now: pct(overrideRate, 1),
                limit: "above 10% of decided claims",
                ok: overrideRate <= 0.1,
                owner: "Ops lead",
                action: "Read the reasons; if one rule dominates, the policy owner drafts a change",
              },
              {
                name: "Policy or legal requirement changes",
                now: "—",
                limit: "always",
                ok: true,
                owner: "Policy owner",
                action: "Draft, replay on past claims and the labelled set, approve, activate",
              },
            ].map((s) => (
              <tr key={s.name} className="border-b border-line align-top last:border-0">
                <td className="py-3 pr-3 font-medium">{s.name}</td>
                <td className="num px-3 py-3 whitespace-nowrap">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5",
                      s.ok ? "text-ok" : "text-action",
                    )}
                  >
                    {s.ok ? (
                      <CircleCheck className="size-3.5" strokeWidth={1.8} />
                    ) : (
                      <CircleAlert className="size-3.5" strokeWidth={1.8} />
                    )}
                    {s.now}
                  </span>
                </td>
                <td className="px-3 py-3 text-text-2">{s.limit}</td>
                <td className="px-3 py-3 text-text-2">{s.owner}</td>
                <td className="px-3 py-3 text-text-2">{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function MetricRow({
  label,
  note,
  m,
  strong,
}: {
  label: string;
  note: string;
  m: Metrics;
  strong?: boolean;
}) {
  return (
    <tr className="border-b border-line">
      <td className="py-2.5">
        <span className={cn(strong && "font-medium")}>{label}</span>
        <span className="ml-2 text-[12px] text-text-3">{note}</span>
      </td>
      <td className="num py-2.5 text-right text-text-2">{m.n}</td>
      <td className={cn("num py-2.5 text-right", strong && "font-semibold")}>
        {pct(m.correct, m.n)} <span className="text-[12px] text-text-3">({m.correct})</span>
      </td>
      <td
        className={cn("num py-2.5 text-right", m.wrongRoutine > 0 && "font-semibold text-action")}
      >
        {pct(m.wrongRoutine, m.n)}{" "}
        <span className="text-[12px] text-text-3">({m.wrongRoutine})</span>
      </td>
      <td className="num py-2.5 text-right">
        {pct(m.unnecessaryReview, m.n)}{" "}
        <span className="text-[12px] text-text-3">({m.unnecessaryReview})</span>
      </td>
    </tr>
  );
}

function MistakeTable({ rows }: { rows: Mistake[] }) {
  if (!rows.length) return null;
  const sorted = [...rows].sort(
    (a, b) => Number(b.got === "routine_processing") - Number(a.got === "routine_processing"),
  );
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-left">
            {["Claim", "Labelled", "Clearpath", "Rule", "Why"].map((h) => (
              <th key={h} className="label-mono py-2 pr-4 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => {
            const costly = m.got === "routine_processing";
            return (
              <tr key={m.case_id} className="border-b border-line align-top last:border-0">
                <td className="py-2 pr-4 font-mono text-[12px]">{m.case_id}</td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  <StatusDot rec={m.expected} plain />
                </td>
                <td
                  className={cn("py-2 pr-4 whitespace-nowrap", costly && "font-medium text-action")}
                >
                  {RECOMMENDATION_LABELS[m.got]}
                </td>
                <td className="py-2 pr-4 font-mono text-[12px] text-text-2">{m.rule}</td>
                <td className="py-2 text-text-2">{m.why}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Step({
  n,
  title,
  text,
  live,
  link,
}: {
  n: number;
  title: string;
  text: string;
  live?: string;
  link?: boolean;
}) {
  return (
    <div className="rounded-[12px] bg-surface-2 p-4">
      <p className="label-mono text-[11px]">Step {n}</p>
      <h3 className="mt-1 text-[14px] font-medium">{title}</h3>
      <p className="mt-1.5 text-[12.5px] text-text-2">{text}</p>
      {live && <p className="num mt-3 text-[12.5px] font-medium">{live}</p>}
      {link && (
        <Link to="/impact" className="mt-3 inline-block text-[12.5px] text-link hover:underline">
          Open Change impact →
        </Link>
      )}
    </div>
  );
}
