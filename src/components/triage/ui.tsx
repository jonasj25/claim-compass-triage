import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { RECOMMENDATION_LABELS, type Recommendation } from "@/lib/triage";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/role";

const DOT: Record<Recommendation, string> = {
  human_review: "bg-action-dot",
  request_information: "bg-wait-dot",
  routine_processing: "bg-ok-dot",
};
const TEXT: Record<Recommendation, string> = {
  human_review: "text-action",
  request_information: "text-wait",
  routine_processing: "text-ok",
};

export function StatusDot({ rec, closed, className, plain }: { rec: Recommendation; closed?: boolean; className?: string; plain?: boolean }) {
  if (closed)
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-text-2", className)}>
        <Lock className="size-3" strokeWidth={1.5} />
        {RECOMMENDATION_LABELS[rec]}
      </span>
    );
  const pill = "";
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", TEXT[rec], pill && "rounded-full px-2.5 py-0.5 text-[12.5px] font-medium", pill, className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[rec], plain && "size-2.5")} />
      {RECOMMENDATION_LABELS[rec]}
    </span>
  );
}

export function Unknown({ children = "unknown" }: { children?: ReactNode }) {
  return <span className="unknown-chip px-1.5 py-0.5 text-[12px]">{children}</span>;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("label-mono", className)}>{children}</span>;
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-[6px] border border-line/80 bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-2", className)}>
      {children}
    </span>
  );
}

export function Avatar({ name }: { name: string | null | undefined }) {
  if (!name) return <span className="text-text-3">Unassigned</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] font-medium text-text-2 ring-1 ring-line">
        {initials(name)}
      </span>
      <span className="text-[13px]">{name}</span>
    </span>
  );
}

export function PageHeader({ eyebrow, title, sub, right }: { eyebrow?: string; title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="page-header mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        
        <h1 className="page-title">{title}</h1>
        {sub && <p className="sr-only">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card-quiet p-4", className)}>{children}</div>;
}

export function Kpi({ label, value, sub, tone, onClick, active }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "action" | "wait"; onClick?: () => void; active?: boolean }) {
  const content = <><span className="num text-[20px] font-semibold leading-none">{value}</span><span className="mt-1 text-[11px] text-text-2">{label}</span>{sub && <span className="mt-1 text-[11px] text-text-2">{sub}</span>}</>;
  const cls = cn("kpi-item flex h-auto flex-col items-start rounded-none bg-transparent px-4 py-3 text-left", active && "bg-surface-2", tone === "action" && "text-action", tone === "wait" && "text-wait");
  return onClick ? <Button variant="ghost" onClick={onClick} aria-pressed={!!active} className={cls}>{content}</Button> : <div className={cls}>{content}</div>;
}

export function Placeholder({ text }: { text: string }) {
  return (
    <Card className="flex min-h-[220px] flex-col items-center justify-center text-center">
      <p className="text-text-2">{text}</p>
    </Card>
  );
}

export const fmtEur = (n: number | null | undefined) =>
  n === null || n === undefined ? null : "€" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} hours ago` : `${Math.floor(minutes / 1440)} days ago`;
};
