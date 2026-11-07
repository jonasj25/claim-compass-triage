// Builds claim_intake (transcript / form / documents) and fact_sources from structured fields ONLY.
import type { Claim } from "./triage";

export type Channel = "phone" | "online_form" | "csv_import";
export interface TranscriptLine { line: number; speaker: "agent" | "customer" | "system"; text: string }
export interface FormField { field: number; label: string; value: string | null }
export interface IntakeDocument {
  name: string;
  kind: "incident_report" | "quote" | "photos";
  status: "present" | "missing" | "incomplete" | "unknown";
  note: string;
}
export interface FactSource {
  field: string;
  source_type: "transcript" | "form" | "document" | "system" | "csv";
  ref: string;
  quote: string;
  confidence: "confirmed" | "unconfirmed";
}

const eur = (n: number) => "€" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const yn = (v: boolean | null) => (v === null ? null : v ? "Yes" : "No");

export function buildDocuments(c: Claim): IntakeDocument[] {
  const ir = c.incident_report_present;
  const iq = c.itemized_quote_present;
  const amount = c.quote_eur === null ? "amount unreadable" : eur(c.quote_eur);
  return [
    {
      name: "incident_report.pdf",
      kind: "incident_report",
      status: ir === null ? "unknown" : ir ? "present" : "missing",
      note: ir === null ? "Not stated" : ir ? "Received" : "Not received",
    },
    {
      name: "quote.pdf",
      kind: "quote",
      status: iq === null ? "unknown" : iq ? "present" : "incomplete",
      note: `${iq === null ? "Itemization unknown" : iq ? "Itemized" : "Total only"} · ${amount}`,
    },
    { name: "photos.zip", kind: "photos", status: "present", note: "Damage photos" },
  ];
}

function systemSources(c: Claim, evidenceQuote?: string): FactSource[] {
  const p = c.policy_active_on_incident;
  const d = c.duplicate_flag;
  const e = c.evidence_conflict;
  return [
    {
      field: "policy_active_on_incident",
      source_type: "system",
      ref: "policy register",
      quote: p === null ? "No match in policy register" : p ? "Policy active on incident date" : "No active policy on incident date",
      confidence: p === null ? "unconfirmed" : "confirmed",
    },
    {
      field: "duplicate_flag",
      source_type: "system",
      ref: "duplicate check",
      quote: d === null ? "Duplicate check not run" : d ? "Same incident reference already submitted" : "No duplicate found",
      confidence: d === null ? "unconfirmed" : "confirmed",
    },
    {
      field: "evidence_conflict",
      source_type: "system",
      ref: "evidence check",
      quote: e === null ? "Evidence check not run" : e ? (evidenceQuote ?? "Evidence conflicts with the reported facts") : "Evidence consistent",
      confidence: e === null ? "unconfirmed" : "confirmed",
    },
  ];
}

function documentSources(c: Claim, fallback: { incident: FactSource }): FactSource[] {
  const out: FactSource[] = [];
  const ir = c.incident_report_present;
  out.push(
    ir === null
      ? fallback.incident
      : { field: "incident_report_present", source_type: "document", ref: "incident_report.pdf", quote: ir ? "Incident report received" : "No incident report received", confidence: "confirmed" },
  );
  const iq = c.itemized_quote_present;
  out.push({
    field: "itemized_quote_present",
    source_type: "document",
    ref: "quote.pdf",
    quote: iq === null ? "Itemization unknown" : iq ? "Quote lists line items" : "Quote shows a total only",
    confidence: iq === null ? "unconfirmed" : "confirmed",
  });
  out.push({
    field: "quote_eur",
    source_type: "document",
    ref: "quote.pdf",
    quote: c.quote_eur === null ? "Amount unreadable" : `Total ${eur(c.quote_eur)}`,
    confidence: c.quote_eur === null ? "unconfirmed" : "confirmed",
  });
  return out;
}

const answer = (v: boolean | null, yes: string, no: string) =>
  v === null ? "I don't know yet." : v ? yes : no;

