import { createFileRoute, Link } from "@tanstack/react-router";
import { downloadFile } from "@/lib/download";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { CircleAlert, CircleCheck, Download } from "lucide-react";
import { casesQuery, outcomesQuery, overridesQuery } from "@/lib/data";
import { isClosed, toCsv } from "@/lib/csv";
import { LABELLED_SETS, labelledReport, rate, RECS } from "@/lib/quality";
import { BATCH_POLICY_V2 } from "@/lib/batch";
import { EVAL_CASES, runIntakeEval } from "@/lib/intake-eval";
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
const pct = (x: number, n: number) => (n ? `${Math.round((x / n) * 100)}%` : "—");
const TRICKY = new Set(EVAL_CASES.filter((c) => c.tags.includes("tricky")).map((c) => c.id));

function QualityPage() {
  // End-to-end: realistic reports (what customers say and upload) -> next step, against an expert
  const e = useMemo(() => runIntakeEval(BATCH_POLICY_V2), []);
  // Rules alone, on claims whose facts are already clean
  const rules = useMemo(() => {
    const r = labelledReport(SET_KEYS);
    return { n: r.v2.n + r.closed.n, correct: r.v2.correct + r.closed.kept };
  }, []);
  const misses = e.n - e.correct;
  const safeMisses = misses - e.wrongRoutine;
  const kinds = [
    { label: "Clear reports", ids: EVAL_CASES.filter((c) => !TRICKY.has(c.id)).map((c) => c.id) },
    {
      label: "Reports with documents",
      ids: EVAL_CASES.filter((c) => c.tags.includes("documents")).map((c) => c.id),
    },
    {
      label: "Reports in German",
      ids: EVAL_CASES.filter((c) => c.tags.includes("german")).map((c) => c.id),
    },
    { label: "Tricky wording", ids: [...TRICKY] },
  ].map((k) => {
    const missed = new Set(e.misses.map((m) => m.id));
    return { ...k, n: k.ids.length, correct: k.ids.filter((id) => !missed.has(id)).length };
  });
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
      name: "Open claims in second check",
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
    void downloadFile(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, csv, { bom: true, rows: rows.length });
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
          label="Right next step, no human needed"
          value={pct(e.correct, e.n)}
          sub={`${e.correct} of ${e.n} realistic customer reports`}
        />
        <Kpi
          label="Misses on the safe side"
          value={misses ? `${safeMisses} of ${misses}` : "—"}
          sub="asked the customer or a person instead of paying out"
        />
        <Kpi
          label="Auto-processed but needed more"
          value={pct(e.wrongRoutine, e.n)}
          sub={`${e.wrongRoutine} of ${e.n} · the costly error`}
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
              "1 · Realistic reports, right answer first",
              `${e.n} customer reports as they really arrive: each of Mia's questions answered in the customer's own words, in English and German, some with uploaded quotes or police reports, some with vague or tricky wording. A claims expert wrote down the right next step for each one before the system ran.`,
            ],
            [
              "2 · The whole service, end to end",
              "Each report goes through exactly what a real one does: Mia reads the answers, documents are read, contradictions are flagged, and the rules give the next step. That result is compared with the expert's. The reading rules were not tuned to these reports.",
            ],
            [
              "3 · Errors weighted by cost",
              "Auto-processing a claim that needed more is the costly error: it can mean money paid out wrongly. Asking the customer or a person when it wasn't needed only costs time. We count them apart.",
            ],
            [
              "4 · Where errors come from",
              `On claims whose facts are already clean, the rules matched the expert on all ${rules.n} test claims. So errors come from reading what customers say and send, and that is what the numbers above measure. In daily work, reviewer corrections, second checks near the limit and final outcomes keep measuring it; each correction becomes a new test report.`,
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
          <h2 className="section-title">By kind of report</h2>
          <p className="mb-3 mt-1 text-[13px] text-text-2">
            Share of reports that got the right next step without a human.
          </p>
          <div className="divide-y divide-line">
            <ShareRow
              label="All reports"
              note={`${e.correct} of ${e.n}`}
              share={rate(e.correct, e.n)}
              display={pct(e.correct, e.n)}
              color={SERIES.strong}
              emphasis
            />
            {kinds.map((k) => (
              <ShareRow
                key={k.label}
                label={k.label}
                note={`${k.correct} of ${k.n}`}
                share={rate(k.correct, k.n)}
                display={pct(k.correct, k.n)}
                color={SERIES.mid}
              />
            ))}
          </div>
          <p className="mt-3 text-[12px] text-text-3">
            Clear reports are almost always right; vague wording is where the service asks a person
            or the customer, as it should. Photos and scans are read by the AI reader in the live
            service; this test uses the text rules only.
          </p>
        </Card>

        <Card>
          <h2 className="section-title">Right answer vs Clearpath</h2>
          <p className="mb-4 mt-1 text-[13px] text-text-2">
            The expert's answer vs what Clearpath did, on the {e.n} reports. Everything on the
            diagonal is correct; anything else in the Auto-processed column is the costly error.
          </p>
          <HeatGrid
            rowTitle="Right answer"
            colTitle="Clearpath"
            rows={RECS.map((k) => ({ key: k, label: RECOMMENDATION_LABELS[k] }))}
            cols={RECS.map((k) => ({ key: k, label: RECOMMENDATION_LABELS[k] }))}
            cell={(a, b) => e.confusion[a as Recommendation][b as Recommendation]}
          />
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="section-title">Where it goes wrong</h2>
        <p className="mb-2 mt-1 text-[13px] text-text-2">
          Every report the service got wrong, with the expert's reason. These are the next
          improvements.
        </p>
        <MistakeTable
          rows={e.misses.map((m) => ({
            case_id: m.id,
            expected: m.expected,
            got: m.got,
            why: `${m.why} Clearpath: ${m.reasons.join("; ")}.`,
          }))}
        />
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
          Second checks: every auto-processed claim within €70 of the quote limit gets a quick look
          afterwards.
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
    expected: Recommendation;
    got: Recommendation;
    why: string;
  }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-left">
            {["Report", "Expert", "Clearpath", "Why"].map((h) => (
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
