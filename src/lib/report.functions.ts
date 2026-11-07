import { createServerFn } from "@tanstack/react-start";
import { decide, type Claim, type Policy, type Recommendation } from "./triage";
import { queueFor } from "./lifecycle";
import { secondCheckReason } from "./second-check";
import { tryAutoAssign } from "./auto-assign";
import { buildDocuments, type FactSource, type FormField, type TranscriptLine } from "./intake";
import { activeQuestions, answerLabel, CSV_COLUMNS, EMPTY_ANSWERS, FIELD_SOURCE, isUnknownText, knownClaimFields, toClaimFields, type AnswerKey, type ReportAnswers } from "./report-intake";

// Public claim report (/report). Runs on the server with the service role, because the customer is not signed in.
// The recommendation comes only from decide() with the active policy - exactly like a CSV import.

export interface ReportInput {
  channel: "online_form" | "phone";
  answers: ReportAnswers;
  /** Voice path only: the conversation, and which line each answer was heard in */
  transcript?: { speaker: "agent" | "customer"; text: string }[];
  heardIn?: Partial<Record<AnswerKey, number>>;
  files?: { incident_report?: string; quote?: string };
}

export interface ReportResult {
  case_id: string;
  recommendation: Recommendation;
  rule_id: string;
  policy_version: string;
  missing_fields: string[];
  reasons: string[];
  /** The stored claim as one row in the case CSV format */
  row: Record<string, string | number | boolean | null>;
}

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const keyOf = (p: unknown) => String(p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** A customer claim, recognised by the email from the report or by the number plate. */
const isOwner = (raw: Record<string, unknown>, email?: string, plate?: string) =>
  raw.source === "customer_report" &&
  ((!!email && String(raw.customer_email ?? "").toLowerCase() === email.toLowerCase()) || (!!keyOf(plate) && keyOf(raw.plate) === keyOf(plate)));

function clean(input: ReportInput): ReportInput {
  if (!input || typeof input !== "object" || !input.answers) throw new Error("Missing answers");
  const answers = { ...EMPTY_ANSWERS };
  for (const k of Object.keys(EMPTY_ANSWERS) as AnswerKey[]) answers[k] = clip(input.answers[k], k === "what_happened" ? 1200 : 120) as never;
  if (!answers.name || !answers.email || !answers.plate) throw new Error("Name, email and plate are required");
  return {
    channel: input.channel === "phone" ? "phone" : "online_form",
    answers,
    transcript: (input.transcript ?? []).slice(0, 80).map((l) => ({ speaker: l.speaker === "agent" ? "agent" : "customer", text: clip(l.text, 600) })),
    heardIn: input.heardIn ?? {},
    files: { incident_report: clip(input.files?.incident_report, 120) || undefined, quote: clip(input.files?.quote, 120) || undefined },
  };
}

export const submitClaimReport = createServerFn({ method: "POST" })
  .inputValidator((d: ReportInput) => clean(d))
  .handler(async ({ data }): Promise<ReportResult> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const a = data.answers;

    const pol = await db.from("policy_versions").select("config").eq("status", "active").order("created_at", { ascending: false }).limit(1).single();
    if (pol.error) throw new Error(pol.error.message);
    const policy = pol.data.config as unknown as Policy;

    // System checks (simulated for the demo, never guessed):
    // - policy register: a policy number was given -> active; none given -> unknown
    // - duplicate check: same plate and incident date already reported
    const plateKey = a.plate.toUpperCase().replace(/[\s-]+/g, "");
    let duplicate = false;
    if (a.incident_date) {
      const dup = await db.from("claims").select("case_id").eq("raw->>plate_key", plateKey).eq("raw->>incident_date", a.incident_date).limit(1);
      duplicate = (dup.data?.length ?? 0) > 0;
    }

    let case_id = `WEB-${String(Date.now()).slice(-6)}`;
    const taken = await db.from("claims").select("case_id").eq("case_id", case_id).maybeSingle();
    if (taken.data) case_id = `${case_id}-${Math.floor(Math.random() * 90 + 10)}`;

    const claim: Claim = {
      case_id,
      case_status: "open",
      policy_active_on_incident: isUnknownText(a.policy_number) ? null : true,
      duplicate_flag: duplicate,
      evidence_conflict: false,
      ...toClaimFields(a),
    };
    const d = decide(claim, policy);
    const queue = queueFor(d.recommendation, false);
    const second = secondCheckReason(claim, policy, d.recommendation);
    const now = new Date().toISOString();
    const must = (r: { error: { message: string } | null }) => {
      if (r.error) throw new Error(r.error.message);
    };

    must(
      await db.from("claims").insert({
        case_id,
        case_status: "open",
        claim_summary: claim.claim_summary,
        policy_active_on_incident: claim.policy_active_on_incident,
        claim_type: claim.claim_type,
        repair_type: claim.repair_type,
        quote_eur: claim.quote_eur,
        incident_report_present: claim.incident_report_present,
        itemized_quote_present: claim.itemized_quote_present,
        injury_reported: claim.injury_reported,
        liability_disputed: claim.liability_disputed,
        duplicate_flag: claim.duplicate_flag,
        evidence_conflict: claim.evidence_conflict,
        received_at: now,
        raw: {
          source: "customer_report",
          customer_email: a.email,
          policy_number: isUnknownText(a.policy_number) ? null : a.policy_number,
          incident_date: a.incident_date || null,
          plate: a.plate,
          plate_key: plateKey,
          files: data.files ?? {},
        },
      }),
    );
    must(
      await db.from("decisions").insert({
        case_id,
        policy_version: policy.version,
        recommendation: d.recommendation,
        rule_id: d.rule_id,
        explanation: d.reasons.join(". "),
        missing_fields: d.missing_fields,
      }),
    );
    must(
      await db.from("case_workflow").insert({
        case_id,
        queue,
        assignee: null,
        qa_sample: !!second,
        sla_due_at: queue === "on_you" || second ? new Date(Date.now() + 24 * 3600e3).toISOString() : null,
        updated_at: now,
      }),
    );
    // A reviewer is assigned straight away when the claim needs a person (lowest load; non-fatal).
    if (queue === "on_you" || second) await tryAutoAssign(db, [case_id]);

    // Intake record: an online form (numbered fields) or a voice transcript (numbered lines)
    const questions = activeQuestions(a);
    const form: FormField[] = questions.map((q, i) => ({ field: i + 1, label: q.label, value: answerLabel(q, a) || null }));
    const transcript: TranscriptLine[] = (data.transcript ?? []).map((l, i) => ({ line: i + 1, speaker: l.speaker, text: l.text }));
    const docs = buildDocuments(claim).map((doc) => {
      const file = doc.kind === "incident_report" ? data.files?.incident_report : doc.kind === "quote" ? data.files?.quote : undefined;
      return file ? { ...doc, name: file } : doc;
    });
    must(
      await db.from("claim_intake").insert({
        case_id,
        channel: data.channel,
        received_at: now,
        customer_name: a.name,
        plate: a.plate.toUpperCase(),
        form: (data.channel === "online_form" ? form : null) as never,
        transcript: (data.channel === "phone" && transcript.length ? transcript : null) as never,
        documents: docs as never,
      }),
    );

    // Where each fact came from: the form field / transcript line the customer answered in
    const facts: FactSource[] = Object.entries(FIELD_SOURCE).map(([field, key]) => {
      const value = (claim as Record<string, unknown>)[field];
      const qi = questions.findIndex((q) => q.key === key);
      const line = data.heardIn?.[key];
      const viaVoice = data.channel === "phone" && line && transcript[line - 1];
      return {
        field,
        source_type: viaVoice ? "transcript" : "form",
        ref: viaVoice ? `line ${line}` : qi >= 0 ? `field ${qi + 1}` : "form",
        quote: viaVoice ? transcript[line - 1].text : qi >= 0 ? `${questions[qi].label}: ${answerLabel(questions[qi], a) || "(empty)"}` : "(not asked)",
        confidence: value === null || value === undefined ? "unconfirmed" : "confirmed",
      };
    });
    facts.push(
      {
        field: "policy_active_on_incident",
        source_type: "system",
        ref: "policy register",
        quote: isUnknownText(a.policy_number) ? "No policy number given" : `Policy ${a.policy_number} found (demo register)`,
        confidence: isUnknownText(a.policy_number) ? "unconfirmed" : "confirmed",
      },
      { field: "duplicate_flag", source_type: "system", ref: "duplicate check", quote: duplicate ? "Same plate and incident date already reported" : "No duplicate found", confidence: "confirmed" },
      { field: "evidence_conflict", source_type: "system", ref: "evidence check", quote: "No conflict found at intake", confidence: "confirmed" },
    );
    must(await db.from("fact_sources").insert(facts.map((f) => ({ case_id, ...f }))));

    const actor = data.channel === "phone" ? "Customer · voice report" : "Customer · online form";
    must(
      await db.from("case_events").insert([
        { case_id, type: "received", actor, payload: { channel: data.channel } },
        { case_id, type: "triaged", actor: "Rules engine", payload: { recommendation: d.recommendation, rule_id: d.rule_id, policy_version: policy.version } },
        ...(queue === "waiting_customer" ? [{ case_id, type: "outreach_sent", actor: "Rules engine", payload: { channel: "email", missing_items: d.missing_fields } }] : []),
        ...(second ? [{ case_id, type: "second_check_flagged", actor: "Rules engine", payload: { reason: second, policy_version: policy.version } }] : []),
      ]),
    );
    if (queue === "waiting_customer") must(await db.from("outreach").insert({ case_id, channel: "email", missing_items: d.missing_fields }));

    const row = Object.fromEntries(CSV_COLUMNS.map((c) => [c, (claim as Record<string, unknown>)[c] ?? null])) as Record<string, string | number | boolean | null>;
    return { case_id, recommendation: d.recommendation, rule_id: d.rule_id, policy_version: policy.version, missing_fields: d.missing_fields, reasons: d.reasons, row };
  });