export function buildPhoneIntake(c: Claim, plate: string) {
  const s = (c.claim_summary ?? "").replace(/\.$/, "");
  const p = c.policy_active_on_incident;
  const quoteText =
    c.quote_eur === null
      ? "I have a quote, but I can't read the amount."
      : `Yes, ${eur(c.quote_eur)}${c.itemized_quote_present === null ? ", not sure if it's itemized." : c.itemized_quote_present ? ", with line items." : ", but it's a total only."}`;
  const lines: Omit<TranscriptLine, "line">[] = [
    { speaker: "agent", text: "Hello, this is the claims line. Which vehicle is this about? Please tell me the plate." },
    { speaker: "customer", text: `It's ${plate}.` },
    { speaker: "system", text: p === null ? "Policy register: no match yet." : p ? "Policy register: policy active on incident date." : "Policy register: no active policy on incident date." },
    { speaker: "agent", text: "Thank you. What happened?" },
    { speaker: "customer", text: `${s}. It's my own car, ${c.repair_type === "ev_high_voltage_battery" ? "the high-voltage battery needs work" : "a standard repair"}.` },
    { speaker: "agent", text: "Was anyone injured?" },
    { speaker: "customer", text: answer(c.injury_reported, "Yes, someone was injured.", "No, nobody was injured.") },
    { speaker: "agent", text: "Is there any disagreement about who caused it?" },
    { speaker: "customer", text: answer(c.liability_disputed, "Yes, the other driver disputes it.", "No, nobody disputes it.") },
    { speaker: "agent", text: "Do you have an incident report?" },
    { speaker: "customer", text: answer(c.incident_report_present, "Yes, I have it.", "No, I don't have one.") },
    { speaker: "agent", text: "Do you have a repair quote? What's the amount, and is it itemized or a total only?" },
    { speaker: "customer", text: quoteText },
    { speaker: "system", text: `Duplicate check: ${c.duplicate_flag === null ? "not run" : c.duplicate_flag ? "same incident reference found" : "no match"}. Evidence check: ${c.evidence_conflict === null ? "not run" : c.evidence_conflict ? "conflict found" : "consistent"}.` },
    { speaker: "agent", text: "Thanks, I've noted everything. I'll send you an upload link by SMS." },
  ];
  const transcript: TranscriptLine[] = lines.map((l, i) => ({ line: i + 1, ...l }));
  const t = (field: string, line: number, v: unknown): FactSource => ({
    field, source_type: "transcript", ref: `line ${line}`, quote: transcript[line - 1].text,
    confidence: v === null ? "unconfirmed" : "confirmed",
  });
  const sys = systemSources(c).map((f) => ({ ...f, ref: f.field === "policy_active_on_incident" ? "line 3 · policy register" : `line 14 · ${f.ref}` }));
  const facts: FactSource[] = [
    t("claim_type", 5, c.claim_type),
    t("repair_type", 5, c.repair_type),
    t("injury_reported", 7, c.injury_reported),
    t("liability_disputed", 9, c.liability_disputed),
    ...documentSources(c, { incident: t("incident_report_present", 11, null) }),
    ...sys,
  ];
  return { transcript, facts };
}

export function buildFormIntake(c: Claim, plate: string, formAmountOverride?: number) {
  const amount = formAmountOverride ?? c.quote_eur;
  const form: FormField[] = [
    { field: 1, label: "Plate", value: plate },
    { field: 2, label: "Claim type", value: c.claim_type },
    { field: 3, label: "What happened", value: c.claim_summary ?? null },
    { field: 4, label: "Repair type", value: c.repair_type },
    { field: 5, label: "Anyone injured?", value: yn(c.injury_reported) },
    { field: 6, label: "Fault disputed?", value: yn(c.liability_disputed) },
    { field: 7, label: "Incident report attached?", value: yn(c.incident_report_present) },
    { field: 8, label: "Quote attached?", value: c.itemized_quote_present === null ? null : c.itemized_quote_present ? "Itemized" : "Total only" },
    { field: 9, label: "Quote amount", value: amount === null ? null : eur(amount) },
  ];
  const f = (field: string, n: number, v: unknown): FactSource => ({
    field, source_type: "form", ref: `field ${n}`,
    quote: `${form[n - 1].label} ${form[n - 1].value ?? "(empty)"}`,
    confidence: v === null ? "unconfirmed" : "confirmed",
  });
  const evidenceQuote = formAmountOverride !== undefined && c.quote_eur !== null
    ? `Form amount ${eur(formAmountOverride)} ≠ quote document ${eur(c.quote_eur)}`
    : undefined;
  const facts: FactSource[] = [
    f("claim_type", 2, c.claim_type),
    f("repair_type", 4, c.repair_type),
    f("injury_reported", 5, c.injury_reported),
    f("liability_disputed", 6, c.liability_disputed),
    ...documentSources(c, { incident: f("incident_report_present", 7, null) }),
    ...systemSources(c, evidenceQuote),
  ];
  return { form, facts };
}

export function buildCsvFacts(c: Claim, row: number): FactSource[] {
  const fields = ["policy_active_on_incident", "claim_type", "repair_type", "quote_eur", "incident_report_present", "itemized_quote_present", "injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict"];
  return fields.map((field) => {
    const v = c[field];
    return {
      field, source_type: "csv" as const, ref: `row ${row}`,
      quote: `${field} = ${v === null || v === undefined ? "(blank)" : String(v)}`,
      confidence: v === null || v === undefined ? ("unconfirmed" as const) : ("confirmed" as const),
    };
  });
}
