// Customer self-service intake (/report): answers -> structured claim fields.
// Pure and deterministic. "Not sure" and empty answers stay null (unknown) - never false/0.
// The voice path uses simple keyword rules on the transcript; it only fills answers the customer
// then confirms. It never touches the triage decision, which still comes only from decide().

export type Tri = "yes" | "no" | "unsure" | "";

export interface ReportAnswers {
  name: string;
  email: string;
  plate: string;
  policy_number: string;
  incident_date: string; // yyyy-mm-dd
  what_happened: string;
  claim_kind: "own_damage" | "theft" | "other" | "unsure" | "";
  injury: Tri;
  other_party: Tri;
  fault: "agree" | "disagree" | "unsure" | "";
  repair_kind: "standard" | "ev_battery" | "unsure" | "";
  quote_amount: string;
  quote_itemized: Tri;
  incident_report: Tri;
}

export type AnswerKey = keyof ReportAnswers;

export const EMPTY_ANSWERS: ReportAnswers = {
  name: "",
  email: "",
  plate: "",
  policy_number: "",
  incident_date: "",
  what_happened: "",
  claim_kind: "",
  injury: "",
  other_party: "",
  fault: "",
  repair_kind: "",
  quote_amount: "",
  quote_itemized: "",
  incident_report: "",
};

export interface Choice {
  value: string;
  label: string;
}

export interface Question {
  key: AnswerKey;
  /** Short label for the checklist */
  label: string;
  /** Full question as asked on screen and read aloud */
  ask: string;
  hint?: string;
  type: "text" | "email" | "date" | "textarea" | "money" | "choice";
  choices?: Choice[];
  optional?: boolean;
  /** Only asked when this returns true */
  when?: (a: ReportAnswers) => boolean;
}

const TRI: Choice[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "I'm not sure" },
];

export const QUESTIONS: Question[] = [
  { key: "name", label: "Your name", ask: "What's your full name?", type: "text" },
  { key: "email", label: "Email", ask: "Which email can we reach you at?", hint: "We only use it for this claim.", type: "email" },
  { key: "policy_number", label: "Policy number", ask: "What's your policy number?", hint: "It's on your insurance card, e.g. POL-482913. Leave empty if you don't have it to hand.", type: "text", optional: true },
  { key: "plate", label: "Vehicle plate", ask: "What's the number plate of your car?", type: "text" },
  { key: "incident_date", label: "Date of incident", ask: "When did it happen?", type: "date" },
  { key: "what_happened", label: "What happened", ask: "What happened? Tell us in your own words.", hint: "A few sentences are enough.", type: "textarea" },
  {
    key: "claim_kind",
    label: "Type of claim",
    ask: "What best describes your claim?",
    type: "choice",
    choices: [
      { value: "own_damage", label: "Damage to my own car" },
      { value: "theft", label: "My car or parts were stolen" },
      { value: "other", label: "Something else" },
      { value: "unsure", label: "I'm not sure" },
    ],
  },
  { key: "injury", label: "Anyone injured", ask: "Was anyone injured?", type: "choice", choices: TRI },
  { key: "other_party", label: "Other party involved", ask: "Was another vehicle or person involved?", type: "choice", choices: TRI },
  {
    key: "fault",
    label: "Who caused it",
    ask: "Do you and the other party agree on who caused it?",
    type: "choice",
    when: (a) => a.other_party === "yes",
    choices: [
      { value: "agree", label: "Yes, we agree" },
      { value: "disagree", label: "No, we disagree" },
      { value: "unsure", label: "I'm not sure" },
    ],
  },
  {
    key: "repair_kind",
    label: "Repair type",
    ask: "What needs repairing?",
    type: "choice",
    choices: [
      { value: "standard", label: "Bodywork, glass or mechanical parts" },
      { value: "ev_battery", label: "High-voltage battery (electric or hybrid car)" },
      { value: "unsure", label: "I'm not sure yet" },
    ],
  },
  { key: "quote_amount", label: "Repair quote", ask: "How much is the repair quote from your workshop?", hint: "In euros. Leave empty if you don't have a quote yet.", type: "money", optional: true },
  { key: "quote_itemized", label: "Quote itemized", ask: "Does the quote list the individual parts and labour, or only a total?", type: "choice", choices: [
    { value: "yes", label: "It lists each item" },
    { value: "no", label: "Only a total" },
    { value: "unsure", label: "I'm not sure" },
  ] },
  { key: "incident_report", label: "Incident report", ask: "Do you have an incident or police report?", type: "choice", choices: TRI },
];

export const activeQuestions = (a: ReportAnswers) => QUESTIONS.filter((q) => !q.when || q.when(a));

export type FieldState = "answered" | "unsure" | "missing";

/** Checklist state for one question. Empty optional answers count as "unsure": the claim keeps them as unknown. */
export function fieldState(q: Question, a: ReportAnswers): FieldState {
  const v = String(a[q.key] ?? "").trim();
  if (!v) return "missing";
  if (v === "unsure") return "unsure";
  if (q.type === "money" && parseEuro(v) === null) return "unsure";
  return "answered";
}

