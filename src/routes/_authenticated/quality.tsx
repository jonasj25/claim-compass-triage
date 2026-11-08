import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { CircleAlert, CircleCheck, Download } from "lucide-react";
import { casesQuery, outcomesQuery, overridesQuery } from "@/lib/data";
import { isClosed, toCsv } from "@/lib/csv";
import { LABELLED_SETS, labelledReport, rate, RECS, type Metrics } from "@/lib/quality";
import { RECOMMENDATION_LABELS, type Recommendation } from "@/lib/triage";
import { Button } from "@/components/ui/button";
import { Card, Kpi, PageHeader, StatusDot, fmtTime } from "@/components/triage/ui";
import { HBars, HeatGrid, REC_COLOR, SERIES, ShareRow } from "@/components/triage/charts";

export const Route = createFileRoute("/_authenticated/quality")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Quality — Clearpath" },
      {
        property: "og:description",
        content: "How reliable Clearpath is and how its quality is measured.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Quality — Clearpath" },
      {
        name: "description",
        content:
          "How reliable Clearpath is: accuracy on expert-labelled claims, reviewer agreement, outcomes and monitoring.",
      },
    ],
  }),
  component: QualityPage,
});

const SET_KEYS = Object.keys(LABELLED_SETS);
const SET_LABEL: Record<string, string> = {
  "Provided dev cases": "Reference claims from the case brief",
  "Hand-labelled edge cases": "Hard cases we built and labelled by hand",
};
const pct = (x: number, n: number) => (n ? `${Math.round((x / n) * 100)}%` : "—");

/** Accuracy on a set of labelled claims: open claims scored on their next step, finished claims on staying unchanged. */
function score(keys: string[]) {
  const r = labelledReport(keys);
  return {
    r,
    n: r.v2.n + r.closed.n,
    correct: r.v2.correct + r.closed.kept,
    wrongRoutine: r.v2.wrongRoutine,
    unnecessary: r.v2.unnecessaryReview,
  };
}

