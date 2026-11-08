import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { overrideFor, type OverrideRow } from "./effective";
import type { Claim, Policy, Recommendation } from "./triage";
import type { Queue } from "./lifecycle";

export interface CaseRow {
  claim: Claim & { received_at: string | null; raw: Record<string, unknown> | null };
  decision: {
    id: string;
    policy_version: string;
    recommendation: Recommendation;
    rule_id: string;
    explanation: string | null;
    missing_fields: string[];
    needs_recheck: boolean;
  } | null;
  workflow: { queue: Queue; assignee: string | null; qa_sample: boolean; sla_due_at: string | null } | null;
  intake: { channel: string; customer_name: string | null; plate: string | null } | null;
  /** The reviewer's latest override of the current decision, if any (see effectiveRec) */
  override?: OverrideRow | null;
}

async function fetchAll<T>(table: string, select: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = (supabase.from as any)(table).select(select).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export const casesQuery = queryOptions({
  queryKey: ["cases"],
  queryFn: async (): Promise<CaseRow[]> => {
    const [claims, decisions, workflow, intake, overrides] = await Promise.all([
      fetchAll<any>("claims", "*"),
      fetchAll<any>("decisions", "id,case_id,policy_version,recommendation,rule_id,explanation,missing_fields,needs_recheck", (q) => q.eq("is_current", true)),
      fetchAll<any>("case_workflow", "case_id,queue,assignee,qa_sample,sla_due_at"),
      fetchAll<any>("claim_intake", "case_id,channel,customer_name,plate"),
      fetchAll<OverrideRow>("overrides", "case_id,decision_id,original_recommendation,new_recommendation,reviewer,reason_code,reason_text,created_at", (q) => q.order("created_at")),
    ]);
    const ov = new Map<string, OverrideRow[]>();
    for (const o of overrides) ov.set(o.case_id, [...(ov.get(o.case_id) ?? []), o]);
    const by = <T extends { case_id: string }>(rows: T[]) => new Map(rows.map((r) => [r.case_id, r]));
    const d = by(decisions), w = by(workflow), i = by(intake);
    return claims
      .map((c) => ({
        claim: { ...c, quote_eur: c.quote_eur === null ? null : Number(c.quote_eur) },
        decision: d.get(c.case_id) ?? null,
        workflow: w.get(c.case_id) ?? null,
        intake: i.get(c.case_id) ?? null,
        override: overrideFor(d.get(c.case_id)?.id ?? null, ov.get(c.case_id) ?? []),
      }))
      .sort((a, b) => a.claim.case_id.localeCompare(b.claim.case_id));
  },
});

export const activePolicyQuery = queryOptions({
  queryKey: ["policy", "active"],
  queryFn: async (): Promise<Policy> => {
    const { data, error } = await supabase
      .from("policy_versions")
      .select("config")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    return data.config as unknown as Policy;
  },
});

export const policyVersionsQuery = queryOptions({
  queryKey: ["policy", "versions"],
  queryFn: async () => {
    const { data, error } = await supabase.from("policy_versions").select("*").order("created_at");
    if (error) throw error;
    return data;
  },
});

export const caseDetailQuery = (caseId: string) =>
  queryOptions({
    queryKey: ["case", caseId],
    queryFn: async () => {
      const [claim, decision, workflow, intake, facts, events, overrides, comments] = await Promise.all([
        supabase.from("claims").select("*").eq("case_id", caseId).maybeSingle(),
        supabase.from("decisions").select("*").eq("case_id", caseId).eq("is_current", true).maybeSingle(),
        supabase.from("case_workflow").select("*").eq("case_id", caseId).maybeSingle(),
        supabase.from("claim_intake").select("*").eq("case_id", caseId).maybeSingle(),
        supabase.from("fact_sources").select("*").eq("case_id", caseId).order("created_at"),
        supabase.from("case_events").select("*").eq("case_id", caseId).order("created_at"),
        supabase.from("overrides").select("*").eq("case_id", caseId).order("created_at"),
        supabase.from("comments").select("*").eq("case_id", caseId).order("created_at"),
      ]);
      if (claim.error) throw claim.error;
      return {
        claim: claim.data ? { ...claim.data, quote_eur: claim.data.quote_eur === null ? null : Number(claim.data.quote_eur) } : null,
        decision: decision.data,
        workflow: workflow.data,
        intake: intake.data,
        facts: facts.data ?? [],
        events: events.data ?? [],
        overrides: overrides.data ?? [],
        comments: comments.data ?? [],
      };
    },
  });

export const overridesQuery = queryOptions({
  queryKey: ["overrides"],
  queryFn: async () => {
    const { data, error } = await supabase.from("overrides").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const outcomesQuery = queryOptions({
  queryKey: ["outcomes"],
  queryFn: async () => {
    const { data, error } = await supabase.from("outcomes").select("*").order("recorded_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});
