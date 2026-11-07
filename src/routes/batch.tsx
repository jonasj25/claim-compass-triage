import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/triage/Logo";
import { useMemo, useState } from "react";
import { Download, Lock } from "lucide-react";
import { parseClaimsCsv, type ParsedClaim } from "@/lib/csv";
import { BATCH_POLICY_V1, BATCH_POLICY_V2, batchToCsv, runBatch, type BatchRow } from "@/lib/batch";
import { RECOMMENDATION_LABELS, type Policy, type Recommendation } from "@/lib/triage";
import { Button } from "@/components/ui/button";
import { Card, Kpi, PageHeader, StatusDot } from "@/components/triage/ui";

// Public page (no sign-in): the judges' batch path in the browser.
// Nothing is uploaded or stored - the CSV is processed locally with the same engine and policies as engine/triage.py.
export const Route = createFileRoute("/batch")({
  head: () => ({
    meta: [
{ property: "og:title", content: "Batch run — Clearpath" },
{ property: "og:description", content: "Clearpath claims workspace: review evidence, policy decisions and case activity." },
{ property: "og:type", content: "website" },
{ name: "twitter:card", content: "summary" },
      { title: "Batch run — Clearpath" },
      {
        name: "description",
        content: "Upload a claims CSV and download results in the judging format.",
      },
    ],
  }),
  component: BatchPage,
});

const RECS: Recommendation[] = ["routine_processing", "request_information", "human_review"];

function policySummary(p: Policy) {
  const hr = p.human_review;
  const parts = [`quote > €${hr.quote_limit_eur ?? "—"}`];
  if (hr.review_repair_types.length) parts.push(`review: ${hr.review_repair_types.join(", ")}`);
  return parts.join(" · ");
}

function BatchPage() {
  const [fileName, setFileName] = useState("");
  const [claims, setClaims] = useState<ParsedClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const rows: BatchRow[] = useMemo(() => (claims ? runBatch(claims) : []), [claims]);
  const stats = useMemo(() => {
    const count = (k: "recommendation_v1" | "recommendation_v2") =>
      Object.fromEntries(RECS.map((r) => [r, rows.filter((x) => x[k] === r).length])) as Record<
        Recommendation,
        number
      >;
    return {
      v1: count("recommendation_v1"),
      v2: count("recommendation_v2"),
      recheck: rows.filter((r) => r.needs_recheck).length,
      closed: rows.filter((r) => r.closed).length,
    };
  }, [rows]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setFileName(f.name);
    try {
      const parsed = parseClaimsCsv(await f.text());
      if (!parsed.length) throw new Error("No claims found in this file.");
      setClaims(parsed);
    } catch (e) {
      setError((e as Error).message);
      setClaims(null);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([batchToCsv(rows)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `results_${fileName.replace(/\.csv$/i, "") || "claims"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const visible = showAll ? rows : rows.slice(0, 50);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight">Clearpath</span>
            <span className="label-mono mt-1 text-[9.5px]">Motor claims</span>
          </span>
        </div>
        <Link to="/" className="text-[13px] text-text-2 hover:text-foreground">
          Sign in to the app →
        </Link>
      </div>

      <PageHeader
        eyebrow="Judging path · no sign-in"
        title="Batch run"
        sub="Upload a claims CSV in the provided format. Every claim is triaged under v1 and v2; closed claims keep their v1 decision. Download the results CSV."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {[BATCH_POLICY_V1, BATCH_POLICY_V2].map((p) => (
          <div
            key={p.version}
            className="card-quiet flex items-center justify-between px-5 py-3 text-[13px]"
          >
            <span className="label-mono">Policy {p.version}</span>
            <span className="text-text-2">{policySummary(p)}</span>
          </div>
        ))}
      </div>

      <Card>
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-text-3 px-6 py-10 text-center hover:bg-surface-2">
          <span className="font-medium">{fileName || "Choose a claims CSV"}</span>
          <span className="mt-1 text-[12px] text-text-2">
            case_id, case_status, claim_summary, policy_active_on_incident, claim_type, repair_type,
            quote_eur, … evidence_conflict
          </span>
          <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-text-3">
            <Lock className="size-3" strokeWidth={1.5} /> Processed in your browser. Nothing is
            uploaded or stored.
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        {error && <p className="mt-4 text-[13px] text-action">{error}</p>}
      </Card>

      {rows.length > 0 && (
        <>
          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            <Kpi label="Claims" value={rows.length} sub={`${stats.closed} closed · frozen`} />
            <Kpi
              label="Auto-processed · Info · To review (v1)"
              value={`${stats.v1.routine_processing} · ${stats.v1.request_information} · ${stats.v1.human_review}`}
            />
            <Kpi
              label="Auto-processed · Info · To review (v2)"
              value={`${stats.v2.routine_processing} · ${stats.v2.request_information} · ${stats.v2.human_review}`}
            />
            <Kpi
              label="Needs recheck"
              value={stats.recheck}
              sub="open claims whose recommendation changes"
              tone={stats.recheck ? "action" : undefined}
            />
          </div>

          <div className="mt-6 flex items-center justify-between">
            <p className="label-mono">
              Results · {showAll || rows.length <= 50 ? rows.length : `first 50 of ${rows.length}`}
            </p>
            <Button onClick={download}>
              <Download className="size-4" strokeWidth={1.5} /> Download results CSV
            </Button>
          </div>

          <Card className="mt-3 overflow-x-auto p-0">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  {["Case", "v1", "Rule v1", "v2", "Rule v2", "Recheck", "Explanation"].map((h) => (
                    <th key={h} className="label-mono whitespace-nowrap px-4 py-3 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.case_id}
                    className={
                      r.needs_recheck
                        ? "tint-action border-b border-line"
                        : "border-b border-line last:border-0"
                    }
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px]">
                      {r.case_id}
                    </td>
                    <td className="whitespace-nowrap px-4">
                      <StatusDot rec={r.recommendation_v1} />
                    </td>
                    <td className="px-4 font-mono text-[11px] uppercase text-text-2">
                      {r.rule_v1}
                    </td>
                    <td className="whitespace-nowrap px-4">
                      <StatusDot rec={r.recommendation_v2} closed={r.closed} />
                    </td>
                    <td className="px-4 font-mono text-[11px] uppercase text-text-2">
                      {r.rule_v2}
                    </td>
                    <td className="px-4 font-mono text-[11px] uppercase">
                      {r.needs_recheck ? "yes" : r.closed ? "frozen" : "—"}
                    </td>
                    <td
                      className="min-w-[320px] px-4 py-2.5 text-[12px] text-text-2"
                      title={r.explanation}
                    >
                      {r.explanation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {rows.length > 50 && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="mt-3 text-[13px] text-text-2 hover:text-foreground"
            >
              {showAll ? "Show first 50" : `Show all ${rows.length}`}
            </button>
          )}
          <p className="mt-6 text-[12px] text-text-3">
            Same engine and policy files as the command-line batch (
            <span className="font-mono">python engine/triage.py in.csv out.csv</span>
            ); an automated test checks both give identical recommendations, rules and recheck
            flags. Labels: {RECS.map((r) => RECOMMENDATION_LABELS[r]).join(", ")}.
          </p>
        </>
      )}
    </div>
  );
}
