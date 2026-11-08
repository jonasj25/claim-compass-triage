import { createServerFn } from "@tanstack/react-start";
import {
  scanDocumentText,
  type ScanField,
  type ScanFinding,
  type ScanResult,
} from "./document-scan";
import { readDocumentWithAi } from "./doc-reader.functions";

// Scans an uploaded document for the claim: the text of a PDF is read with fixed rules (document-scan.ts).
// Photos, scans without a text layer and documents the rules find little in go to the AI reader
// (doc-reader.functions.ts, Lovable AI gateway), which only fills fields the rules left open.
// The key stays on the server. Nothing here decides the claim.

export interface ScanInput {
  name: string;
  type: string;
  b64: string;
  kind?: "incident_report" | "quote" | "photos";
}
export interface ScanResponse extends ScanResult {
  method: "text" | "ai" | "text+ai" | "none";
  note?: string;
  /** Further details read by the AI (document number, net/VAT/gross, location ...) for the claims specialist */
  details?: { label: string; value: string }[];
  summary?: string | null;
}

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

    // The AI reader always reads along when it is available. The fixed rules can pick the wrong line
    // (a labour subtotal, the document date), so for the incident date and the quote total the AI's
    // reading counts; for everything else it only fills what the rules left open.
    let usedAi = false;
    let details: ScanResponse["details"] = [];
    let summary: string | null = null;
    const ai = process.env["LOVABLE_API_KEY"] ? await readDocumentWithAi(data) : null;
    if (ai?.ok) {
      details = ai.details;
      summary = ai.summary;
      for (const [k, v] of Object.entries(ai.facts) as [ScanField, string][]) {
        if (!v) continue;
        const preferAi = k === "incident_date" || k === "quote_amount";
        if (result.findings[k] && !preferAi) continue;
        if (result.findings[k]?.value === v) continue;
        result.findings[k] = { value: v, evidence: ai.summary || "Read from the document", source: "ai" };
        (result.answers as Record<string, string>)[k] = v;
        usedAi = true;
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
    return { ...result, method, note, details, summary };
  });
