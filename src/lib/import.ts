import { supabase } from "@/integrations/supabase/client";
import { isClosed, type ParsedClaim } from "./csv";
import { decide, type Policy, type Recommendation } from "./triage";
import { queueFor, type Queue } from "./lifecycle";
import { secondCheckReason } from "./second-check";
import { buildCsvFacts, buildDocuments } from "./intake";

// Optional extra CSV columns (ignored by the judging batch): customer_name, plate, received_at (ISO date).
const text = (v: string | undefined) => (v ?? "").trim() || null;
const receivedAt = (c: ParsedClaim, fallback: string) => {
  const v = text(c.raw.received_at);
  return v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : fallback;
};

const chunk = <T,>(a: T[], n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** One line per row of the imported file, for the "this import" window. */
export interface ImportedRow {
  case_id: string;
  summary: string | null;
  quote: number | null;
  frozen: boolean; // closed claim already in the system: left as decided
  recommendation: Recommendation | null;
  rule_id: string | null;
  reasons: string[];
  queue: Queue | null;
  secondCheck: string | null; // reason, if flagged for a second check near the limit
}

export interface ImportResult { inserted: number; frozen: number; byQueue: Record<string, number>; secondChecks: number; rows: ImportedRow[] }

export async function importClaims(claims: ParsedClaim[], policy: Policy, actor: string): Promise<ImportResult> {
  const ids = claims.map((c) => c.case_id);
  // Closed claims that already have a decision keep it forever.
  const frozen = new Set<string>();
  for (const part of chunk(ids)) {
    const { data } = await supabase.from("claims").select("case_id,case_status").in("case_id", part);
    for (const r of data ?? []) if (isClosed(r.case_status)) frozen.add(r.case_id);
  }
  const todo = claims.filter((c) => !frozen.has(c.case_id));
  const now = new Date().toISOString();
  const byQueue: Record<string, number> = {};

  const rows = todo.map((c) => {
    const d = decide(c, policy);
    const closed = isClosed(c.case_status);
    const queue = queueFor(d.recommendation, closed);
    byQueue[queue] = (byQueue[queue] ?? 0) + 1;
    const extras = Object.fromEntries(Object.entries(c.raw).filter(([k, v]) => v && !(k in c) ));
    // Recommendation stays routine; the flag only asks a person to double-check (see second-check.ts).
    const second = closed ? null : secondCheckReason(c, policy, d.recommendation);
    return { c, d, queue, extras, second };
  });

  for (const part of chunk(rows)) {
    const caseIds = part.map((r) => r.c.case_id);
    let res = await supabase.from("claims").upsert(part.map(({ c, extras }) => ({
      case_id: c.case_id, case_status: c.case_status ?? null, claim_summary: c.claim_summary ?? null,
      policy_active_on_incident: c.policy_active_on_incident, claim_type: c.claim_type, repair_type: c.repair_type,
      quote_eur: c.quote_eur, incident_report_present: c.incident_report_present, itemized_quote_present: c.itemized_quote_present,
      injury_reported: c.injury_reported, liability_disputed: c.liability_disputed, duplicate_flag: c.duplicate_flag,
      evidence_conflict: c.evidence_conflict, raw: { ...extras, row: c.row }, received_at: receivedAt(c, now),
    })));
    if (res.error) throw res.error;
    await supabase.from("decisions").update({ is_current: false }).in("case_id", caseIds).eq("is_current", true);
    res = await supabase.from("decisions").insert(part.map(({ c, d }) => ({
      case_id: c.case_id, policy_version: policy.version, recommendation: d.recommendation, rule_id: d.rule_id,
      explanation: d.reasons.join(". "), missing_fields: d.missing_fields,
    })));
    if (res.error) throw res.error;
    res = await supabase.from("case_workflow").upsert(part.map(({ c, queue, second }) => ({
      case_id: c.case_id, queue, assignee: null, qa_sample: !!second,
      sla_due_at: queue === "on_you" || second ? new Date(Date.now() + 24 * 3600e3).toISOString() : null, updated_at: now,
    })));
    if (res.error) throw res.error;
    res = await supabase.from("claim_intake").upsert(part.map(({ c }) => ({
      case_id: c.case_id, channel: "csv_import", received_at: receivedAt(c, now), documents: buildDocuments(c) as never,
      customer_name: text(c.raw.customer_name), plate: text(c.raw.plate),
    })));
    if (res.error) throw res.error;
    res = await supabase.from("fact_sources").insert(part.flatMap(({ c }) => buildCsvFacts(c, c.row).map((f) => ({ case_id: c.case_id, ...f }))));
    if (res.error) throw res.error;
    res = await supabase.from("case_events").insert(part.flatMap(({ c, d, queue, second }) => [
      { case_id: c.case_id, type: "received", actor: `CSV import · ${actor}`, payload: { channel: "csv_import", row: c.row } },
      { case_id: c.case_id, type: "triaged", actor: "Rules engine", payload: { recommendation: d.recommendation, rule_id: d.rule_id, policy_version: policy.version } },
      ...(queue === "waiting_customer" ? [{ case_id: c.case_id, type: "outreach_sent", actor: "Rules engine", payload: { channel: "email", missing_items: d.missing_fields } }] : []),
      ...(second ? [{ case_id: c.case_id, type: "second_check_flagged", actor: "Rules engine", payload: { reason: second, policy_version: policy.version } }] : []),
    ]));
    if (res.error) throw res.error;
    const waiting = part.filter((r) => r.queue === "waiting_customer");
    if (waiting.length) {
      res = await supabase.from("outreach").insert(waiting.map(({ c, d }) => ({ case_id: c.case_id, channel: "email", missing_items: d.missing_fields })));
      if (res.error) throw res.error;
    }
  }
  const done = new Map(rows.map((r) => [r.c.case_id, r]));
  const out: ImportedRow[] = claims.map((c) => {
    const r = done.get(c.case_id);
    return r
      ? { case_id: c.case_id, summary: c.claim_summary ?? null, quote: c.quote_eur, frozen: false, recommendation: r.d.recommendation, rule_id: r.d.rule_id, reasons: r.d.reasons, queue: r.queue, secondCheck: r.second }
      : { case_id: c.case_id, summary: c.claim_summary ?? null, quote: c.quote_eur, frozen: true, recommendation: null, rule_id: null, reasons: [], queue: null, secondCheck: null };
  });
  return { inserted: todo.length, frozen: frozen.size, byQueue, secondChecks: rows.filter((r) => r.second).length, rows: out };
}