// ---------------------------------------------------------------- customer adds missing information later

export interface AddInfoInput {
  case_id: string;
  /** The customer is recognised by their email (confirmation page) or their number plate (status page) */
  email?: string;
  plate?: string;
  answers: Partial<ReportAnswers>;
  files?: { incident_report?: string; quote?: string };
  /** "call" when the answers came from Mia's follow-up call */
  via?: "portal" | "call";
  transcript?: { speaker: "agent" | "customer"; text: string }[];
}

/**
 * The customer sends what was missing. Only stated facts are written (unknowns stay unknown), then the claim
 * runs through the active policy again: complete and uncritical -> processed, a risk -> to review, still missing -> waiting.
 */
export const addClaimInfo = createServerFn({ method: "POST" })
  .inputValidator((d: AddInfoInput) => {
    if (!d?.case_id || (!d?.email && !d?.plate)) throw new Error("Missing reference");
    const answers: Partial<ReportAnswers> = {};
    for (const k of Object.keys(EMPTY_ANSWERS) as AnswerKey[]) if (d.answers?.[k] !== undefined) answers[k] = clip(d.answers[k], 120) as never;
    return {
      case_id: clip(d.case_id, 40),
      email: clip(d.email, 120).toLowerCase(),
      plate: clip(d.plate, 20),
      answers,
      files: d.files ?? {},
      via: d.via === "call" ? ("call" as const) : ("portal" as const),
      transcript: (d.transcript ?? []).slice(0, 60).map((l) => ({ speaker: l.speaker === "agent" ? "agent" : "customer", text: clip(l.text, 400) })),
    };
  })
  .handler(async ({ data }): Promise<ReportResult> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const must = (r: { error: { message: string } | null }) => {
      if (r.error) throw new Error(r.error.message);
    };
    const cur = await db.from("claims").select("*").eq("case_id", data.case_id).single();
    if (cur.error || !cur.data) throw new Error("Claim not found");
    const raw = (cur.data.raw ?? {}) as Record<string, unknown>;
    if (!isOwner(raw, data.email, data.plate)) throw new Error("Claim not found");
    if (String(cur.data.case_status ?? "").toLowerCase() === "closed") throw new Error("This claim is already closed");

    const pol = await db.from("policy_versions").select("config").eq("status", "active").order("created_at", { ascending: false }).limit(1).single();
    if (pol.error) throw new Error(pol.error.message);
    const policy = pol.data.config as unknown as Policy;

    const changes = knownClaimFields(data.answers);
    const claim = { ...(cur.data as unknown as Claim), ...changes } as Claim;
    const d = decide(claim, policy);
    const queue = queueFor(d.recommendation, false);
    const second = secondCheckReason(claim, policy, d.recommendation);
    const now = new Date().toISOString();
    const fields = Object.keys(changes);

    if (fields.length) {
      const files: Record<string, string | undefined> = { ...((raw.files as Record<string, string | undefined>) ?? {}), ...data.files };
      const newRaw = { ...raw, ...(data.answers.policy_number && !isUnknownText(data.answers.policy_number) ? { policy_number: data.answers.policy_number } : {}), files };
      must(await db.from("claims").update({ ...changes, raw: newRaw } as never).eq("case_id", data.case_id));
      const docs = buildDocuments(claim).map((doc) => {
        const f = doc.kind === "incident_report" ? files.incident_report : doc.kind === "quote" ? files.quote : undefined;
        return f ? { ...doc, name: f } : doc;
      });
      must(await db.from("claim_intake").update({ documents: docs as never }).eq("case_id", data.case_id));
      must(
        await db.from("fact_sources").insert(
          fields.map((field) => ({
            case_id: data.case_id,
            field,
            source_type: data.via === "call" ? "transcript" : "form",
            ref: data.via === "call" ? "follow-up call" : "customer follow-up",
            quote: `${field} = ${String((changes as Record<string, unknown>)[field])}`,
            confidence: "confirmed",
          })),
        ),
      );
    }
    must(await db.from("outreach").update({ status: "answered" }).eq("case_id", data.case_id).in("status", ["sent", "reminded"]));
    must(await db.from("decisions").update({ is_current: false }).eq("case_id", data.case_id).eq("is_current", true));
    must(
      await db.from("decisions").insert({ case_id: data.case_id, policy_version: policy.version, recommendation: d.recommendation, rule_id: d.rule_id, explanation: d.reasons.join(". "), missing_fields: d.missing_fields }),
    );
    must(
      await db.from("case_workflow").update({
        queue,
        qa_sample: !!second,
        sla_due_at: queue === "on_you" || second ? new Date(Date.now() + 24 * 3600e3).toISOString() : null,
        updated_at: now,
      }).eq("case_id", data.case_id),
    );
    // Now needs a person: assign a reviewer straight away (lowest load; non-fatal).
    if (queue === "on_you" || second) await tryAutoAssign(db, [data.case_id]);
    must(
      await db.from("case_events").insert([
        ...(data.via === "call"
          ? [{ case_id: data.case_id, type: "call_logged", actor: "Mia · voice agent", payload: { channel: "portal_call", fields, transcript: data.transcript } }]
          : []),
        { case_id: data.case_id, type: "documents_received", actor: data.via === "call" ? "Customer · call with Mia" : "Customer · online follow-up", payload: { fields } },
        { case_id: data.case_id, type: "retriaged", actor: "Rules engine", payload: { recommendation: d.recommendation, rule_id: d.rule_id, policy_version: policy.version } },
        ...(queue === "waiting_customer" ? [{ case_id: data.case_id, type: "outreach_sent", actor: "Rules engine", payload: { channel: "email", missing_items: d.missing_fields } }] : []),
        ...(second ? [{ case_id: data.case_id, type: "second_check_flagged", actor: "Rules engine", payload: { reason: second, policy_version: policy.version } }] : []),
      ]),
    );
    if (queue === "waiting_customer") must(await db.from("outreach").insert({ case_id: data.case_id, channel: "email", missing_items: d.missing_fields }));

    const row = Object.fromEntries(CSV_COLUMNS.map((c) => [c, (claim as Record<string, unknown>)[c] ?? null])) as Record<string, string | number | boolean | null>;
    return { case_id: data.case_id, recommendation: d.recommendation, rule_id: d.rule_id, policy_version: policy.version, missing_fields: d.missing_fields, reasons: d.reasons, row };
  });

