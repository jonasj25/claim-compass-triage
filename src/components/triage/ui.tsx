import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { RECOMMENDATION_LABELS, type Recommendation } from "@/lib/triage";
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

export function StatusDot({ rec, closed, className }: { rec: Recommendation; closed?: boolean; className?: string }) {
  if (closed)
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-text-2", className)}>
        <Lock className="size-3" strokeWidth={1.5} />
        {RECOMMENDATION_LABELS[rec]}
      </span>
    );
  return (
    <span className={cn("inline-flex items-center gap-2", TEXT[rec], className)}>
      <span className={cn("size-1.5 rounded-full", DOT[rec])} />
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
    <span className={cn("inline-flex items-center rounded-[6px] border border-line bg-surface px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-2", className)}>
      {children}
    </span>
  );
}

export function Avatar({ name }: { name: string | null | undefined }) {
  if (!name) return <span className="text-text-3">Unassigned</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] text-text-2 ring-1 ring-line">
        {initials(name)}
      </span>
      <span className="text-[13px]">{name}</span>
    </span>
  );
}

export function PageHeader({ eyebrow, title, sub, right }: { eyebrow?: string; title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="label-mono mb-2">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="mt-2 text-text-2">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card-quiet p-6", className)}>{children}</div>;
}

export function Kpi({ label, value, sub, tone, onClick, active }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "action" | "wait"; onClick?: () => void; active?: boolean }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "card-quiet flex flex-col items-start p-5 text-left",
        tone === "action" && "tint-action",
        tone === "wait" && "tint-wait",
        onClick && "cursor-pointer hover:border-text-3",
        active && "ring-2 ring-link",
      )}
    >
      <span className={cn("label-mono", tone && "text-current")}>{label}</span>
      <span className="num mt-3 text-[30px] font-medium leading-none tracking-tight">{value}</span>
      {sub && <span className={cn("mt-2 text-[12px]", tone ? "text-current opacity-90" : "text-text-2")}>{sub}</span>}
    </Comp>
  );
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
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
