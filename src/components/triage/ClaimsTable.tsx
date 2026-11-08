import { Link } from "@tanstack/react-router";
import { effectiveRec } from "@/lib/effective";
import { Chip, StatusDot, Unknown, fmtEur } from "./ui";
import { useQuery } from "@tanstack/react-query";
import { activePolicyQuery, type CaseRow } from "@/lib/data";
import { secondCheckReason } from "@/lib/second-check";
import type { Policy } from "@/lib/triage";
import { isClosed } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { saveCaseNav } from "@/lib/case-nav";
import { humanize } from "@/lib/labels";
import { CLAIM_STATUS_LABEL, type ClaimStatus } from "@/lib/reviewer-workstream";

const STATUS_DOT: Record<ClaimStatus, string> = {
  to_review: "bg-action-dot",
  waiting_customer: "bg-wait-dot",
  auto_processed: "bg-ok-dot",
  done: "bg-text-3/50",
};

const ageLabel = (iso: string | null) => {
  if (!iso) return "";
  const h = (Date.now() - new Date(iso).getTime()) / 3600e3;
  return h < 24 ? `${Math.max(1, Math.round(h))}h` : `${Math.floor(h / 24)}d`;
};

const nearLimit = (c: CaseRow, policy?: Policy) =>
  !!(policy && c.workflow?.qa_sample && c.decision && secondCheckReason(c.claim, policy, effectiveRec(c) ?? c.decision.recommendation));

export function contextLine(c: CaseRow, policy?: Policy) {
  const q = c.workflow?.queue;
  if (!c.decision) return "";
  if (q === "auto_processed")
    return nearLimit(c, policy) ? "Close to the limit – second check" : c.workflow?.qa_sample ? "Random QA sample – please confirm" : "All checks passed";
  return humanize(c.decision.explanation ?? "");
}

export function ClaimsTable({ rows, navLabel = "Claims", statuses }: { rows: CaseRow[]; navLabel?: string; statuses?: Map<string, ClaimStatus> }) {
  const { data: policy } = useQuery(activePolicyQuery);
  if (!rows.length) return <p className="py-12 text-center text-text-2">No cases here.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line/80">
            {["Case", "Summary", ...(statuses ? ["Status"] : []), "Recommendation", "Rule", "Why", "Quote", "Age"].map((h) => (
              <th key={h} className={cn("px-3 py-3 text-[11px] font-medium text-text-2", (h === "Quote" || h === "Age") && "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const closed = isClosed(c.claim.case_status);
            const unknown = (c.decision?.missing_fields ?? []).some((f) => c.claim[f] === null);
            return (
              <tr key={c.claim.case_id} className="relative h-11 border-b border-line/70 last:border-0 hover:bg-surface-2">
                <td className="whitespace-nowrap px-3 font-mono text-[12px]">
                  {/* The link's overlay covers the whole row. */}
                  <Link
                    to="/claims/$caseId"
                    params={{ caseId: c.claim.case_id }}
                    onClick={() => saveCaseNav(navLabel, rows.map((r) => r.claim.case_id))}
                    className="after:absolute after:inset-0 focus-visible:outline-none"
                  >
                    {c.claim.case_id}
                  </Link>
                </td>
                <td className="max-w-[320px] px-3 py-2">
                  <div className="line-clamp-2">{c.claim.claim_summary}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.decision?.needs_recheck && !closed && (
                      <Chip className="pill-action border-transparent">Recheck · {c.decision.policy_version}</Chip>
                    )}
                    {c.workflow?.qa_sample && <Chip>{nearLimit(c, policy) ? "Second check" : "QA sample"}</Chip>}
                    {closed && !statuses && <Chip>Closed</Chip>}
                    {unknown && <Chip className="border-dashed">Unknown fields</Chip>}
                    {c.intake?.channel === "phone" && <Chip>Phone</Chip>}
                  </div>
                </td>
                {statuses && (() => { const st = statuses.get(c.claim.case_id); return (
                  <td className="whitespace-nowrap px-3">{st && <span className="inline-flex items-center gap-1.5"><span className={cn("size-2 rounded-full", STATUS_DOT[st])} />{CLAIM_STATUS_LABEL[st]}</span>}</td>
                ); })()}
                <td className="px-3">
                  {c.decision && (
                    <span className="inline-flex items-center gap-1.5" title={c.override ? `Changed by ${c.override.reviewer ?? "a reviewer"}${c.override.reason_text ? `: ${c.override.reason_text}` : ""}` : undefined}>
                      <StatusDot rec={effectiveRec(c) ?? c.decision.recommendation} closed={closed} />
                      {c.override && <span className="label-mono text-[9.5px] text-text-3">Reviewer</span>}
                    </span>
                  )}
                </td>
                <td className="px-3 font-mono text-[11px] uppercase text-text-2">{c.decision?.rule_id}</td>
                <td className="max-w-[220px] truncate px-3 text-text-2">{contextLine(c, policy)}</td>
                <td className="num px-3 text-right">{c.claim.quote_eur === null ? <Unknown /> : fmtEur(c.claim.quote_eur)}</td>
                <td className="num px-3 text-right font-mono text-[12px] text-text-2">{c.claim.received_at ? `${ageLabel(c.claim.received_at)} ago` : <Unknown />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