function QualityPage() {
  const all = useMemo(() => score(SET_KEYS), []);
  const perSet = useMemo(() => SET_KEYS.map((k) => ({ k, ...score([k]) })), []);
  const r = all.r;
  const { data: cases = [] } = useQuery(casesQuery);
  const { data: overrides = [] } = useQuery(overridesQuery);
  const { data: outcomes = [] } = useQuery(outcomesQuery);

  const decided = cases.filter((c) => c.decision).length;
  const open = cases.filter((c) => !isClosed(c.claim.case_status));
  const overridden = new Set(overrides.map((o) => o.case_id)).size;
  const overrideRate = rate(overridden, decided);
  const byOriginal = RECS.map((k) => ({
    k,
    n: overrides.filter((o) => o.original_recommendation === k).length,
  }));
  const routineOutcomes = outcomes.filter((o) => o.correct_next_step);
  const lateWrongRoutine = outcomes.filter(
    (o) => o.final_outcome === "denied" && o.correct_next_step === "routine_processing",
  ).length;
  const blankShare = rate(
    open.filter((c) =>
      (
        [
          "policy_active_on_incident",
          "claim_type",
          "quote_eur",
          "incident_report_present",
          "itemized_quote_present",
          "injury_reported",
          "liability_disputed",
          "duplicate_flag",
          "evidence_conflict",
        ] as const
      ).some((f) => c.claim[f] === null),
    ).length,
    open.length,
  );
  const secondShare = rate(open.filter((c) => c.workflow?.qa_sample).length, open.length);

  const signals: {
    name: string;
    now: string;
    limit: string;
    ok: boolean;
    owner: string;
    action: string;
  }[] = [
    {
      name: "Decisions corrected by reviewers",
      now: `${(overrideRate * 100).toFixed(1)}%`,
      limit: "≤ 10%",
      ok: overrideRate <= 0.1,
      owner: "Ops lead",
      action: "Read the reasons; if one rule dominates, the policy owner drafts a change",
    },
    {
      name: "Auto-processed claims that needed a person (found later)",
      now: String(lateWrongRoutine),
      limit: "0",
      ok: lateWrongRoutine === 0,
      owner: "Ops lead → policy owner",
      action: "Root-cause each case; add it as a labelled test before any fix",
    },
    {
      name: "Open claims with missing information",
      now: `${Math.round(blankShare * 100)}%`,
      limit: "≤ 20%",
      ok: blankShare <= 0.2,
      owner: "Ops lead",
      action: "Upstream data problem: fix the intake form or import",
    },
    {
      name: "Open claims in second check / QA",
      now: `${Math.round(secondShare * 100)}%`,
      limit: "≤ 12%",
      ok: secondShare <= 0.12,
      owner: "Ops lead",
      action: "Too many near the limit: revisit the €70 margin",
    },
  ];

  const exportAudit = () => {
    const ov = new Map<string, (typeof overrides)[number]>();
    for (const o of overrides) if (!ov.has(o.case_id)) ov.set(o.case_id, o);
    const rows = cases.map((c) => {
      const o = ov.get(c.claim.case_id);
      return {
        case_id: c.claim.case_id,
        case_status: c.claim.case_status ?? "",
        policy_version: c.decision?.policy_version ?? "",
        recommendation: c.decision?.recommendation ?? "",
        rule_id: c.decision?.rule_id ?? "",
        needs_recheck: c.decision?.needs_recheck ? "True" : "False",
        explanation: c.decision?.explanation ?? "",
        override_to: o?.new_recommendation ?? "",
        override_reason: o ? [o.reason_code, o.reason_text].filter(Boolean).join(": ") : "",
        override_by: o?.reviewer ?? "",
        override_policy_version: o?.policy_version ?? "",
        override_at: o?.created_at ?? "",
      };
    });
    const csv = toCsv(rows, Object.keys(rows[0] ?? { case_id: "" }));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Ops lead"
        title="Quality"
        sub="How reliable Clearpath is: tested on claims with a known right answer, and checked every day by your reviewers."
        right={
          <Button
            variant="outline"
            className="bg-surface"
            onClick={exportAudit}
            disabled={!cases.length}
          >
            <Download className="size-4" strokeWidth={1.7} /> Export audit log
          </Button>
        }
      />

      <div className="kpi-strip grid grid-cols-4 gap-0">
        <Kpi
          label="Right next step"
          value={pct(all.correct, all.n)}
          sub={`${all.correct} of ${all.n} expert-labelled claims`}
        />
        <Kpi
          label="Auto-processed but needed a person"
          value={all.wrongRoutine}
          sub="the costly error"
        />
        <Kpi
          label="Sent to a person without need"
          value={all.unnecessary}
          sub="wasted reviewer time"
        />
        <Kpi
          label="Reviewers agree"
          value={decided ? pct(decided - overridden, decided) : "—"}
          sub={
            decided
              ? `${overridden} of ${decided} live decisions corrected`
              : "no live decisions yet"
          }
        />
      </div>

      <Card className="mt-6">
        <h2 className="section-title">How we measure quality</h2>
        <p className="mt-1 text-[13px] text-text-2">
          Quality means one thing: every claim gets the right next step. Auto-process it, ask the
          customer for something, or give it to a person.
        </p>
        <ol className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            [
              "1 · A right answer for every test claim",
              `${all.n} claims, each with the correct next step written down before the system ever sees them: ${r.sets.map((k) => `${perSet.find((x) => x.k === k)!.n} ${SET_LABEL[k]?.toLowerCase() ?? k}`).join(" and ")}.`,
            ],
            [
              "2 · Blind comparison",
              "Clearpath decides every test claim on its own; then each decision is compared with the right answer. The score is the share that match.",
            ],
            [
              "3 · Errors weighted by cost",
              "A claim auto-processed that needed a person can mean money paid out wrongly, so it is counted on its own and must stay at zero. A claim sent to a person without need only costs reviewer time.",
            ],
            [
              "4 · Checked again, every day",
              "Before any rule change goes live, it is replayed on every test claim. In daily work reviewers can correct any decision, about 7% of auto-processed claims get a random check, and late outcomes are compared with the first decision. Every correction becomes a new test claim.",
            ],
          ].map(([t, d]) => (
            <li key={t} className="rounded-[10px] bg-surface-2 p-4">
              <p className="text-[13px] font-medium">{t}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-2">{d}</p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <h2 className="section-title">Tested where it's hardest</h2>
          <p className="mb-3 mt-1 text-[13px] text-text-2">
            Share of claims with the right next step, by kind of claim.
          </p>
          <div className="divide-y divide-line">
            <ShareRow
              label="All test claims"
              note={`${all.correct} of ${all.n}`}
              share={rate(all.correct, all.n)}
              display={pct(all.correct, all.n)}
              color={SERIES.strong}
              emphasis
            />
            {perSet.map((x) => (
              <ShareRow
                key={x.k}
                label={SET_LABEL[x.k] ?? x.k}
                note={`${x.correct} of ${x.n}`}
                share={rate(x.correct, x.n)}
                display={pct(x.correct, x.n)}
                color={SERIES.mid}
              />
            ))}
            <ShareRow
              label="Missing or unreadable information"
              note={`${r.blankV2.correct} of ${r.blankV2.n} · never guessed`}
              share={rate(r.blankV2.correct, r.blankV2.n)}
              display={pct(r.blankV2.correct, r.blankV2.n)}
              color={SERIES.mid}
            />
            <ShareRow
              label="Finished claims left unchanged"
              note={`${r.closed.kept} of ${r.closed.n} · decisions are never rewritten`}
              share={rate(r.closed.kept, r.closed.n)}
              display={pct(r.closed.kept, r.closed.n)}
              color={SERIES.mid}
            />
          </div>
          <p className="mt-3 text-[12px] text-text-3">
            Missing fields lead to a request to the customer unless a known fact already needs a
            person. The same claim always gets the same answer: the website and the batch engine are
            checked against each other on every build.
          </p>
        </Card>

        <Card>
          <h2 className="section-title">Right answer vs Clearpath</h2>
          <p className="mb-4 mt-1 text-[13px] text-text-2">
            Everything on the diagonal is correct. Anything else in the Auto-processed column would
            be the costly error.
          </p>
          <HeatGrid
            rowTitle="Right answer"
            colTitle="Clearpath"
            rows={RECS.map((k) => ({ key: k, label: RECOMMENDATION_LABELS[k] }))}
            cols={RECS.map((k) => ({ key: k, label: RECOMMENDATION_LABELS[k] }))}
            cell={(a, b) => r.confusionV2[a as Recommendation][b as Recommendation]}
          />
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="section-title">Where it goes wrong</h2>
        {r.mistakesV2.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-[13.5px]">
            <CircleCheck className="size-4 text-ok" strokeWidth={1.8} /> No mistakes on the {all.n}{" "}
            test claims.
          </p>
        ) : (
          <MistakeTable rows={r.mistakesV2} />
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-0">
          <div className="flex items-baseline justify-between px-6 pt-5">
            <h2 className="section-title">Reviewer corrections</h2>
            <span className="text-[13px] text-text-2">
              {overrides.length} corrections · {(overrideRate * 100).toFixed(1)}% of decided claims
            </span>
          </div>
          <p className="px-6 pb-3 pt-1 text-[13px] text-text-2">
            Reviewers have the last word. Each correction records who, what and why; nothing is
            overwritten.
          </p>
          {overrides.length ? (
            <table className="w-full text-[13px]">
              <tbody>
                {overrides.slice(0, 8).map((o) => (
                  <tr key={o.id} className="border-t border-line align-top">
                    <td className="px-6 py-2.5 font-mono text-[12px]">
                      <Link
                        to="/claims/$caseId"
                        params={{ caseId: o.case_id }}
                        className="hover:underline"
                      >
                        {o.case_id}
                      </Link>
                    </td>
                    <td className="py-2.5 whitespace-nowrap">
                      {o.original_recommendation && (
                        <StatusDot rec={o.original_recommendation as Recommendation} plain />
                      )}{" "}
                      → <StatusDot rec={o.new_recommendation as Recommendation} plain />
                    </td>
                    <td className="px-3 py-2.5 text-text-2">
                      {[o.reason_code, o.reason_text].filter(Boolean).join(": ")}
                    </td>
                    <td className="px-6 py-2.5 text-right text-[12px] whitespace-nowrap text-text-2">
                      {o.reviewer}
                      <br />
                      {fmtTime(o.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="border-t border-line px-6 py-5 text-[13px] text-text-2">
              No corrections yet. Override any claim on its case page; it appears here immediately.
            </p>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="section-title">Corrections by original decision</h2>
            <div className="mt-4">
              <HBars
                items={byOriginal
                  .filter((x) => x.n)
                  .map((x) => ({
                    key: x.k,
                    label: RECOMMENDATION_LABELS[x.k],
                    value: x.n,
                    color: REC_COLOR[x.k],
                  }))}
                empty="No corrections yet."
              />
            </div>
          </Card>
          <Card>
            <h2 className="section-title">Outcomes that arrive later</h2>
            <p className="mt-1 text-[13px] text-text-2">
              When a claim is settled, its final outcome is stored next to the first decision and
              compared with it. Accuracy is counted once the outcome is known.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
              <div className="rounded-[10px] bg-surface-2 p-3">
                <dt className="text-text-2">Outcomes recorded</dt>
                <dd className="num mt-1 text-[22px] font-semibold">{outcomes.length}</dd>
              </div>
              <div className="rounded-[10px] bg-surface-2 p-3">
                <dt className="text-text-2">Matched the first decision</dt>
                <dd className="num mt-1 text-[22px] font-semibold">
                  {routineOutcomes.length
                    ? `${Math.round(rate(routineOutcomes.length - lateWrongRoutine, routineOutcomes.length) * 100)}%`
                    : "—"}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      <Card className="mt-6 p-0">
        <div className="px-6 pt-5 pb-3">
          <h2 className="section-title">Monitoring plan, live</h2>
          <p className="mt-1 text-[13px] text-text-2">
            What triggers an investigation, who acts and what happens next.
          </p>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-y border-line text-left">
              {["Signal", "Now", "Trigger", "Status", "Who acts", "Next step"].map((h) => (
                <th key={h} className="label-mono px-4 py-2.5 font-normal first:pl-6">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => (
              <tr key={s.name} className="border-b border-line align-top last:border-0">
                <td className="py-3 pl-6 pr-4 font-medium">{s.name}</td>
                <td className="num px-4 py-3">{s.now}</td>
                <td className="num px-4 py-3 text-text-2">{s.limit}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {s.ok ? (
                    <span className="inline-flex items-center gap-1.5 text-ok">
                      <CircleCheck className="size-3.5" strokeWidth={1.8} /> OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-action">
                      <CircleAlert className="size-3.5" strokeWidth={1.8} /> Investigate
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-2">{s.owner}</td>
                <td className="px-4 py-3 text-text-2">{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-6 py-4 text-[12.5px] text-text-3">
          Sampling: about 7% of auto-processed claims get a random check, plus every claim within
          €70 of the quote limit.
        </p>
      </Card>
    </div>
  );
}

function MistakeTable({
  rows,
}: {
  rows: {
    case_id: string;
    set: string;
    expected: Recommendation;
    got: Recommendation;
    rule: string;
    why: string;
  }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-left">
            {["Claim", "Right answer", "Clearpath said", "Why"].map((h) => (
              <th key={h} className="label-mono py-2 pr-4 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.case_id} className="border-b border-line align-top last:border-0">
              <td className="py-2.5 pr-4 font-mono text-[12px]">{m.case_id}</td>
              <td className="py-2.5 pr-4 whitespace-nowrap">
                <StatusDot rec={m.expected} plain />
              </td>
              <td className="py-2.5 pr-4 whitespace-nowrap">
                <StatusDot rec={m.got} plain />
              </td>
              <td className="py-2.5 text-text-2">{m.why}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
