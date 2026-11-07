import { Link } from "@tanstack/react-router";
import { CLAIM_STATUS_LABEL, CLAIM_STATUSES, type ClaimStatus } from "@/lib/reviewer-workstream";
import { cn } from "@/lib/utils";

// One bar for all claims, split by status. Same status logic as the All claims tabs.
const SEGMENT: Record<ClaimStatus, string> = {
  to_review: "bg-action-dot",
  waiting_customer: "bg-wait-dot",
  auto_processed: "bg-ok-dot",
  done: "bg-text-3/45",
};

export function ClaimsProgress({ counts, className }: { counts: Record<ClaimStatus, number>; className?: string }) {
  const total = CLAIM_STATUSES.reduce((n, s) => n + counts[s], 0);
  const open = total - counts.done;
  return (
    <div className={cn("card-quiet px-5 py-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px]">
          <span className="num font-semibold">{open}</span> of <span className="num">{total}</span> claims still open
        </p>
        <p className="font-mono text-[11px] text-text-2">{total ? Math.round((counts.done / total) * 100) : 0}% done</p>
      </div>
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-line" role="img"
        aria-label={CLAIM_STATUSES.map((s) => `${CLAIM_STATUS_LABEL[s]} ${counts[s]}`).join(", ")}>
        {total > 0 && CLAIM_STATUSES.map((s) => counts[s] > 0 && (
          <span key={s} className={cn("h-full border-r-2 border-white/80 last:border-0", SEGMENT[s])} style={{ width: `${(counts[s] / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-text-2">
        {CLAIM_STATUSES.map((s) => (
          <li key={s}>
            <Link to="/claims" search={{ status: s }} className="inline-flex items-center gap-1.5 hover:text-foreground">
              <span className={cn("size-2 rounded-full", SEGMENT[s])} />
              {CLAIM_STATUS_LABEL[s]} <span className="num font-medium text-foreground">{counts[s]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
