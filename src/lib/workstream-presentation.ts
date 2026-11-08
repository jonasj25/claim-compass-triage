import type { Claim } from "./triage";
import type { WorkItem } from "./reviewer-workstream";

export const WORK_TABS = [
  "No reply",
  "Customer replied",
  "Risk cases",
  "Policy change",
  "Near limit",
] as const;
export type WorkTab = (typeof WORK_TABS)[number];
export function workTab(item: WorkItem): WorkTab {
  if (item.group === "no_reply") return "No reply";
  if (item.replied) return "Customer replied";
  if (item.group === "policy_change") return "Policy change";
  if (item.group === "double_check") return "Near limit";
  return "Risk cases";
}

// Review priority: presentation only, it never changes a recommendation or the queue.
// Order of work for the reviewer = what costs most if handled wrongly or late.
//   High   – quote of €2,500 or more (top quarter of the review queue),
//            or a person is injured (liability far beyond the repair),
//            or possible fraud (duplicate claim, contradicting evidence).
//   Low    – quick double-checks near the limit and quotes under €1,000.
//   Medium – everything else (€1,000–2,499, unknown amount, disputed fault, claim type, EV, …).
export const PRIORITY_HIGH_EUR = 2500;
export const PRIORITY_LOW_EUR = 1000;
export type Priority = "High" | "Medium" | "Low";
type PriorityClaim = Pick<Claim, "quote_eur" | "injury_reported" | "duplicate_flag" | "evidence_conflict">;
const eur = (n: number) => `€${n.toLocaleString("en-US")}`;

export function claimPriority(claim: PriorityClaim, tab: WorkTab): { level: Priority; why: string } {
  const q = claim.quote_eur;
  if (claim.injury_reported === true) return { level: "High", why: "Injury reported" };
  if (claim.duplicate_flag === true || claim.evidence_conflict === true)
    return { level: "High", why: "Possible fraud (duplicate or contradicting evidence)" };
  if (tab === "Near limit") return { level: "Low", why: "Quick double-check" };
  if (q !== null && q !== undefined && q >= PRIORITY_HIGH_EUR)
    return { level: "High", why: `Quote ${eur(q)} is ${eur(PRIORITY_HIGH_EUR)} or more` };
  if (q !== null && q !== undefined && q < PRIORITY_LOW_EUR)
    return { level: "Low", why: `Quote ${eur(q)} is under ${eur(PRIORITY_LOW_EUR)}` };
  return {
    level: "Medium",
    why: q === null || q === undefined ? "Quote unknown" : `Quote ${eur(q)} between ${eur(PRIORITY_LOW_EUR)} and ${eur(PRIORITY_HIGH_EUR)}`,
  };
}
export const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

/** A claim that arrived today (local time). */
export function isNewToday(receivedAt: string | null | undefined, now: Date) {
  const t = Date.parse(receivedAt ?? "");
  if (!Number.isFinite(t)) return false;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return t >= start.getTime();
}
