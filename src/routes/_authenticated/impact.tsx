import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { activePolicyQuery, casesQuery, policyVersionsQuery } from "@/lib/data";
import { computeImpact, type Counts, type Quality } from "@/lib/impact";
import { diffPolicies } from "@/lib/policy-text";
import { RECOMMENDATION_LABELS, type Policy, type Recommendation } from "@/lib/triage";
import { Card, Kpi, PageHeader, StatusDot } from "@/components/triage/ui";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/impact")({
  validateSearch: (s: Record<string, unknown>): { v?: string } =>
    typeof s.v === "string" ? { v: s.v } : {},
  head: () => ({
    meta: [
      { title: "Change impact — Triage" },
      { name: "description", content: "See which open cases a new policy version would change." },
    ],
  }),
  component: ImpactPage,
});

const RECS: Recommendation[] = ["routine_processing", "request_information", "human_review"];
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
const pts = (a: number, b: number) => {
  const d = Math.round((b - a) * 1000) / 10;
  return d === 0 ? "no change" : `${d > 0 ? "+" : "−"}${Math.abs(d)} pts`;
};
const signed = (d: number) => (d === 0 ? "no change" : `${d > 0 ? "+" : "−"}${Math.abs(d)}`);

function ImpactPage() {
  const { v } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: active } = useQuery(activePolicyQuery);
  const { data: versions = [] } = useQuery(policyVersionsQuery);
  const { data: cases = [], isLoading } = useQuery(casesQuery);

  const candidates = versions.filter((x) => active && x.id !== active.version);
  const chosen = candidates.find((x) => x.id === v) ?? candidates[candidates.length - 1];
  const candidate = useMemo(
    () =>
      chosen ? ({ ...(chosen.config as unknown as Policy), version: chosen.id } as Policy) : null,
    [chosen],
  );

  const impact = useMemo(
    () =>
      active && candidate
        ? computeImpact(
            cases.map((c) => c.claim),
            active,
            candidate,
          )
        : null,
    [cases, active, candidate],
  );

  if (!active || isLoading) return <p className="label-mono">Loading</p>;

  if (!candidate || !impact) {
    return (
      <div>
        <PageHeader eyebrow="Policy owner" title="Change impact" />
        <Card className="flex flex-col items-center py-14 text-center">
          <p className="text-text-2">
            There is no other policy version to compare with {active.version} yet.
          </p>
          <Button asChild className="mt-5">
            <Link to="/policy">Create a new version</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const changes = diffPolicies(active, candidate);
  const reviewDelta = impact.after.human_review - impact.before.human_review;

  return (
    <div>
      <PageHeader
        eyebrow="Policy owner"
        title="Change impact"
        sub={`What happens to the ${impact.total} claims in the system if ${candidate.version} replaces ${active.version}. Nothing is changed by viewing this.`}
        right={
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-text-2">{active.version} →</span>
            <Select
              value={candidate.version}
              onValueChange={(val) => navigate({ search: { v: val } })}
            >
              <SelectTrigger className="h-9 w-40 font-mono uppercase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((x) => (
                  <SelectItem key={x.id} value={x.id} className="font-mono uppercase">
                    {x.id} · {x.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <Card className="mb-6">
        <h2 className="section-title mb-3">What changes in the rules</h2>
        {changes.length ? (
          <ul className="space-y-1.5 text-[14px]">
            {changes.map((c) => (
              <li key={c}>• {c}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-text-2">The rules are identical.</p>
        )}
        {candidate.description && (
          <p className="mt-3 text-[13px] text-text-2">{candidate.description}</p>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Handled without a reviewer"
          value={pct(impact.automationAfter)}
          sub={`was ${pct(impact.automationBefore)} · ${pts(impact.automationBefore, impact.automationAfter)}`}
        />
        <Kpi
          label="Fully automatic (routine)"
          value={pct(impact.routineAfter)}
          sub={`was ${pct(impact.routineBefore)} · ${pts(impact.routineBefore, impact.routineAfter)}`}
        />
        <Kpi
          label="Cases for reviewers"
          value={impact.after.human_review}
          sub={`was ${impact.before.human_review} · ${signed(reviewDelta)}`}
        />
        <Kpi
          label="Open cases to recheck"
          value={impact.changed.length}
          tone={impact.changed.length ? "action" : undefined}
          sub={`${impact.closed} closed cases stay as decided${impact.closedWouldChange ? ` (${impact.closedWouldChange} would otherwise change)` : ""}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="section-title mb-4">Where claims go</h2>
          <Distribution
            before={impact.before}
            after={impact.after}
            total={impact.total}
            a={active.version}
            b={candidate.version}
          />
          <p className="mt-4 text-[12px] text-text-3">
            “Handled without a reviewer” counts routine claims and automatic requests for
            information. A stricter policy sends more claims to people on purpose: a wrong routine
            decision costs far more than an extra review.
          </p>
        </Card>
        <QualityCard impact={impact} a={active.version} b={candidate.version} />
      </div>

      <Card className="mt-6 p-0">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="section-title">Open cases whose next step changes</h2>
          <span className="label-mono">{impact.changed.length}</span>
        </div>
        {impact.changed.length ? (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-y border-line">
                {["Case", active.version, candidate.version, "Why"].map((h) => (
                  <th key={h} className="label-mono px-6 py-3 font-normal uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {impact.changed.map((c) => (
                <tr key={c.case_id} className="border-b border-line last:border-0">
                  <td className="px-6 py-3 font-mono text-[12px]">
                    <Link
                      to="/claims/$caseId"
                      params={{ caseId: c.case_id }}
                      className="hover:underline"
                    >
                      {c.case_id}
                    </Link>
                  </td>
                  <td className="px-6">
                    <StatusDot rec={c.before} plain />
                  </td>
                  <td className="px-6">
                    <StatusDot rec={c.after} />
                  </td>
                  <td className="px-6 py-3 text-text-2">{c.reasons_after.join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-6 pb-6 text-[13px] text-text-2">No open case changes its next step.</p>
        )}
      </Card>
    </div>
  );
}

function Distribution({
  before,
  after,
  total,
  a,
  b,
}: {
  before: Counts;
  after: Counts;
  total: number;
  a: string;
  b: string;
}) {
  const max = Math.max(1, ...RECS.map((r) => Math.max(before[r], after[r])));
  return (
    <div className="space-y-4">
      {RECS.map((r) => (
        <div key={r}>
          <div className="mb-1.5 flex items-center justify-between text-[13px]">
            <StatusDot rec={r} plain />
            <span className="num text-text-2">
              {before[r]} → <span className="font-medium text-foreground">{after[r]}</span>
              <span className="ml-2 text-text-3">({signed(after[r] - before[r])})</span>
            </span>
          </div>
          {[
            [a, before[r], "bg-text-3/40"],
            [b, after[r], "bg-foreground/70"],
          ].map(([label, n, cls]) => (
            <div key={label as string} className="mb-1 flex items-center gap-2">
              <span className="label-mono w-8 uppercase">{label}</span>
              <div className="h-2 flex-1 rounded-full bg-surface-2">
                <div
                  className={`h-2 rounded-full ${cls}`}
                  style={{ width: `${((n as number) / max) * 100}%` }}
                />
              </div>
              <span className="num w-10 text-right text-[11px] text-text-3">
                {pct((n as number) / (total || 1))}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function QualityCard({
  impact,
  a,
  b,
}: {
  impact: ReturnType<typeof computeImpact>;
  a: string;
  b: string;
}) {
  if (!impact.quality) {
    return (
      <Card>
        <h2 className="section-title mb-2">Decision quality</h2>
        <p className="text-[13px] text-text-2">
          No claims are labelled for {b} yet, so quality cannot be measured. Import a CSV that has
          an <span className="font-mono">{impact.labelKey}</span> column with the correct next step
          per claim; this card then shows whether {b} fixes the intended cases without making others
          worse.
        </p>
      </Card>
    );
  }
  const q = impact.quality;
  const rows: [string, (x: Quality) => string, boolean][] = [
    ["Correct next step", (x) => `${x.correct}/${x.n}`, true],
    ["Wrong routine (costly)", (x) => String(x.wrongRoutine), false],
    ["Unnecessary review", (x) => String(x.unnecessaryReview), false],
  ];
  return (
    <Card>
      <h2 className="section-title mb-1">Decision quality</h2>
      <p className="mb-4 text-[13px] text-text-2">
        Against {q.after.n} claims labelled with the correct next step under {b}. Old rules vs
        updated rules.
      </p>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line">
            <th className="label-mono py-2 text-left font-normal"> </th>
            <th className="label-mono py-2 text-right font-normal uppercase">Keep {a}</th>
            <th className="label-mono py-2 text-right font-normal uppercase">Switch to {b}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, f]) => (
            <tr key={label} className="border-b border-line last:border-0">
              <td className="py-2.5">{label}</td>
              <td className="num py-2.5 text-right text-text-2">{f(q.before)}</td>
              <td className="num py-2.5 text-right font-medium">{f(q.after)}</td>
            </tr>
          ))}
          {q.changedAfter.n > 0 && (
            <tr>
              <td className="pt-3 text-text-2">
                Only the {q.changedAfter.n} cases whose label changed
              </td>
              <td className="num pt-3 text-right text-text-2">
                {q.changedBefore.correct}/{q.changedBefore.n}
              </td>
              <td className="num pt-3 text-right font-medium">
                {q.changedAfter.correct}/{q.changedAfter.n}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-4 text-[12px] text-text-3">
        Labels: {RECS.map((r) => RECOMMENDATION_LABELS[r]).join(" · ")}. Closed claims keep their
        old decision in both columns.
      </p>
    </Card>
  );
}
