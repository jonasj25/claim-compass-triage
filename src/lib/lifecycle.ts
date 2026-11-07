import type { Recommendation } from "./triage";

export type Queue = "on_you" | "waiting_customer" | "auto_processed" | "done";

export const REVIEWERS = ["Mara Klein", "Jonas Weber", "Lea Hoffmann", "Ben Krause", "Aylin Demir", "Noah Fischer", "Clara Wolf"] as const;

export function queueFor(rec: Recommendation, closed: boolean): Queue {
  if (closed) return "done";
  if (rec === "human_review") return "on_you";
  if (rec === "request_information") return "waiting_customer";
  return "auto_processed";
}

export const SLA_HOURS = 24;
export const REMINDER_HOURS = [48, 96];

export const QUEUE_LABELS: Record<Queue, string> = {
  on_you: "To review",
  waiting_customer: "Waiting on customer",
  auto_processed: "Auto-processed",
  done: "Done",
};
