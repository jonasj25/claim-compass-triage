import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { activePolicyQuery, casesQuery, policyVersionsQuery } from "@/lib/data";
import {
  ADVISOR_ASSUMPTIONS,
  advise,
  draftFrom,
  GOALS,
  type Goal,
  type Score,
} from "@/lib/advisor";
import { advisorMemo } from "@/lib/advisor.functions";
import { defaultInputs, eur0, eurCompact } from "@/lib/business";
import { nextVersionId } from "@/lib/policy-text";
import { VOLUME_CLAIMS } from "@/lib/quality";
import { useRole } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/triage/ui";
import { SERIES } from "@/components/triage/charts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/advisor")({
  head: () => ({
    meta: [
      { title: "Policy advisor — Clearpath" },
      {
        name: "description",
        content:
          "Suggested policy settings for cost, customer speed and reviewer time, computed on current claims.",
      },
    ],
  }),
  component: Advisor,
});

const GOAL_COLOR: Record<Goal, string> = {
  financial: "var(--chart-1)",
  customer: "var(--ok-dot)",
  time: "var(--wait-dot)",
};

function delta(n: number, fmt: (x: number) => string, betterIsLower = true) {
  if (Math.abs(n) < 1e-9) return <span className="text-text-3">no change</span>;
  const good = betterIsLower ? n < 0 : n > 0;
  return (
    <span className={good ? "text-ok" : "text-action"}>
      {(n > 0 ? "+" : "−") + fmt(Math.abs(n))}
    </span>
  );
}

