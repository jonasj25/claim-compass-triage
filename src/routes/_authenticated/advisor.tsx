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
import { ADVISOR_ASSUMPTIONS, advise, draftFrom, type Score } from "@/lib/advisor";
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
          "One balanced recommendation: never worse than today on cost, reviewer time, customer wait or risk.",
      },
    ],
  }),
  component: Advisor,
});

const REC_COLOR = "var(--ok-dot)";

function Delta({ value, fmt }: { value: number; fmt: (x: number) => string }) {
  if (Math.abs(value) < 1e-9) return <span className="text-text-3">same</span>;
  return (
    <span className={value < 0 ? "text-ok" : "text-action"}>
      {(value > 0 ? "+" : "−") + fmt(Math.abs(value))}
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

  const usingLive = cases.length > 0;
  const result = useMemo(
    () =>
      policy
        ? advise(usingLive ? cases.map((c) => c.claim) : VOLUME_CLAIMS, policy, inputs, relax)
        : null,
    [policy, cases, usingLive, relax, inputs],
  );

  if (isLoading || !policy || !result) return <p className="label-mono">Loading</p>;
  const b = result.baseline;
  const r = result.balanced;
  const relaxes = result.relaxes(r);
  const sameLimit = r.limit === b.limit;
  const unchanged = sameLimit && r.margin === b.margin;

  const createDraft = async () => {
    const id = nextVersionId(versions.map((v) => v.id));
    const config = draftFrom(policy, r, id, "balanced");
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

  const pack = (s: Score) => ({
    quote_limit_eur: s.limit,
    second_check_margin_eur: s.margin,
    cost_per_year_eur: Math.round(s.total),
    reviewer_hours_per_year: Math.round(s.hours),
    expected_loss_per_year_eur: Math.round(s.risk),
    avg_days_to_decision: Number(s.days.toFixed(3)),
    auto_processed_share: Number(s.shares.routine_processing.toFixed(3)),
    relaxes_written_policy: result.relaxes(s),
  });

  const askAi = async () => {
    setMemoBusy(true);
    try {
      setMemo(
        await advisorMemo({
          data: {
            claims: result.claims,
            mode: relax ? "relax" : "within",
            baseline: pack(b) as never,
            suggestions: { balanced: pack(r) } as never,
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

  const rows: {
    label: string;
    today: string;
    next: string;
    delta: number;
    fmt: (x: number) => string;
  }[] = [
    {
      label: "Cost per year",
      today: eurCompact(b.total),
      next: eurCompact(r.total),
      delta: r.total - b.total,
      fmt: eurCompact,
    },
    {
      label: "Reviewer hours per year",
      today: Math.round(b.hours).toLocaleString("en-US"),
      next: Math.round(r.hours).toLocaleString("en-US"),
      delta: Math.round(r.hours - b.hours),
      fmt: (x) => `${x.toLocaleString("en-US")} h`,
    },
    {
      label: "Customer wait (days to decision)",
      today: b.days.toFixed(2),
      next: r.days.toFixed(2),
      delta: Number((r.days - b.days).toFixed(3)),
      fmt: (x) => x.toFixed(2),
    },
    {
      label: "Expected losses per year",
      today: eurCompact(b.risk),
      next: eurCompact(r.risk),
      delta: Math.abs(r.risk - b.risk) < 500 ? 0 : r.risk - b.risk,
      fmt: eurCompact,
    },
    {
      label: "Auto-processed",
      today: `${Math.round(b.shares.routine_processing * 100)}%`,
      next: `${Math.round(r.shares.routine_processing * 100)}%`,
      delta: 0,
      fmt: () => "",
    },
  ];

  const points = result.candidates.map((c) => ({
    x: Math.round(c.hours),
    y: Math.round(c.total),
    z: 40,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Policy owner"
        title="Policy advisor"
        sub={`Tried ${result.evaluated.toLocaleString("en-US")} combinations on ${result.claims} open claims${usingLive ? "" : " (demo set)"}. The recommendation is never worse than today on cost, reviewer time, customer wait or expected losses.`}
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

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Card>
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: REC_COLOR }} />
            <h2 className="section-title">Recommended settings</h2>
          </div>
          <p className="mt-1 text-[13px] text-text-2">
            {unchanged
              ? "Today's settings are already the best balance on these claims."
              : "Better or equal on every measure at the same time: cheaper, less reviewer time, no slower for customers, no more risk."}
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-2 text-center">
            {(
              [
                ["Quote limit", eur0(b.limit), eur0(r.limit), r.limit !== b.limit],
                ["Second check", eur0(b.margin), eur0(r.margin), r.margin !== b.margin],
              ] as const
            ).map(([k, before, after, changed]) => (
              <div
                key={k}
                className={cn(
                  "rounded-[12px] px-2 py-3",
                  changed ? "bg-white ring-1 ring-link/40" : "bg-surface-2",
                )}
              >
                <dt className="text-[12px] text-text-2">{k}</dt>
                <dd className="num mt-1 text-[20px] font-semibold">{after}</dd>
                <dd className="mt-0.5 text-[11.5px] text-text-3">
                  {changed ? `today ${before}` : "unchanged"}
                </dd>
              </div>
            ))}
          </dl>

          <table className="mt-5 w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="label-mono py-2 font-normal"> </th>
                <th className="label-mono py-2 text-right font-normal">Today</th>
                <th className="label-mono py-2 text-right font-normal">Recommended</th>
                <th className="label-mono py-2 text-right font-normal">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-line last:border-0">
                  <td className="py-2.5">{row.label}</td>
                  <td className="num py-2.5 text-right text-text-2">{row.today}</td>
                  <td className="num py-2.5 text-right font-medium">{row.next}</td>
                  <td className="num py-2.5 text-right">
                    {row.label === "Auto-processed" ? (
                      ""
                    ) : (
                      <Delta value={row.delta} fmt={row.fmt} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p
            className={cn(
              "mt-4 rounded-[10px] px-3 py-2 text-[12.5px]",
              relaxes ? "bg-[oklch(0.97_0.03_60)] text-wait" : "bg-surface-2 text-text-2",
            )}
          >
            {relaxes
              ? `Raises the limit above ${eur0(b.limit)}: relaxes the written policy and needs compliance approval.`
              : sameLimit
                ? "Keeps the written policy. Only the second-check margin changes."
                : "Stricter than today: within the written policy."}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-text-3">
            <Lock className="size-3.5" strokeWidth={1.7} /> Locked: red flags, claim types, EV rule,
            documents, blank fields
          </p>

          <div className="mt-4">
            <Button
              className="w-full"
              variant={sameLimit ? "outline" : "default"}
              disabled={sameLimit}
              onClick={() => void createDraft()}
            >
              {sameLimit
                ? "No policy change needed: apply the operational settings"
                : `Create draft · limit ${eur0(r.limit)}`}
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="section-title">Cost vs reviewer time</h2>
            <p className="mt-1 text-[13px] text-text-2">
              Best setting per quote limit. Down and left is better.
            </p>
            <div className="mt-3 h-[220px]">
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
                    tickFormatter={(v) => `${(v / 1000).toFixed(1)}k h`}
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
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--line)",
                      fontSize: 12,
                    }}
                    formatter={(v: number, name: string) =>
                      name === "Cost"
                        ? [eur0(v), "Cost per year"]
                        : [`${v.toLocaleString("en-US")} h`, "Reviewer hours"]
                    }
                    labelFormatter={() => ""}
                  />
                  <Scatter name="Other limits" data={points} fill={SERIES.soft} />
                  <Scatter
                    name="Today"
                    data={[{ x: Math.round(b.hours), y: Math.round(b.total), z: 40 }]}
                    fill="var(--text-2)"
                  />
                  <Scatter
                    name="Recommended"
                    data={[{ x: Math.round(r.hours), y: Math.round(r.total), z: 40 }]}
                    fill={REC_COLOR}
                  />
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
              <li className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: REC_COLOR }} />{" "}
                Recommended
              </li>
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
              <div className="mt-3 text-[13.5px] leading-relaxed text-text-2">
                <p>
                  {unchanged
                    ? "Keep today's settings."
                    : `Set the quote limit to ${eur0(r.limit)} and the second-check margin to ${eur0(r.margin)}.`}{" "}
                  That saves {eurCompact(Math.max(0, b.total - r.total))} a year and{" "}
                  {Math.max(0, Math.round(b.hours - r.hours)).toLocaleString("en-US")} reviewer
                  hours, with customers waiting {r.days < b.days - 1e-9 ? "less" : "no longer"} and
                  no more expected losses
                  {relaxes ? ". Raising the limit needs compliance approval." : "."}
                </p>
                {memo?.error && (
                  <p className="mt-2 text-[12px] text-text-3">
                    AI memo unavailable: {memo.error}. The summary above is computed directly.
                  </p>
                )}
              </div>
            )}
            <p className="mt-4 text-[12px] text-text-3">
              Numbers come from the optimizer, not the AI. Assumptions: a €1,000 auto-processed
              claim needs a person with{" "}
              {Math.round(ADVISOR_ASSUMPTIONS.hiddenIssueAt1000 * 1000) / 10}% chance (rising with
              the amount); checks catch {Math.round(ADVISOR_ASSUMPTIONS.checkCatch * 100)}% of
              issues; costs and times from the business case.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
