import { createServerFn } from "@tanstack/react-start";
import {
  scanDocumentText,
  type ScanField,
  type ScanFinding,
  type ScanResult,
} from "./document-scan";
import { cleanAgentAnswers } from "./report-intake";

// Scans an uploaded document for the claim: the text of a PDF is read with fixed rules (document-scan.ts).
// Photos, scans without a text layer and documents the rules can't place go to the Lovable AI gateway, which
// only fills fields the rules left open. The key stays on the server. Nothing here decides the claim.

export interface ScanInput {
  name: string;
  type: string;
  b64: string;
  kind?: "incident_report" | "quote" | "photos";
}
export interface ScanResponse extends ScanResult {
  method: "text" | "ai" | "text+ai" | "none";
  note?: string;
}

const FIELDS: ScanField[] = [
  "policy_number",
  "incident_date",
  "what_happened",
  "claim_kind",
  "injury",
  "other_party",
  "fault",
  "repair_kind",
  "quote_amount",
  "quote_itemized",
  "incident_report",
];

const PROMPT = `You read one document a customer uploaded for a motor insurance claim (incident or police report, repair quote, damage photo, letter).
Return only JSON, no prose, with any of these keys you can support from the document itself. Leave a key out if the document does not say it.
- policy_number: string
- incident_date: "yyyy-mm-dd" (only the date the incident happened, not the document date)
- what_happened: short description in the document's own words
- claim_kind: "own_damage" | "theft" | "other"
- injury: "yes" | "no"
- other_party: "yes" | "no"  (another vehicle or person involved)
- fault: "agree" | "disagree"  (only if another party is involved)
- repair_kind: "standard" | "ev_battery"  (ev_battery only for a high-voltage / traction battery)
- quote_amount: number in euros (the quote's total)
- quote_itemized: "yes" | "no"  (does the quote list individual parts and labour)
- incident_report: "yes"  (only if this document is an incident or police report)
- evidence: object mapping each key you returned to the short text or visual detail it came from
Never guess. Do not return names, email addresses or number plates.`;

async function readPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text ?? "");
  } catch {
    return "";
  }
}

async function askGateway(
  input: ScanInput,
  text: string,
): Promise<{
  answers: Partial<Record<ScanField, string>>;
  evidence: Record<string, string>;
} | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  const isImage = input.type.startsWith("image/");
  const isPdf = /pdf/i.test(input.type) || /\.pdf$/i.test(input.name);
  const dataUrl = `data:${isImage ? input.type : "application/pdf"};base64,${input.b64}`;
  const content: unknown[] = [
    {
      type: "text",
      text: text.trim() ? `${PROMPT}\n\nDocument text:\n${text.slice(0, 12000)}` : PROMPT,
    },
  ];
  if (!text.trim() && isImage) content.push({ type: "image_url", image_url: { url: dataUrl } });
  else if (!text.trim() && isPdf)
    content.push({
      type: "file",
      file: { filename: input.name || "document.pdf", file_data: dataUrl },
    });
  else if (!text.trim()) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        messages: [{ role: "user", content }],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const obj = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Record<
      string,
      unknown
    >;
    const cleaned = cleanAgentAnswers(obj);
    const answers: Partial<Record<ScanField, string>> = {};
    for (const k of FIELDS)
      if (cleaned[k] !== undefined && cleaned[k] !== "unsure") answers[k] = String(cleaned[k]);
    const ev = (obj.evidence && typeof obj.evidence === "object" ? obj.evidence : {}) as Record<
      string,
      unknown
    >;
    return {
      answers,
      evidence: Object.fromEntries(
        Object.entries(ev).map(([k, v]) => [k, String(v).slice(0, 140)]),
      ),
    };
  } catch {
    return null;
  }
}

export const scanDocument = createServerFn({ method: "POST" })
  .inputValidator((d: ScanInput) => {
    const b64 = String(d?.b64 ?? "");
    if (!b64 || b64.length > 14_000_000) throw new Error("File missing or too large");
    const kind =
      d?.kind === "incident_report" || d?.kind === "quote" || d?.kind === "photos"
        ? d.kind
        : undefined;
    return {
      name: String(d?.name ?? "").slice(0, 160),
      type: String(d?.type ?? "").slice(0, 80),
      b64,
      kind,
    };
  })
  .handler(async ({ data }): Promise<ScanResponse> => {
    const isPdf = /pdf/i.test(data.type) || /\.pdf$/i.test(data.name);
    const text = isPdf
      ? await readPdfText(Uint8Array.from(atob(data.b64), (c) => c.charCodeAt(0)))
      : "";
    const readable = text.replace(/\s+/g, "").length >= 40;
    const result = scanDocumentText(readable ? text : "", data.kind);
    const fromText = Object.keys(result.answers).length;

    // Photos, scans and documents the rules found little in: ask the AI gateway for the rest
    let usedAi = false;
    if (!readable || fromText < 2) {
      const ai = await askGateway(data, readable ? text : "");
      if (ai) {
        for (const [k, v] of Object.entries(ai.answers) as [ScanField, string][]) {
          if (result.findings[k]) continue;
          const finding: ScanFinding = {
            value: v,
            evidence: ai.evidence[k] || "Read from the document",
            source: "ai",
          };
          result.findings[k] = finding;
          (result.answers as Record<string, string>)[k] = v;
          usedAi = true;
        }
      }
    }
    const found = Object.keys(result.answers).length;
    const method: ScanResponse["method"] =
      fromText && usedAi ? "text+ai" : usedAi ? "ai" : fromText ? "text" : "none";
    const note =
      found > 0
        ? undefined
        : readable
          ? "We couldn't find claim details in this document."
          : process.env["LOVABLE_API_KEY"]
            ? "We couldn't read this file automatically."
            : "This file has no readable text. Reading photos and scans needs Lovable AI to be enabled.";
    return { ...result, method, note };
  });
