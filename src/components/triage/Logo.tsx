import { useId } from "react";
import { cn } from "@/lib/utils";

/** Clearpath mark: a fork where one branch becomes the clear next step. */
export function Logo({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("size-7 shrink-0 rounded-[8px] shadow-[0_3px_10px_-2px_oklch(0.55_0.18_258/0.45)]", className)}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5AB0FF" />
          <stop offset="1" stopColor="#2F5BEA" />
        </linearGradient>
        <linearGradient id={`h${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#g${id})`} />
      <rect width="64" height="64" rx="16" fill={`url(#h${id})`} />
      <path d="M27 51 V40 Q27 32 17 27.5" fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth="5" strokeLinecap="round" />
      <path d="M27 51 V40 Q27 27.5 39 24" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <circle cx="44.5" cy="22.5" r="6.5" fill="#fff" />
    </svg>
  );
}
