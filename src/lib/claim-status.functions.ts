import { createServerFn } from "@tanstack/react-start";
import { customerStatus, plateKey, type CustomerStatus } from "./customer-status";
import { FIELD_LABELS, type Recommendation } from "./triage";

// Public claim status lookup. Runs on the server with the admin client because claims are only
// readable by signed-in staff. The customer proves it is their claim with the number plate.
// Returns only what the customer may see: status, first name, what is missing, last update.

export interface StatusResult {
  found: boolean;
  case_id?: string;
  status?: CustomerStatus;
  first_name?: string | null;
  received_at?: string | null;
  updated_at?: string | null;
  missing?: string[];
}

const MISSING_TEXT: Record<string, string> = {
  incident_report_present: "The incident report",
  itemized_quote_present: "A repair quote with line items (not just a total)",
  quote_eur: "The repair quote amount",
  policy_active_on_incident: "Your policy details for the incident date",
  claim_type: "What kind of damage it is",
  repair_type: "What kind of repair is needed",
  injury_reported: "Whether anyone was injured",
  liability_disputed: "Whether the other driver accepts fault",
  duplicate_flag: "Confirmation that this incident wasn't reported before",
  evidence_conflict: "Photos and the incident date",
};

export const getClaimStatus = createServerFn({ method: "POST" })
  .inputValidator((d: { case_id: string; plate: string }) => ({
    case_id: String(d.case_id ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 40),
    plate: String(d.plate ?? "").slice(0, 20),
  }))
  .handler(async ({ data }): Promise<StatusResult> => {
    if (!data.case_id || !plateKey(data.plate)) return { found: false };
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const [claim, intake, workflow, decision, outcome] = await Promise.all([
      db
        .from("claims")
        .select("case_id,case_status,received_at,raw")
        .eq("case_id", data.case_id)
        .maybeSingle(),
      db
        .from("claim_intake")
        .select("customer_name,plate")
        .eq("case_id", data.case_id)
        .maybeSingle(),
      db.from("case_workflow").select("queue,updated_at").eq("case_id", data.case_id).maybeSingle(),
      db
        .from("decisions")
        .select("recommendation,missing_fields,created_at")
        .eq("case_id", data.case_id)
        .eq("is_current", true)
        .maybeSingle(),
      db
        .from("outcomes")
        .select("final_outcome,recorded_at")
        .eq("case_id", data.case_id)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!claim.data) return { found: false };
    const raw = (claim.data.raw ?? {}) as Record<string, unknown>;
    const plates = [intake.data?.plate, raw.plate as string | undefined]
      .map(plateKey)
      .filter(Boolean);
    if (!plates.includes(plateKey(data.plate))) return { found: false }; // same answer as "no such claim"

    const status = customerStatus({
      caseStatus: claim.data.case_status,
      queue: workflow.data?.queue,
      recommendation: decision.data?.recommendation as Recommendation | undefined,
      outcome: outcome.data?.final_outcome,
    });
    const missing =
      status === "information_needed"
        ? ((decision.data?.missing_fields as string[] | null) ?? []).map(
            (f) => MISSING_TEXT[f] ?? FIELD_LABELS[f] ?? f,
          )
        : [];
    const updated =
      [workflow.data?.updated_at, decision.data?.created_at, outcome.data?.recorded_at]
        .filter(Boolean)
        .sort()
        .pop() ?? null;
    return {
      found: true,
      case_id: claim.data.case_id,
      status,
      first_name: (intake.data?.customer_name ?? "").split(" ")[0] || null,
      received_at: claim.data.received_at,
      updated_at: updated,
      missing,
    };
  });

// ---------------------------------------------------------------- customer portal: all my claims + one claim in detail
// Lookup by number plate only (demo: no further identity check). Returns only what may go to the customer:
// no rule ids, no internal notes, no reviewer names.

export interface MyClaimSummary {
  case_id: string;
  status: CustomerStatus;
  summary: string | null;
  received_at: string | null;
  updated_at: string | null;
  incoming_call: boolean;
}

export interface PortalEvent {
  at: string;
  text: string;
  kind: "system" | "customer" | "us" | "call";
}

export interface MyClaimDetail extends MyClaimSummary {
  first_name: string | null;
  plate: string | null;
  missing: string[];
  missing_fields: string[];
  facts: { label: string; value: string | null }[];
  events: PortalEvent[];
  call: { requested_at: string; missing_items: string[] } | null;
  can_call: boolean;
}

const CLAIM_TYPE_TEXT: Record<string, string> = { motor_own_damage: "Damage to my own car", theft: "Theft", other: "Something else" };
const REPAIR_TEXT: Record<string, string> = { standard: "Bodywork, glass or mechanical", ev_high_voltage_battery: "High-voltage battery" };
const yesNo = (v: unknown, yes: string, no: string) => (v === true ? yes : v === false ? no : null);
const eurText = (v: unknown) => (typeof v === "number" ? "€" + v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : null);

async function claimsForPlate(db: any, plate: string): Promise<string[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const key = plateKey(plate);
  if (!key) return [];
  const intake = await db.from("claim_intake").select("case_id,plate").not("plate", "is", null).limit(5000);
  return ((intake.data ?? []) as { case_id: string; plate: string | null }[]).filter((r) => plateKey(r.plate) === key).map((r) => r.case_id);
}

async function loadClaims(db: any, ids: string[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!ids.length) return [];
  const [claims, intake, wf, dec, out, ev] = await Promise.all([
    db.from("claims").select("*").in("case_id", ids),
    db.from("claim_intake").select("case_id,customer_name,plate,documents").in("case_id", ids),
    db.from("case_workflow").select("case_id,queue,updated_at").in("case_id", ids),
    db.from("decisions").select("case_id,recommendation,missing_fields,created_at").in("case_id", ids).eq("is_current", true),
    db.from("outcomes").select("case_id,final_outcome,recorded_at").in("case_id", ids).order("recorded_at", { ascending: false }),
    db.from("case_events").select("case_id,type,actor,payload,created_at").in("case_id", ids).order("created_at", { ascending: true }),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Row = { case_id: string } & Record<string, any>;
  const by = (rows: Row[] | null) => {
    const m = new Map<string, Row[]>();
    for (const r of rows ?? []) m.set(r.case_id, [...(m.get(r.case_id) ?? []), r]);
    return m;
  };
  const I = by(intake.data), W = by(wf.data), D = by(dec.data), O = by(out.data), E = by(ev.data);
  return ((claims.data ?? []) as Record<string, any>[]).map((c) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const id = c.case_id as string;
    const workflow = W.get(id)?.[0];
    const decision = D.get(id)?.[0];
    const outcome = O.get(id)?.[0];
    const events = (E.get(id) ?? []) as unknown as { type: string; actor: string | null; payload: Record<string, unknown> | null; created_at: string }[];
    const status = customerStatus({ caseStatus: c.case_status, queue: workflow?.queue, recommendation: decision?.recommendation as Recommendation | undefined, outcome: outcome?.final_outcome });
    const lastReq = [...events].reverse().find((e) => e.type === "call_requested");
    const lastEnd = [...events].reverse().find((e) => e.type === "call_ended" || e.type === "call_logged");
    const open = String(c.case_status ?? "").toLowerCase() !== "closed" && workflow?.queue !== "done";
    const pending = !!lastReq && (!lastEnd || lastEnd.created_at < lastReq.created_at) && open;
    const updated = [workflow?.updated_at, decision?.created_at, outcome?.recorded_at, events.at(-1)?.created_at].filter(Boolean).sort().pop() ?? null;
    return { c, intake: I.get(id)?.[0], workflow, decision, outcome, events, status, pending, lastReq, open, updated };
  });
}

function portalEvents(events: { type: string; payload: Record<string, unknown> | null; created_at: string }[]): PortalEvent[] {
  const out: PortalEvent[] = [];
  const items = (p: Record<string, unknown> | null) =>
    ((p?.missing_items as string[] | undefined) ?? []).map((f) => (MISSING_TEXT[f] ?? f).toLowerCase()).join(", ");
  for (const e of events) {
    const p = e.payload;
    const t =
      e.type === "received" ? { text: "We received your claim", kind: "customer" as const }
      : e.type === "triaged" ? { text: "Your claim was checked against our rules", kind: "system" as const }
      : e.type === "outreach_sent" ? { text: items(p) ? `We asked you for: ${items(p)}` : "We asked you for more information", kind: "us" as const }
      : e.type === "reminder_sent" ? { text: "We sent you a reminder", kind: "us" as const }
      : e.type === "message_sent" ? { text: "We sent you a message", kind: "us" as const }
      : e.type === "message_received" ? { text: "We received your message", kind: "customer" as const }
      : e.type === "call_requested" ? { text: "Mia from Clearpath called you", kind: "call" as const }
      : e.type === "call_logged" ? { text: "You spoke with Mia and gave us the missing details", kind: "call" as const }
      : e.type === "call_ended" ? { text: p?.outcome === "declined" ? "You declined Mia's call" : "Call ended", kind: "call" as const }
      : e.type === "documents_received" ? { text: "We received your information", kind: "customer" as const }
      : e.type === "file_uploaded" ? { text: `You uploaded ${String(p?.name ?? "a document")}`, kind: "customer" as const }
      : e.type === "retriaged" ? { text: "Your claim was checked again", kind: "system" as const }
      : e.type === "assigned" ? { text: "A claims specialist picked up your claim", kind: "us" as const }
      : e.type === "escalated" || e.type === "second_check_flagged" ? { text: "A claims specialist takes a second look", kind: "us" as const }
      : e.type === "confirmed" || e.type === "qa_confirmed" ? { text: "A claims specialist reviewed your claim", kind: "us" as const }
      : e.type === "closed" ? { text: "Your claim was closed", kind: "us" as const }
      : e.type === "reopened" ? { text: "Your claim was reopened and is being checked again", kind: "us" as const }
      : null;
    if (t) out.push({ at: e.created_at, ...t });
  }
  return out;
}

export const findMyClaims = createServerFn({ method: "POST" })
  .inputValidator((d: { plate: string; case_id?: string }) => ({
    plate: String(d?.plate ?? "").slice(0, 20),
    case_id: String(d?.case_id ?? "").trim().toUpperCase().slice(0, 40),
  }))
  .handler(async ({ data }): Promise<MyClaimSummary[]> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    let ids = await claimsForPlate(db, data.plate);
    if (data.case_id) ids = ids.filter((id) => id === data.case_id);
    const rows = await loadClaims(db, ids.slice(0, 50));
    return rows
      .map((r) => ({
        case_id: r.c.case_id as string,
        status: r.status,
        summary: (r.c.claim_summary as string | null) ?? null,
        received_at: (r.c.received_at as string | null) ?? null,
        updated_at: r.updated,
        incoming_call: r.pending,
      }))
      .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
  });

export const getMyClaim = createServerFn({ method: "POST" })
  .inputValidator((d: { plate: string; case_id: string }) => ({
    plate: String(d?.plate ?? "").slice(0, 20),
    case_id: String(d?.case_id ?? "").trim().toUpperCase().slice(0, 40),
  }))
  .handler(async ({ data }): Promise<MyClaimDetail | null> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const ids = (await claimsForPlate(db, data.plate)).filter((id) => id === data.case_id);
    const [r] = await loadClaims(db, ids);
    if (!r) return null;
    const c = r.c;
    const raw = (c.raw ?? {}) as Record<string, unknown>;
    const missingFields = r.status === "information_needed" ? ((r.decision?.missing_fields as string[] | null) ?? []) : [];
    return {
      case_id: c.case_id,
      status: r.status,
      summary: c.claim_summary ?? null,
      received_at: c.received_at ?? null,
      updated_at: r.updated,
      incoming_call: r.pending,
      first_name: ((r.intake?.customer_name as string | null) ?? "").split(" ")[0] || null,
      plate: (r.intake?.plate as string | null) ?? null,
      missing: missingFields.map((f) => MISSING_TEXT[f] ?? FIELD_LABELS[f] ?? f),
      missing_fields: missingFields,
      facts: [
        { label: "Date of incident", value: (raw.incident_date as string | null) ?? null },
        { label: "Type of claim", value: CLAIM_TYPE_TEXT[c.claim_type as string] ?? null },
        { label: "Repair", value: REPAIR_TEXT[c.repair_type as string] ?? null },
        { label: "Repair quote", value: eurText(c.quote_eur) },
        { label: "Quote lists each item", value: yesNo(c.itemized_quote_present, "Yes", "No, total only") },
        { label: "Incident or police report", value: yesNo(c.incident_report_present, "Received", "Not received") },
        { label: "Anyone injured", value: yesNo(c.injury_reported, "Yes", "No") },
        { label: "Other party disputes who caused it", value: yesNo(c.liability_disputed, "Yes", "No") },
      ],
      events: portalEvents(r.events),
      call: r.pending && r.lastReq ? { requested_at: r.lastReq.created_at, missing_items: ((r.lastReq.payload?.missing_items as string[]) ?? []) } : null,
      can_call: raw.source === "customer_report",
    };
  });
