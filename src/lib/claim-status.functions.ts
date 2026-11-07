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
