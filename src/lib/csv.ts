import type { Claim } from "./triage";

export const CLAIM_BOOL_FIELDS = [
  "policy_active_on_incident",
  "incident_report_present",
  "itemized_quote_present",
  "injury_reported",
  "liability_disputed",
  "duplicate_flag",
  "evidence_conflict",
] as const;

export const CLAIM_COLUMNS = [
  "case_id",
  "case_status",
  "claim_summary",
  "policy_active_on_incident",
  "claim_type",
  "repair_type",
  "quote_eur",
  "incident_report_present",
  "itemized_quote_present",
  "injury_reported",
  "liability_disputed",
  "duplicate_flag",
  "evidence_conflict",
] as const;

/** Same as the Python engine: true/1/yes/y/t, false/0/no/n/f, anything else → null. */
export function parseBool(v: string | undefined | null): boolean | null {
  const s = (v ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y", "t"].includes(s)) return true;
  if (["false", "0", "no", "n", "f"].includes(s)) return false;
  return null;
}

/** Strip € and thousands commas; unparseable → null. */
export function parseQuote(v: string | undefined | null): number | null {
  const s = (v ?? "").replace(/€/g, "").replace(/,/g, "").trim();
  if (!s) return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const blankToNull = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

/** RFC4180-ish CSV tokenizer (quotes, escaped quotes, CRLF). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQuotes) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

export interface ParsedClaim extends Claim {
  raw: Record<string, string>;
  row: number;
}

export function parseClaimsCsv(text: string): ParsedClaim[] {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  if (!header.includes("case_id")) throw new Error("CSV needs a case_id column");
  return rows.slice(1).map((cells, idx) => {
    const raw: Record<string, string> = {};
    header.forEach((h, i) => (raw[h] = cells[i] ?? ""));
    const claim: ParsedClaim = {
      case_id: (raw.case_id ?? "").trim(),
      case_status: blankToNull(raw.case_status),
      claim_summary: blankToNull(raw.claim_summary),
      policy_active_on_incident: parseBool(raw.policy_active_on_incident),
      claim_type: blankToNull(raw.claim_type),
      repair_type: blankToNull(raw.repair_type),
      quote_eur: parseQuote(raw.quote_eur),
      incident_report_present: parseBool(raw.incident_report_present),
      itemized_quote_present: parseBool(raw.itemized_quote_present),
      injury_reported: parseBool(raw.injury_reported),
      liability_disputed: parseBool(raw.liability_disputed),
      duplicate_flag: parseBool(raw.duplicate_flag),
      evidence_conflict: parseBool(raw.evidence_conflict),
      raw,
      row: idx + 1,
    };
    return claim;
  }).filter((c) => c.case_id);
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) ? v.join(";") : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}

export const isClosed = (status: string | null | undefined) =>
  (status ?? "").trim().toLowerCase() === "closed";