// ---------------------------------------------------------------- customer claim page (portal)

export interface ClaimStatus {
  case_id: string;
  name: string | null;
  summary: string | null;
  recommendation: Recommendation | null;
  rule_id: string | null;
  policy_version: string | null;
  missing_fields: string[];
  queue: string | null;
  /** A reviewer started a call that the customer has not answered or ended yet */
  incoming_call: { requested_at: string; missing_items: string[] } | null;
  row: Record<string, string | number | boolean | null>;
}

async function ownClaim(db: any, case_id: string, email: string, plate = "") {
  const cur = await db.from("claims").select("*").eq("case_id", case_id).single();
  const raw = ((cur.data?.raw ?? {}) as Record<string, unknown>) || {};
  if (cur.error || !cur.data || !isOwner(raw, email, plate)) throw new Error("Claim not found");
  return cur.data as Record<string, unknown>;
}

export const getClaimStatus = createServerFn({ method: "POST" })
  .inputValidator((d: { case_id: string; email: string }) => ({ case_id: clip(d?.case_id, 40), email: clip(d?.email, 120) }))
  .handler(async ({ data }): Promise<ClaimStatus> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const claim = await ownClaim(db, data.case_id, data.email);
    const [dec, wf, intake, events] = await Promise.all([
      db.from("decisions").select("*").eq("case_id", data.case_id).eq("is_current", true).maybeSingle(),
      db.from("case_workflow").select("queue").eq("case_id", data.case_id).maybeSingle(),
      db.from("claim_intake").select("customer_name").eq("case_id", data.case_id).maybeSingle(),
      db.from("case_events").select("type,created_at,payload").eq("case_id", data.case_id).in("type", ["call_requested", "call_ended", "call_logged"]).order("created_at", { ascending: false }).limit(10),
    ]);
    const evs = (events.data ?? []) as { type: string; created_at: string; payload: Record<string, unknown> | null }[];
    const lastReq = evs.find((e) => e.type === "call_requested");
    const lastEnd = evs.find((e) => e.type === "call_ended" || e.type === "call_logged");
    const open = String(claim.case_status ?? "").toLowerCase() !== "closed" && wf.data?.queue !== "done";
    const pending = lastReq && (!lastEnd || lastEnd.created_at < lastReq.created_at) && open;
    return {
      case_id: data.case_id,
      name: (intake.data?.customer_name as string | null) ?? null,
      summary: (claim.claim_summary as string | null) ?? null,
      recommendation: (dec.data?.recommendation as Recommendation | undefined) ?? null,
      rule_id: (dec.data?.rule_id as string | undefined) ?? null,
      policy_version: (dec.data?.policy_version as string | undefined) ?? null,
      missing_fields: (dec.data?.missing_fields as string[] | undefined) ?? [],
      queue: (wf.data?.queue as string | undefined) ?? null,
      incoming_call: pending ? { requested_at: lastReq!.created_at, missing_items: ((lastReq!.payload?.missing_items as string[]) ?? []) } : null,
      row: Object.fromEntries(CSV_COLUMNS.map((c) => [c, claim[c] ?? null])) as Record<string, string | number | boolean | null>,
    };
  });

/** The customer declined or hung up before anything was recorded. */
export const endClaimCall = createServerFn({ method: "POST" })
  .inputValidator((d: { case_id: string; email?: string; plate?: string; outcome: "declined" | "no_answer_given" }) => ({
    case_id: clip(d?.case_id, 40),
    email: clip(d?.email, 120),
    plate: clip(d?.plate, 20),
    outcome: d?.outcome === "declined" ? ("declined" as const) : ("no_answer_given" as const),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await ownClaim(db, data.case_id, data.email, data.plate);
    const r = await db.from("case_events").insert({ case_id: data.case_id, type: "call_ended", actor: "Customer", payload: { outcome: data.outcome } });
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });
