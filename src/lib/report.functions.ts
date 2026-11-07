import { createServerFn } from "@tanstack/react-start";
import { decide, type Claim, type Policy, type Recommendation } from "./triage";
import { queueFor } from "./lifecycle";
import { secondCheckReason } from "./second-check";
import { buildDocuments, type FactSource, type FormField, type TranscriptLine } from "./intake";
import { activeQuestions, answerLabel, EMPTY_ANSWERS, FIELD_SOURCE, toClaimFields, type AnswerKey, type ReportAnswers } from "./report-intake";

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
}

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

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
      policy_active_on_incident: a.policy_number ? true : null,
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
          policy_number: a.policy_number || null,
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
        quote: a.policy_number ? `Policy ${a.policy_number} found (demo register)` : "No policy number given",
        confidence: a.policy_number ? "confirmed" : "unconfirmed",
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

    return { case_id, recommendation: d.recommendation, rule_id: d.rule_id, policy_version: policy.version, missing_fields: d.missing_fields, reasons: d.reasons };
  });
