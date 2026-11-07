import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WorkEvent } from "./reviewer-workstream";

export const dashboardActivityQuery = queryOptions({
  queryKey: ["dashboard-activity"],
  queryFn: async (): Promise<WorkEvent[]> => {
    const events: WorkEvent[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("case_events")
        .select("case_id,type,actor,created_at,payload")
        .in("type", ["message_received", "documents_received", "retriaged", "policy_change", "confirmed", "qa_confirmed", "override"])
        .order("created_at").order("id").range(from, from + 999);
      if (error) throw error;
      events.push(...(data as WorkEvent[]));
      if (data.length < 1000) return events;
    }
  },
  refetchInterval: 30_000,
});