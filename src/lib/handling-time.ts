import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function handlingSummary(durations: (number | null | undefined)[]) {
  const seconds = durations.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);
  return { n: seconds.length, avg: seconds.length ? Math.round(seconds.reduce((a, b) => a + b, 0) / seconds.length) : null };
}
export const fmtSecs = (s: number) => s < 90 ? `${s}s` : `${Math.round(s / 60)} min`;
export const handlingQuery = queryOptions({
  queryKey: ["handling-today"],
  queryFn: async () => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const [ev, ov] = await Promise.all([
      supabase.from("case_events").select("payload").in("type", ["confirmed", "qa_confirmed"]).gte("created_at", since.toISOString()),
      supabase.from("overrides").select("handling_seconds").gte("created_at", since.toISOString()),
    ]);
    if (ev.error) throw ev.error;
    if (ov.error) throw ov.error;
    return handlingSummary([
      ...((ev.data ?? []) as { payload: { handling_seconds?: number } | null }[]).map((e) => e.payload?.handling_seconds),
      ...((ov.data ?? []) as { handling_seconds: number | null }[]).map((o) => o.handling_seconds),
    ]);
  },
  refetchInterval: 30_000,
});