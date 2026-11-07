import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Lock } from "lucide-react";
import type { ImportedRow, ImportResult } from "@/lib/import";
import { QUEUE_LABELS, type Queue } from "@/lib/lifecycle";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusDot, fmtEur } from "./ui";

type Filter = "all" | "on_you" | "second" | "waiting_customer" | "auto_processed" | "frozen";

const matches = (r: ImportedRow, f: Filter) =>
  f === "all" ||
  (f === "frozen"
    ? r.frozen
    : f === "second"
      ? !!r.secondCheck
      : !r.frozen && r.queue === (f as Queue));

/** Shows only the claims from one CSV import: what happened to each row. */
export function ImportResultDialog({
  open,
  onOpenChange,
  fileName,
  version,
  result,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fileName: string;
  version: string;
  result: ImportResult;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const rows = result.rows.filter((r) => matches(r, filter));
  const tiles: [Filter, string, number][] = [
    ["all", "All rows", result.rows.length],
    ["on_you", QUEUE_LABELS.on_you, result.byQueue.on_you ?? 0],
    ["second", "Second check", result.secondChecks],
    ["waiting_customer", QUEUE_LABELS.waiting_customer, result.byQueue.waiting_customer ?? 0],
    ["auto_processed", QUEUE_LABELS.auto_processed, result.byQueue.auto_processed ?? 0],
    ["frozen", "Closed, kept", result.frozen],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-line/70 px-7 pt-6 pb-4">
          <DialogTitle>This import · {fileName}</DialogTitle>
          <DialogDescription>
            {result.inserted} claims triaged with policy {version}
            {result.frozen ? `, ${result.frozen} closed claims left as decided` : ""}. Only claims
            from this file are shown.
          </DialogDescription>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tiles.map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                disabled={n === 0 && key !== "all"}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] ring-1 disabled:opacity-40",
                  filter === key
                    ? "bg-white font-medium shadow-[var(--shadow-lift)] ring-link/40"
                    : "bg-white/50 ring-line hover:bg-white",
                )}
              >
                {label}
                <span className="num text-text-2">{n}</span>
              </button>
            ))}
          </div>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-2 pb-4">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-background/95">
              <tr className="border-b border-line">
                {["Case", "Next step", "Why", "Quote", "Queue"].map((h) => (
                  <th key={h} className="label-mono px-4 py-2.5 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.case_id} className="border-b border-line/70 align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px]">
                    <Link
                      to="/claims/$caseId"
                      params={{ caseId: r.case_id }}
                      onClick={() => onOpenChange(false)}
                      className="hover:underline"
                    >
                      {r.case_id}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {r.frozen ? (
                      <span className="inline-flex items-center gap-1.5 text-text-2">
                        <Lock className="size-3" strokeWidth={1.5} /> Closed, kept as decided
                      </span>
                    ) : (
                      r.recommendation && <StatusDot rec={r.recommendation} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-2">
                    {r.frozen
                      ? "Already closed in the system; not re-evaluated."
                      : r.reasons.join("; ")}
                    {r.secondCheck && (
                      <p className="mt-1 text-[12px] text-wait">Second check: {r.secondCheck}</p>
                    )}
                  </td>
                  <td className="num whitespace-nowrap px-4 py-3">
                    {r.quote === null ? "unknown" : fmtEur(r.quote)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-text-2">
                    {r.queue ? QUEUE_LABELS[r.queue] : "—"}
                    {r.secondCheck ? " + check" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="py-10 text-center text-text-2">No claims in this group.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
