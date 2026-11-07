import { Link } from "@tanstack/react-router";
import { Avatar, Chip, StatusDot, Unknown, fmtEur } from "./ui";
import type { CaseRow } from "@/lib/data";
import { isClosed } from "@/lib/csv";
import { cn } from "@/lib/utils";

const ageLabel = (iso: string | null) => {
  if (!iso) return "";
  const h = (Date.now() - new Date(iso).getTime()) / 3600e3;
  return h < 24 ? `${Math.max(1, Math.round(h))}h` : `${Math.floor(h / 24)}d`;
};

export function contextLine(c: CaseRow) {
  const q = c.workflow?.queue;
  if (!c.decision) return "";
  if (q === "auto_processed") return c.workflow?.qa_sample ? "Random QA sample – please confirm" : "All checks passed";
  return c.decision.explanation ?? "";
}

export function ClaimsTable({ rows }: { rows: CaseRow[] }) {
  if (!rows.length) return <p className="py-12 text-center text-text-2">No cases here.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line">
            {["Case", "Summary", "Recommendation", "Rule", "Why", "Amount", "Age", "Assignee"].map((h) => (
              <th key={h} className="label-mono px-3 py-2.5 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const closed = isClosed(c.claim.case_status);
            const overdue = c.workflow?.sla_due_at && !closed && new Date(c.workflow.sla_due_at) < new Date() && (c.workflow.queue === "on_you" || c.workflow.qa_sample);
            const unknown = (c.decision?.missing_fields ?? []).some((f) => c.claim[f] === null);
            return (
              <tr key={c.claim.case_id} className="relative h-14 border-b border-line last:border-0 hover:bg-surface-2">
                <td className="whitespace-nowrap px-3 font-mono text-[12px]">
                  <Link to="/claims/$caseId" params={{ caseId: c.claim.case_id }} className="after:absolute after:inset-0 focus-visible:outline-none">
                    {c.claim.case_id}
                  </Link>
                </td>
                <td className="max-w-[320px] px-3">
                  <div className="truncate">{c.claim.claim_summary}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.workflow?.qa_sample && <Chip>QA sample</Chip>}
                    {c.workflow?.queue === "on_you" && !c.workflow.assignee && <Chip>Unassigned</Chip>}
                    {closed && <Chip>Closed</Chip>}
                    {unknown && <Chip className="border-dashed">Unknown fields</Chip>}
                    {c.intake?.channel === "phone" && <Chip>Phone</Chip>}
                  </div>
                </td>
                <td className="px-3">{c.decision && <StatusDot rec={c.decision.recommendation} closed={closed} />}</td>
                <td className="px-3 font-mono text-[11px] uppercase text-text-2">{c.decision?.rule_id}</td>
                <td className="max-w-[220px] truncate px-3 text-text-2">{contextLine(c)}</td>
                <td className="num px-3">{c.claim.quote_eur === null ? <Unknown /> : fmtEur(c.claim.quote_eur)}</td>
                <td className={cn("num px-3 font-mono text-[12px]", overdue ? "text-action" : "text-text-2")}>{ageLabel(c.claim.received_at)}</td>
                <td className="px-3"><Avatar name={c.workflow?.assignee} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