function Advisor() {
  const { me } = useRole();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: cases = [], isLoading } = useQuery(casesQuery);
  const { data: policy } = useQuery(activePolicyQuery);
  const { data: versions = [] } = useQuery(policyVersionsQuery);
  const [relax, setRelax] = useState(false);
  const [memo, setMemo] = useState<{ text: string | null; error?: string } | null>(null);
  const [memoBusy, setMemoBusy] = useState(false);
  const inputs = useMemo(() => defaultInputs(), []);

  const live = cases.map((c) => c.claim);
  const usingLive = live.length > 0;
  const result = useMemo(
    () => (policy ? advise(usingLive ? live : VOLUME_CLAIMS, policy, inputs, relax) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [policy, cases, relax, inputs],
  );

  if (isLoading || !policy || !result) return <p className="label-mono">Loading</p>;
  const b = result.baseline;

  const createDraft = async (goal: Goal, s: Score) => {
    const id = nextVersionId(versions.map((v) => v.id));
    const config = draftFrom(policy, s, id, goal);
    const { error } = await supabase.from("policy_versions").insert({
      id,
      config: config as never,
      description: config.description,
      status: "draft",
      created_by: `${me.name} (advisor)`,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["policy"] });
    toast(`Draft ${id} created from the advisor`, {
      description: "Check it on Change impact before activating.",
      action: {
        label: "See impact",
        onClick: () => navigate({ to: "/impact", search: { v: id } }),
      },
    });
  };

  const askAi = async () => {
    setMemoBusy(true);
    const pack = (s: Score) => ({
      quote_limit_eur: s.limit,
      second_check_margin_eur: s.margin,
      random_qa_share: s.qa,
      cost_per_year_eur: Math.round(s.total),
      reviewer_hours_per_year: Math.round(s.hours),
      expected_loss_per_year_eur: Math.round(s.risk),
      avg_days_to_decision: Number(s.days.toFixed(2)),
      auto_processed_share: Number(s.shares.routine_processing.toFixed(3)),
      relaxes_written_policy: result.relaxes(s),
    });
    try {
      setMemo(
        await advisorMemo({
          data: {
            claims: result.claims,
            mode: relax ? "relax" : "within",
            baseline: pack(b) as never,
            suggestions: Object.fromEntries(
              GOALS.map((g) => [g.key, pack(result.best[g.key])]),
            ) as never,
            assumptions: { ...ADVISOR_ASSUMPTIONS, claims_per_year: inputs.claimsPerYear },
          },
        }),
      );
    } catch (e) {
      setMemo({ text: null, error: (e as Error).message });
    } finally {
      setMemoBusy(false);
    }
  };

  const points = result.candidates.map((c) => ({
    x: Math.round(c.hours),
    y: Math.round(c.total),
    limit: c.limit,
    z: 40,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Policy owner"
        title="Policy advisor"
        sub={`Tried ${result.evaluated.toLocaleString("en-US")} combinations of quote limit, second-check margin and random QA on ${result.claims} open claims${usingLive ? "" : " (demo set)"}. Suggestions become drafts; you check them on Change impact and approve.`}
        right={
          <div className="flex items-center gap-1 rounded-full bg-surface-2 p-0.5 text-[12.5px] ring-1 ring-line">
            {(
              [
                [false, "Within current rules"],
                [true, "Also relax rules"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setRelax(v);
                  setMemo(null);
                }}
                className={cn(
                  "rounded-full px-3 py-1.5",
                  relax === v ? "bg-white font-medium shadow-[var(--shadow-lift)]" : "text-text-2",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="card-quiet mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 text-[13px]">
        <span className="font-medium">Today ({policy.version.toUpperCase()})</span>
        <span className="text-text-2">Quote limit {eur0(b.limit)}</span>
        <span className="text-text-2">Second check {eur0(b.margin)}</span>
        <span className="text-text-2">Random QA {Math.round(b.qa * 100)}%</span>
        <span className="text-text-2">·</span>
        <span>{eurCompact(b.total)}/yr</span>
        <span>{Math.round(b.hours).toLocaleString("en-US")} reviewer h/yr</span>
        <span>{b.days.toFixed(2)} days to decision</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-text-3">
          <Lock className="size-3.5" strokeWidth={1.7} /> Locked: red flags, claim types, EV rule,
          documents, blank fields
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {GOALS.map((g) => {
          const s = result.best[g.key];
          const relaxes = result.relaxes(s);
          const sameLimit = s.limit === b.limit;
          return (
            <Card key={g.key} className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: GOAL_COLOR[g.key] }} />
                <h2 className="section-title">{g.title}</h2>
              </div>
              <p className="mt-1 text-[12.5px] text-text-2">{g.blurb}</p>

              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ["Quote limit", eur0(s.limit), s.limit !== b.limit],
                  ["Second check", eur0(s.margin), s.margin !== b.margin],
                  ["Random QA", `${Math.round(s.qa * 100)}%`, s.qa !== b.qa],
                ].map(([k, v, changed]) => (
                  <div
                    key={k as string}
                    className={cn(
                      "rounded-[10px] px-2 py-2.5",
                      changed ? "bg-white ring-1 ring-link/40" : "bg-surface-2",
                    )}
                  >
                    <dt className="text-[11.5px] text-text-2">{k}</dt>
                    <dd className="num mt-0.5 text-[16px] font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>

              <dl className="mt-4 space-y-1.5 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-text-2">Cost per year</dt>
                  <dd className="num">
                    {eurCompact(s.total)} {delta(s.total - b.total, eurCompact)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-2">Reviewer hours</dt>
                  <dd className="num">
                    {Math.round(s.hours).toLocaleString("en-US")}{" "}
                    {delta(Math.round(s.hours - b.hours), (x) => `${x.toLocaleString("en-US")} h`)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-2">Days to decision</dt>
                  <dd className="num">
                    {s.days.toFixed(2)}{" "}
                    {delta(Number((s.days - b.days).toFixed(2)), (x) => x.toFixed(2))}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-2">Expected losses</dt>
                  <dd className="num">
                    {eurCompact(s.risk)} {delta(s.risk - b.risk, eurCompact)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-2">Auto-processed</dt>
                  <dd className="num">{Math.round(s.shares.routine_processing * 100)}%</dd>
                </div>
              </dl>

              <p
                className={cn(
                  "mt-4 rounded-[10px] px-3 py-2 text-[12px]",
                  relaxes ? "bg-[oklch(0.97_0.03_60)] text-wait" : "bg-surface-2 text-text-2",
                )}
              >
                {relaxes
                  ? `Raises the limit above ${eur0(b.limit)}: relaxes the written policy and needs compliance approval.`
                  : sameLimit
                    ? "Keeps the written policy. Only operational settings change (second-check margin, QA)."
                    : "Stricter than today: within the written policy."}
              </p>

              <div className="mt-auto pt-4">
                <Button
                  className="w-full"
                  variant={sameLimit ? "outline" : "default"}
                  disabled={sameLimit}
                  onClick={() => void createDraft(g.key, s)}
                >
                  {sameLimit ? "No policy change needed" : `Create draft · limit ${eur0(s.limit)}`}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <h2 className="section-title">Cost vs reviewer time</h2>
          <p className="mt-1 text-[13px] text-text-2">
            Best setting per quote limit. Down and left is better.
          </p>
          <div className="mt-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                <CartesianGrid stroke="var(--line)" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Reviewer hours"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--text-2)" }}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k h`}
                  domain={["dataMin - 200", "dataMax + 200"]}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Cost"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--text-2)" }}
                  tickFormatter={(v) => eurCompact(v)}
                  domain={["dataMin - 5000", "dataMax + 5000"]}
                  width={56}
                />
                <ZAxis dataKey="z" range={[40, 40]} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }}
                  formatter={(v: number, name: string) =>
                    name === "Cost"
                      ? [eur0(v), "Cost per year"]
                      : [`${v.toLocaleString("en-US")} h`, "Reviewer hours"]
                  }
                  labelFormatter={() => ""}
                />
                <Scatter name="Limits" data={points} fill={SERIES.soft} />
                <Scatter
                  name="Today"
                  data={[{ x: Math.round(b.hours), y: Math.round(b.total), z: 40 }]}
                  fill="var(--text-2)"
                />
                {GOALS.map((g) => (
                  <Scatter
                    key={g.key}
                    name={g.title}
                    data={[
                      {
                        x: Math.round(result.best[g.key].hours),
                        y: Math.round(result.best[g.key].total),
                        z: 40,
                      },
                    ]}
                    fill={GOAL_COLOR[g.key]}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-2">
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: SERIES.soft }} /> Other
              limits
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-text-2" /> Today
            </li>
            {GOALS.map((g) => (
              <li key={g.key} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: GOAL_COLOR[g.key] }} />{" "}
                {g.title}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">Consultant memo</h2>
            <Button
              size="sm"
              variant="outline"
              className="bg-white"
              onClick={() => void askAi()}
              disabled={memoBusy}
            >
              <Sparkles className="size-3.5" strokeWidth={1.8} />{" "}
              {memoBusy ? "Writing…" : memo?.text ? "Rewrite" : "Ask the AI consultant"}
            </Button>
          </div>
          {memo?.text ? (
            <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed">{memo.text}</p>
          ) : (
            <div className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-text-2">
              {GOALS.map((g) => {
                const s = result.best[g.key];
                return (
                  <p key={g.key}>
                    <strong className="font-medium text-foreground">{g.title}:</strong> limit{" "}
                    {eur0(s.limit)}, second check {eur0(s.margin)}, QA {Math.round(s.qa * 100)}% →{" "}
                    {eurCompact(s.total)}/yr ({s.total <= b.total ? "−" : "+"}
                    {eurCompact(Math.abs(s.total - b.total))}),{" "}
                    {Math.round(s.hours).toLocaleString("en-US")} reviewer hours,{" "}
                    {s.days.toFixed(2)} days to decision
                    {result.relaxes(s) ? ", needs compliance approval" : ""}.
                  </p>
                );
              })}
              {memo?.error && (
                <p className="text-[12px] text-text-3">
                  AI memo unavailable: {memo.error}. The summary above is computed directly.
                </p>
              )}
            </div>
          )}
          <p className="mt-auto pt-4 text-[12px] text-text-3">
            Numbers come from the optimizer, not the AI. Assumptions: a €1,000 auto-processed claim
            needs a person with {Math.round(ADVISOR_ASSUMPTIONS.hiddenIssueAt1000 * 1000) / 10}%
            chance (rising with the amount); checks catch{" "}
            {Math.round(ADVISOR_ASSUMPTIONS.checkCatch * 100)}% of issues; costs and times from the
            business case.
          </p>
        </Card>
      </div>
    </div>
  );
}
