// Reads a claim document's text (incident or police report, repair quote, letter) and pulls out the answers
// the claim needs. Pure and deterministic: fixed rules on the text, each answer with the line it came from.
// Results only fill answers the customer can see and change; the decision still comes only from decide().
// Name, email and plate are reported but never filled in: the customer has to give them to be verified.

import { parseEuro, type AnswerKey, type ReportAnswers } from "./report-intake";

export type ScanField = Exclude<AnswerKey, "name" | "email" | "plate">;
export interface ScanFinding {
  value: string;
  /** The text the value was read from */
  evidence: string;
  source: "text" | "ai";
}
export interface ScanResult {
  answers: Partial<Pick<ReportAnswers, ScanField>>;
  findings: Partial<Record<ScanField, ScanFinding>>;
  /** Identity details seen in the document (not filled in) */
  seen: { name?: string; email?: string; plate?: string };
  /** What kind of document this looks like */
  looksLike: "incident_report" | "quote" | "photos" | "other";
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  mär: 3,
  apr: 4,
  may: 5,
  mai: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  okt: 10,
  nov: 11,
  dec: 12,
  dez: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");

/** "06 Nov 2026", "6. November 2026", "06.11.2026", "2026-11-06", "11/06/2026" (day first) -> yyyy-mm-dd */
export function parseDocDate(s: string): string | null {
  let m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = s.match(/\b(\d{1,2})\.?\s+([A-Za-zäÄ]{3,9})\.?\s+(\d{4})\b/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${pad(mon)}-${pad(+m[1])}`;
  }
  return null;
}

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function scanDocumentText(
  raw: string,
  hint?: "incident_report" | "quote" | "photos",
): ScanResult {
  const text = String(raw ?? "").replace(/\r/g, "");
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const findings: ScanResult["findings"] = {};
  const seen: ScanResult["seen"] = {};
  const put = (k: ScanField, value: string, evidence: string) => {
    if (!findings[k]) findings[k] = { value, evidence: clip(evidence), source: "text" };
  };
  const lineWith = (re: RegExp) => lines.find((l) => re.test(l));

  // ---- what kind of document
  const isReport =
    /incident report|police report|polizei|unfallbericht|accident report|report no\.?|aktenzeichen/i.test(
      text,
    );
  const isQuote = /\b(quote|quotation|estimate|kostenvoranschlag|angebot|invoice|rechnung)\b/i.test(
    text,
  );
  const isPhotos = /\bphoto\s*\d|damage photos|schadenfotos/i.test(text);
  const looksLike =
    hint && hint !== "photos"
      ? hint
      : isReport
        ? "incident_report"
        : isQuote
          ? "quote"
          : isPhotos || hint === "photos"
            ? "photos"
            : "other";

  // ---- incident or police report present
  if (looksLike === "incident_report" || isReport) {
    const l =
      lineWith(/incident report|police report|polizei|report no|unfallbericht|accident report/i) ??
      lines[0] ??
      "";
    put("incident_report", "yes", l);
  }

  // ---- policy number
  const pol =
    text.match(/\b(POL-?\d{4,})\b/i) ??
    text.match(
      /(?:policy|police|versicherungsschein)[\s-]*(?:no\.?|number|nr\.?)[:\s]*([A-Z0-9-]{5,})/i,
    );
  if (pol)
    put(
      "policy_number",
      pol[1].toUpperCase(),
      lineWith(new RegExp(pol[1].replace(/[-]/g, "\\-"), "i")) ?? pol[0],
    );

  // ---- date of the incident (only a labelled date: a quote's own date is not the incident date)
  const dateLine = lineWith(
    /(date of (the )?(incident|accident|loss)|incident date|accident date|unfalldatum|schadentag|datum des unfalls|occurred on)/i,
  );
  const d = dateLine ? parseDocDate(dateLine) : null;
  if (d && dateLine) put("incident_date", d, dateLine);

  // ---- what happened: a labelled description, continued over the following lines
  const di = lines.findIndex((l) =>
    /^(description|what happened|course of events|hergang|schadenhergang|beschreibung|circumstances)\b/i.test(
      l,
    ),
  );
  if (di >= 0) {
    const parts = [
      lines[di].replace(
        /^(description|what happened|course of events|hergang|schadenhergang|beschreibung|circumstances)\s*:?\s*/i,
        "",
      ),
    ];
    const label =
      /^(officer|signature|unterschrift|synthetic demo|location|ort|vehicle|fahrzeug|reported by|date|datum|persons? injured|other part|witness|zeuge|total|item)\b/i;
    for (let i = di + 1; i < lines.length && i <= di + 6 && !label.test(lines[i]); i++)
      parts.push(lines[i]);
    const story = parts.join(" ").trim();
    if (story.split(/\s+/).length >= 4) put("what_happened", story.slice(0, 1200), lines[di]);
  }

  // ---- type of claim
  const theft = lineWith(/\b(stolen|theft|diebstahl|gestohlen|broken into|aufgebrochen)\b/i);
  if (theft) put("claim_kind", "theft", theft);
  else {
    const own = lineWith(
      /single[- ]vehicle|own damage|eigenschaden|kasko|reversed into|collided with (a|the) (bollard|wall|pole|post|tree)|hit (a|the) (bollard|wall|pole|post|tree)/i,
    );
    if (own) put("claim_kind", "own_damage", own);
  }

  // ---- injuries (a denial wins over the bare word "injured" in a field label)
  const noInjury = lineWith(
    /(persons? injured|injur(y|ies)|verletzte?)\s*:?\s*(none|no|nein|keine)\b|no (one|body) (was )?(injured|hurt)|no injur(y|ies)|keine verletzten|nobody (was )?(injured|hurt)/i,
  );
  if (noInjury) put("injury", "no", noInjury);
  else {
    const injury = lineWith(
      /\b(injured|injury|injuries|ambulance|hospital|verletzt|krankenwagen)\b/i,
    );
    if (injury) put("injury", "yes", injury);
  }

  // ---- other party, and whether they agree on fault
  const alone = lineWith(
    /(other part(y|ies)|third part(y|ies)|unfallgegner|beteiligte)\s*:?\s*(none|no|keine?)\b|single[- ]vehicle|no other (vehicle|party)|no third party involved|kein unfallgegner/i,
  );
  if (alone) put("other_party", "no", alone);
  else {
    const other = lineWith(
      /(other (vehicle|driver|party)|third[- ]party (vehicle|driver)|unfallgegner|second vehicle|collided with (a|another) (car|vehicle|van|truck))/i,
    );
    if (other) put("other_party", "yes", other);
  }
  if (findings.other_party?.value === "yes") {
    const disputed = lineWith(
      /(liability|fault|schuld|haftung).{0,30}(disputed|contested|denied|unclear|bestritten|strittig)|(disputes?|denies|bestreitet).{0,30}(liability|fault|schuld)/i,
    );
    const agreed = lineWith(
      /(admit(s|ted)?|accept(s|ed)?|acknowledg(es|ed)|agree(s|d)? on|confirmed).{0,30}(liability|fault|schuld)|(fault|liability).{0,20}(admitted|accepted|agreed)|schuld anerkannt/i,
    );
    if (disputed) put("fault", "disagree", disputed);
    else if (agreed) put("fault", "agree", agreed);
  }

  // ---- what needs repairing
  const ev = lineWith(
    /high[- ]voltage|hv[- ]batter|traction batter|hochvolt|antriebsbatterie|battery (module|pack) replacement/i,
  );
  if (ev) put("repair_kind", "ev_battery", ev);
  else {
    const std = lineWith(
      /\b(bumper|stoßstange|stossstange|paint|lack|windscreen|windshield|glass|scheibe|headlight|rear light|light|leuchte|door|tür|bonnet|hood|wing|fender|kotflügel|mirror|spiegel|exhaust|suspension)\b/i,
    );
    if (std && (looksLike === "quote" || looksLike === "incident_report" || looksLike === "photos"))
      put("repair_kind", "standard", std);
  }

  // ---- repair quote: the total, and whether it lists parts and labour
  if (looksLike === "quote" || isQuote) {
    const totalLine = [...lines]
      .reverse()
      .find(
        (l) =>
          /\b(grand total|total|gesamt(betrag|summe)?|summe|endbetrag|amount due|to pay)\b/i.test(
            l,
          ) && /\d/.test(l),
      );
    if (totalLine) {
      const nums =
        totalLine.match(/\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?/g) ?? [];
      const n = nums.length ? parseEuro(nums[nums.length - 1]) : null;
      if (n !== null && n > 0) put("quote_amount", String(n), totalLine);
    }
    const priced = lines.filter(
      (l) =>
        !/\b(total|gesamt|summe|subtotal|vat|mwst|ust)\b/i.test(l) &&
        /\d+[.,]\d{2}\s*(€|eur)?\s*$/i.test(l),
    );
    const labour = priced.some((l) =>
      /labou?r|arbeitslohn|arbeitszeit|lohn|\bAW\b|hours?|\d\s*h\b/i.test(l),
    );
    if (priced.length >= 2 && labour)
      put(
        "quote_itemized",
        "yes",
        `${priced.length} priced lines, incl. ${priced.find((l) => /labou?r|arbeit|lohn|hour|\dh\b/i.test(l)) ?? "labour"}`,
      );
    else if (priced.length <= 1 && findings.quote_amount)
      put("quote_itemized", "no", "Only a total, no individual parts or labour");
  }

  // ---- identity details: seen, never filled in
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (email) seen.email = email[0].toLowerCase();
  const plate = text.match(/\b([A-ZÄÖÜ]{1,3}-[A-Z]{1,2}\s?\d{1,4}[EH]?)\b/);
  if (plate) seen.plate = plate[1];
  const name = text.match(
    /(?:[Pp]olicy ?[Hh]older|[Cc]ustomer|[Ii]nsured|[Vv]ersicherungsnehmer(?:in)?|[Nn]ame)\s*:?[ \t]+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)+)/,
  );
  if (name) seen.name = name[1];

  const answers: ScanResult["answers"] = {};
  for (const [k, f] of Object.entries(findings) as [ScanField, ScanFinding][])
    (answers as Record<string, string>)[k] = f.value;
  return { answers, findings, seen, looksLike };
}