export function answerLabel(q: Question, a: ReportAnswers): string {
  const v = String(a[q.key] ?? "").trim();
  if (!v) return "";
  if (q.choices) return q.choices.find((c) => c.value === v)?.label ?? v;
  if (q.type === "money") {
    const n = parseEuro(v);
    return n === null ? v : "€" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return v;
}

/** "1,450", "1.450,00", "€ 1450", "1450 euros" -> 1450. Unparseable -> null. */
export function parseEuro(input: string): number | null {
  let s = input.replace(/euros?|eur|€/gi, "").replace(/\s/g, "").trim();
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const tri = (v: Tri): boolean | null => (v === "yes" ? true : v === "no" ? false : null);

/** Customer answers -> the claim fields the policy reads. System checks are added on the server. */
export function toClaimFields(a: ReportAnswers) {
  const liability_disputed =
    a.other_party === "no" ? false : a.other_party === "yes" ? (a.fault === "disagree" ? true : a.fault === "agree" ? false : null) : null;
  return {
    claim_summary: a.what_happened.trim().slice(0, 400) || null,
    claim_type: a.claim_kind === "own_damage" ? "motor_own_damage" : a.claim_kind === "theft" ? "theft" : a.claim_kind === "other" ? "other" : null,
    repair_type: a.repair_kind === "standard" ? "standard" : a.repair_kind === "ev_battery" ? "ev_high_voltage_battery" : null,
    quote_eur: parseEuro(a.quote_amount),
    itemized_quote_present: tri(a.quote_itemized),
    incident_report_present: tri(a.incident_report),
    injury_reported: tri(a.injury),
    liability_disputed,
  };
}

/** Which answer feeds which claim field (for evidence links on the case page). */
export const FIELD_SOURCE: Record<string, AnswerKey> = {
  claim_type: "claim_kind",
  repair_type: "repair_kind",
  quote_eur: "quote_amount",
  itemized_quote_present: "quote_itemized",
  incident_report_present: "incident_report",
  injury_reported: "injury",
  liability_disputed: "fault",
};

// ---------------------------------------------------------------- voice: keyword extraction

export interface Extracted {
  answers: Partial<ReportAnswers>;
}

const has = (t: string, re: RegExp) => re.test(t);

/**
 * Reads one customer utterance and returns the answers it clearly states.
 * Deliberately conservative: when nothing matches, nothing is filled.
 */
export function extractFromUtterance(text: string, today = new Date()): Partial<ReportAnswers> {
  const t = ` ${text.toLowerCase()} `;
  const out: Partial<ReportAnswers> = {};

  const name = text.match(/(?:my name is|i am|i'm|this is|ich heiße|mein name ist)\s+([A-ZÄÖÜ][\wäöüß'-]+(?:\s+[A-ZÄÖÜ][\wäöüß'-]+)+)/);
  if (name) out.name = name[1];

  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (email) out.email = email[0].toLowerCase();

  const policy = text.match(/\b(?:policy|police|versicherungs)\s*(?:number|nummer)?\s*(?:is|ist)?\s*[:#]?\s*([a-z]{0,4}[-\s]?\d[\d\s-]{3,10}\d)\b/i);
  if (policy) out.policy_number = policy[1].replace(/\s+/g, "").toUpperCase();

  const plate = text.match(/\b(?:plate|registration|number plate|kennzeichen)\s*(?:is|ist|number)?\s*[:#]?\s*([a-z]{1,3}[\s-]?[a-z]{1,2}[\s-]?\d{1,4}[eh]?)\b/i);
  if (plate) out.plate = plate[1].toUpperCase().replace(/\s+/g, " ").replace(/-/g, " ").trim();

  if (has(t, /\byesterday\b|\bgestern\b/)) out.incident_date = iso(addDays(today, -1));
  else if (has(t, /\btoday\b|\bthis morning\b|\bheute\b/)) out.incident_date = iso(today);

  if (has(t, /stolen|theft|stole |gestohlen|diebstahl|broke into/)) out.claim_kind = "theft";
  else if (has(t, /crash|collid|collision|scratch|dent|bumper|hit (a|the|my)|reversed|parking|accident|unfall|damage|kratzer|delle/)) out.claim_kind = "own_damage";

  if (has(t, /(no ?one|nobody|not|wasn't|weren't) (was |got )?(hurt|injured)|no injur|niemand (wurde )?verletzt|keine verletz/)) out.injury = "no";
  else if (has(t, /injur|hurt|whiplash|ambulance|hospital|verletz|krankenhaus/)) out.injury = "yes";

  if (has(t, /single.car|no other (car|vehicle|driver|party)|nobody else|only my car|kein anderes auto|niemand sonst/)) out.other_party = "no";
  else if (has(t, /other (driver|car|vehicle|party)|another (car|driver|vehicle)|(he|she|they) hit|anderer fahrer|anderes auto/)) out.other_party = "yes";

  if (has(t, /disagree|dispute|blames? me|says it was my fault|claims it was (me|my fault)|won't admit|denies|streit|bestreitet/)) {
    out.fault = "disagree";
    out.other_party = "yes";
  } else if (has(t, /we agree|agreed|admitted|admits|accepted (the )?(blame|fault)|his fault and he|her fault and she|einig/)) {
    out.fault = "agree";
    out.other_party = "yes";
  }

  if (has(t, /battery|high.voltage|hochvolt|akku/)) out.repair_kind = "ev_battery";
  else if (has(t, /bodywork|bumper|panel|paint|windshield|windscreen|mirror|door|headlight|glass|stoßstange|lack|scheibe/)) out.repair_kind = "standard";

  const money = text.match(/(?:€|eur(?:o|os)?)\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(?:€|euros?|eur\b)/i);
  if (money) {
    const n = parseEuro(money[1] ?? money[2] ?? "");
    if (n !== null) out.quote_amount = String(n);
  }

  if (has(t, /(not sure|don't know|no idea|weiß nicht).{0,40}(itemi|break ?down|line items|total)/)) out.quote_itemized = "unsure";
  else if (has(t, /total only|only (a|the) total|just (a|the) total|no break ?down|nur (die )?summe|nur ein gesamtbetrag/)) out.quote_itemized = "no";
  else if (has(t, /itemi[sz]ed|line items|each (part|item)|broken down|break ?down|einzelposten|aufgeschlüsselt/)) out.quote_itemized = "yes";

  if (has(t, /(no|don't have|do not have|haven't got|without|kein(en)?) (an? )?(police |incident |accident )?(report|bericht|protokoll)/)) out.incident_report = "no";
  else if (has(t, /(police|incident|accident) report|polizeibericht|unfallbericht|unfallprotokoll/)) out.incident_report = "yes";

  return out;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Reads a short reply to the question that was just asked ("No", "Yes, an ambulance came", "1,450 euros").
 * Used together with extractFromUtterance; this one only fills the asked question.
 */
export function interpretReply(q: Question, text: string, today = new Date()): Partial<ReportAnswers> {
  const raw = text.trim().replace(/[.!?]+$/, "");
  const t = raw.toLowerCase();
  if (!t) return {};
  const unsure = /not sure|don't know|do not know|no idea|weiß nicht|keine ahnung/.test(t);
  const yes = /^(yes|yeah|yep|correct|right|ja|genau)\b/.test(t);
  const no = /^(no|nope|nein|not really)\b/.test(t);

  if (q.type === "choice") {
    if (unsure && q.choices?.some((c) => c.value === "unsure")) return { [q.key]: "unsure" } as Partial<ReportAnswers>;
    if (q.key === "fault") {
      if (yes) return { fault: "agree" };
      if (no) return { fault: "disagree" };
      return {};
    }
    if (q.key === "quote_itemized") {
      if (yes) return { quote_itemized: "yes" };
      if (no) return { quote_itemized: "no" };
      return {};
    }
    if (q.choices?.some((c) => c.value === "yes")) {
      if (yes) return { [q.key]: "yes" } as Partial<ReportAnswers>;
      if (no) return { [q.key]: "no" } as Partial<ReportAnswers>;
    }
    return {};
  }
  if (q.type === "money") {
    if (unsure || /no quote|not yet|noch nicht/.test(t)) return { quote_amount: "" };
    const m = raw.match(/\d[\d.,]*/);
    const n = m ? parseEuro(m[0]) : null;
    return n === null ? {} : { quote_amount: String(n) };
  }
  if (q.type === "date") {
    if (/\byesterday\b|\bgestern\b/.test(t)) return { incident_date: iso(addDays(today, -1)) };
    if (/\btoday\b|\bheute\b/.test(t)) return { incident_date: iso(today) };
    const d = Date.parse(`${raw.replace(/^(on|am)\s+/i, "").replace(/(\d)(st|nd|rd|th)\b/, "$1")} ${today.getFullYear()}`);
    if (!Number.isNaN(d)) return { incident_date: iso(new Date(d)) };
    const d2 = Date.parse(raw);
    return Number.isNaN(d2) ? {} : { incident_date: iso(new Date(d2)) };
  }
  if (q.key === "email") {
    const spoken = t.replace(/\s+at\s+/g, "@").replace(/\s+dot\s+/g, ".").replace(/\s+/g, "");
    const m = spoken.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    return m ? { email: m[0] } : {};
  }
  // Free-text answers are only taken from short replies; a long story is left to extractFromUtterance
  const words = raw.split(/\s+/).length;
  if ((q.key === "name" || q.key === "plate" || q.key === "policy_number") && words > 6) return {};
  if (q.key === "policy_number") {
    if (unsure || no) return {};
    return { policy_number: raw.replace(/^(it'?s|it is|my policy number is)\s+/i, "").replace(/\s+/g, "").toUpperCase() };
  }
  if (q.key === "plate") return { plate: raw.replace(/^(it'?s|it is|the plate is)\s+/i, "").toUpperCase() };
  if (q.key === "name") return { name: raw.replace(/^(my name is|i'm|i am|it's)\s+/i, "") };
  if (q.key === "what_happened") return { what_happened: raw };
  return {};
}
