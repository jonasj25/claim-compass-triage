// Small chart primitives for the ops pages. Thin bars (≤18px) with a 4px rounded data end,
// values always printed in text colour next to the mark (colour never carries meaning alone),
// 2px surface gaps between stacked segments, hover tooltips via title + focusable rows.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Recommendation } from "@/lib/triage";

export const REC_COLOR: Record<Recommendation, string> = {
  routine_processing: "var(--ok-dot)",
  request_information: "var(--wait-dot)",
  human_review: "var(--action-dot)",
};
/** One blue for every single-series chart; tints of the same blue for parts of one whole;
 *  greys for baselines and non-people costs. */
export const SERIES = {
  primary: "var(--chart-1)",
  strong: "var(--chart-1)",
  mid: "var(--chart-2)",
  light: "var(--chart-3)",
  soft: "var(--chart-4)",
  grey: "var(--chart-5)",
  /** the one highlight: the app's ink navy */
  ink: "var(--ink)",
};

export interface BarItem {
  key: string;
  label: ReactNode;
  value: number;
  display?: string;
  color?: string;
  hint?: string;
}

/** Horizontal bars, one per row, value at the tip. */
export function HBars({
  items,
  max,
  unit = "",
  empty = "No data yet.",
}: {
  items: BarItem[];
  max?: number;
  unit?: string;
  empty?: string;
}) {
  if (!items.length) return <p className="py-6 text-center text-[13px] text-text-2">{empty}</p>;
  const m = Math.max(max ?? 0, ...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li
          key={it.key}
          className="group grid grid-cols-[minmax(110px,38%)_1fr] items-center gap-3 text-[13px]"
          title={it.hint ?? `${it.display ?? it.value}${unit}`}
          tabIndex={0}
        >
          <span className="truncate text-text-2 group-hover:text-foreground">{it.label}</span>
          <span className="flex items-center gap-2">
            <span
              className="h-[14px] min-w-[2px] rounded-r-[4px] transition-opacity group-hover:opacity-80"
              style={{ width: `${(it.value / m) * 82}%`, background: it.color ?? SERIES.primary }}
            />
            <span className="num shrink-0 font-medium">
              {it.display ?? it.value}
              {unit}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** One stacked bar of shares with a legend that carries label, count and share. */
export function StackedShare({
  segments,
  total,
  height = 14,
}: {
  segments: Segment[];
  total?: number;
  height?: number;
}) {
  const t = total ?? segments.reduce((a, s) => a + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div>
      <div
        className="flex w-full gap-[2px] overflow-hidden rounded-[4px] bg-surface-2"
        style={{ height }}
      >
        {visible.map((s) => (
          <span
            key={s.key}
            title={`${s.label}: ${s.value} (${t ? Math.round((s.value / t) * 100) : 0}%)`}
            style={{ width: `${t ? (s.value / t) * 100 : 0}%`, background: s.color }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-text-2">{s.label}</span>
            <span className="num font-medium">{s.value}</span>
            <span className="num text-text-3">
              {t ? `${Math.round((s.value / t) * 100)}%` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A labelled comparison row: name, bar for a share (0..1), printed value, optional note. */
export function ShareRow({
  label,
  share,
  display,
  note,
  color,
  emphasis,
}: {
  label: ReactNode;
  share: number;
  display: string;
  note?: ReactNode;
  color?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(150px,34%)_1fr] items-center gap-4 py-2.5 text-[13px]">
      <div>
        <p className={cn(emphasis ? "font-medium text-foreground" : "text-text-2")}>{label}</p>
        {note && <p className="mt-0.5 text-[12px] text-text-3">{note}</p>}
      </div>
      <div className="flex items-center gap-3">
        <div className="h-[14px] flex-1 rounded-r-[4px] bg-surface-2">
          <div
            className="h-full rounded-r-[4px]"
            style={{
              width: `${Math.max(0, Math.min(1, share)) * 100}%`,
              background: color ?? SERIES.primary,
            }}
          />
        </div>
        <span className="num w-16 shrink-0 text-right font-semibold">{display}</span>
      </div>
    </div>
  );
}

/** 3×3 grid of counts, one sequential hue; the diagonal is "correct". */
export function HeatGrid({
  rows,
  cols,
  cell,
  rowTitle,
  colTitle,
}: {
  rows: { key: string; label: string }[];
  cols: { key: string; label: string }[];
  cell: (r: string, c: string) => number;
  rowTitle: string;
  colTitle: string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => cols.map((c) => cell(r.key, c.key))));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[3px] text-center text-[12.5px]">
        <thead>
          <tr>
            <th className="label-mono text-left font-normal">
              {rowTitle} ↓ · {colTitle} →
            </th>
            {cols.map((c) => (
              <th key={c.key} className="px-2 pb-1 font-normal text-text-2">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th className="pr-2 text-left font-normal text-text-2">{r.label}</th>
              {cols.map((c) => {
                const v = cell(r.key, c.key);
                const a = v / max;
                const diag = r.key === c.key;
                return (
                  <td
                    key={c.key}
                    title={`${r.label} labelled, ${c.label} recommended: ${v}`}
                    className={cn(
                      "num h-12 rounded-[8px] font-semibold",
                      v === 0 && "text-text-3",
                      diag && v > 0 && "ring-1 ring-foreground/15",
                    )}
                    style={{
                      background: v
                        ? `color-mix(in oklab, var(--chart-1) ${Math.round(12 + a * 58)}%, var(--surface))`
                        : "var(--surface-2)",
                      color: a > 0.6 ? "white" : undefined,
                    }}
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KindBadge({ kind }: { kind: "sourced" | "measured" | "assumption" }) {
  const map = {
    sourced: "bg-link/10 text-link",
    measured: "bg-[oklch(0.95_0.04_152)] text-ok",
    assumption: "bg-surface-2 text-text-2 ring-1 ring-line",
  } as const;
  const text = { sourced: "Sourced", measured: "Measured", assumption: "Assumption" } as const;
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", map[kind])}>
      {text[kind]}
    </span>
  );
}
