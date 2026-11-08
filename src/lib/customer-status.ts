// The status a customer sees for their claim. One rule, used by the public status page and the
// staff case page so both always agree. Derived from what is recorded; never changes a decision.
//   Rejected            - a reviewer denied the claim (recorded outcome "denied")
//   Accepted            - a reviewer accepted it, it was auto-processed, or it was closed without a rejection
//   Information needed  - we are waiting for the customer to send something
//   In review           - a reviewer has to decide (also after a claim is reopened)
import type { Recommendation } from "./triage";

export type CustomerStatus = "in_review" | "information_needed" | "accepted" | "rejected";

export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  in_review: "In review",
  information_needed: "Information needed",
  accepted: "Accepted",
  rejected: "Rejected",
};

export const CUSTOMER_STATUS_TEXT: Record<CustomerStatus, string> = {
  in_review:
    "A claims specialist is checking your claim. You'll hear from us by email; there's nothing you need to do right now.",
  information_needed:
    "We need a little more from you before we can continue. Please send the items below by replying to our email.",
  accepted:
    "Your claim has been accepted for processing. We'll confirm the settlement details by email.",
  rejected:
    "Unfortunately we can't accept this claim. We've sent you an email with the reason and how to ask us to look again.",
};

export interface StatusInput {
  caseStatus: string | null | undefined;
  queue: string | null | undefined;
  recommendation: Recommendation | null | undefined;
  outcome: string | null | undefined; // latest outcomes.final_outcome ("accepted" | "denied" | ...)
}

export function customerStatus({
  caseStatus,
  queue,
  recommendation,
  outcome,
}: StatusInput): CustomerStatus {
  // A recorded outcome only counts while the claim is finished; a reopened claim is in review again
  const finished = (caseStatus ?? "").trim().toLowerCase() === "closed" || queue === "done";
  if (finished) return outcome === "denied" ? "rejected" : "accepted";
  if (queue === "waiting_customer" || (!queue && recommendation === "request_information"))
    return "information_needed";
  if (queue === "on_you" || (!queue && recommendation === "human_review")) return "in_review";
  if (queue === "auto_processed" || recommendation === "routine_processing") return "accepted";
  return recommendation === "request_information" ? "information_needed" : "in_review";
}

/** Plates compared without spaces, dashes or case: "M-AK 1000" == "mak1000". */
export const plateKey = (p: string | null | undefined) =>
  (p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
