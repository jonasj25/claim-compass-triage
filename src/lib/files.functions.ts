import { createServerFn } from "@tanstack/react-start";
import type { IntakeDocument } from "./intake";
import { isOwner } from "./report.functions";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Customer documents (incident report, repair quote, photos) in the private "claim-files" bucket.
// Uploads happen right after a claim is created on /report; reviewers open them from the case page
// through short-lived signed links. Files never become public.

export type DocKind = IntakeDocument["kind"] | "other";
export interface StoredDocument extends Omit<IntakeDocument, "kind"> {
  kind: DocKind;
  path?: string;
  size?: number;
  type?: string;
  uploaded_at?: string;
}

const BUCKET = "claim-files";
const MAX = 10 * 1024 * 1024;
const KIND_NOTE: Record<DocKind, string> = {
  incident_report: "Uploaded by the customer",
  quote: "Uploaded by the customer",
  photos: "Uploaded by the customer",
  other: "Uploaded by the customer",
};

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const uploadClaimFile = createServerFn({ method: "POST" })
  .inputValidator((d: { case_id: string; email?: string; plate?: string; kind: DocKind; name: string; type: string; b64: string }) => ({
    case_id: String(d?.case_id ?? "").trim().toUpperCase().slice(0, 40),
    email: String(d?.email ?? "").slice(0, 200),
    plate: String(d?.plate ?? "").slice(0, 20),
    kind: (["incident_report", "quote", "photos", "other"].includes(d?.kind) ? d.kind : "other") as DocKind,
    name: String(d?.name ?? "file").replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file",
    type: String(d?.type ?? "application/octet-stream").slice(0, 80),
    b64: String(d?.b64 ?? ""),
  }))
  .handler(async ({ data }): Promise<StoredDocument> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const claim = await db.from("claims").select("raw").eq("case_id", data.case_id).maybeSingle();
    const raw = ((claim.data as { raw?: Record<string, unknown> } | null)?.raw ?? {}) as Record<string, unknown>;
    if (!claim.data || !isOwner(raw, data.email, data.plate)) throw new Error("Claim not found.");
    const bytes = fromB64(data.b64);
    if (!bytes.length) throw new Error("The file is empty.");
    if (bytes.length > MAX) throw new Error("Files can be at most 10 MB.");

    const now = new Date().toISOString();
    const path = `${data.case_id}/${Date.now()}-${data.name}`;
    const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: data.type, upsert: false });
    if (up.error) throw new Error(up.error.message);

    const doc: StoredDocument = { name: data.name, kind: data.kind, status: "present", note: KIND_NOTE[data.kind], path, size: bytes.length, type: data.type, uploaded_at: now };
    const intake = await db.from("claim_intake").select("documents").eq("case_id", data.case_id).maybeSingle();
    const docs = (((intake.data as { documents?: unknown } | null)?.documents as StoredDocument[] | null) ?? []).slice();
    // Replace the placeholder entry of the same kind (e.g. "incident_report.pdf · missing"), otherwise add
    const i = docs.findIndex((d) => d.kind === data.kind && !d.path);
    if (i >= 0 && data.kind !== "other") docs[i] = { ...doc, note: docs[i].kind === "quote" && docs[i].note ? `${KIND_NOTE.quote} · ${docs[i].note}` : doc.note };
    else docs.push(doc);
    await db.from("claim_intake").update({ documents: docs as never }).eq("case_id", data.case_id);
    await db.from("case_events").insert({ case_id: data.case_id, type: "file_uploaded", actor: "Customer", payload: { name: data.name, kind: data.kind } });
    return doc;
  });

/** Short-lived link for a reviewer to open a stored document. */
export const getClaimFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path: string }) => ({ path: String(d?.path ?? "").slice(0, 300) }))
  .handler(async ({ data }): Promise<string> => {
    if (!/^[A-Z0-9-]+\/[^/]+$/.test(data.path)) throw new Error("Unknown file.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const r = await db.storage.from(BUCKET).createSignedUrl(data.path, 600);
    if (r.error || !r.data?.signedUrl) throw new Error(r.error?.message ?? "Could not open the file.");
    return r.data.signedUrl;
  });
