// Customer conversation inside a claim. Messages come from fixed templates with placeholders
// (no AI). Sending can move the claim on: request/reminder keep it with the customer,
// accept/deny close it for good. Everything is stored append-only in case_events.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  CircleCheck,
  FileQuestion,
  Lock,
  Mail,
  MessageSquareText,
  Send,
  CircleX,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  FIELD_LABELS,
  RECOMMENDATION_LABELS,
  type Claim,
  type Policy,
  type Recommendation,
} from "@/lib/triage";
import { QUEUE_LABELS, type Queue } from "@/lib/lifecycle";
import { SimulateReplyDialog } from "./SimulateReplyDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fmtEur, fmtTime } from "./ui";
import { cn } from "@/lib/utils";

type Row = Record<string, any>;
export type TemplateKey = "accept" | "deny" | "request" | "reminder" | "message";

const DENY_REASONS: { key: string; label: string; text: string }[] = [
  {
    key: "policy_active",
    label: "Policy not active",
    text: "your insurance policy was not active on the date of the incident.",
  },
  {
    key: "claim_type",
    label: "Not covered (claim type)",
    text: "this type of claim is not covered by your motor own-damage policy.",
  },
  {
    key: "duplicate_flag",
    label: "Duplicate claim",
    text: "we have already received a claim for the same incident, so this submission is a duplicate.",
  },
  {
    key: "evidence_conflict",
    label: "Contradicting evidence",
    text: "the evidence provided contradicts the reported incident, for example the date on the photos.",
  },
  {
    key: "not_covered",
    label: "Not covered (other)",
    text: "the damage is not covered under the terms of your policy.",
  },
];

const TEMPLATES: Record<
  TemplateKey,
  { label: string; icon: typeof Send; closes?: "accepted" | "denied"; tone: string }
> = {
  accept: { label: "Accept claim", icon: CircleCheck, closes: "accepted", tone: "text-ok" },
  deny: { label: "Deny claim", icon: CircleX, closes: "denied", tone: "text-action" },
  request: { label: "Request documents", icon: FileQuestion, tone: "text-wait" },
  reminder: { label: "Send reminder", icon: BellRing, tone: "text-wait" },
  message: { label: "Free message", icon: MessageSquareText, tone: "text-text-2" },
};

function fill(t: string, v: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? `{${k}}`);
}

function templateText(key: TemplateKey, vars: Record<string, string>) {
  const sign = "\n\nKind regards,\n{reviewer}\nClaims team";
  const t: Record<TemplateKey, string> = {
    accept:
      "Hello {customer},\n\ngood news: we have reviewed your claim {case_id} for vehicle {plate} and accepted it. The repair costs of {amount} are covered. You will receive your reimbursement within the next 5 working days.\n\nIf you have any questions, simply reply to this message and mention {case_id}." +
      sign,
    deny:
      "Hello {customer},\n\nwe have carefully reviewed your claim {case_id} for vehicle {plate}. Unfortunately we cannot accept it: {reason}\n\nIf you think this is wrong or you have new information, reply to this message within 30 days and mention {case_id}. A colleague will look at it again." +
      sign,
    request:
      "Hello {customer},\n\nthank you for your claim {case_id} for vehicle {plate}. To continue, we still need: {missing}.\n\nPlease reply to this message with the documents attached. As soon as they arrive, we check your claim again." +
      sign,
    reminder:
      "Hello {customer},\n\na friendly reminder: we are still waiting for {missing} for your claim {case_id}. Without it we cannot continue. Please reply to this message with the documents attached." +
      sign,
    message: "Hello {customer},\n\n\n\nReference: claim {case_id}" + sign,
  };
  return fill(t[key], vars);
}

export function CustomerChat({
  caseId,
  customer,
  plate,
  quote,
  version,
  rec,
  queue,
  closed,
  needsUser,
  missingFields,
  failedTrigger,
  decisionId,
  reviewer,
  events,
  className,
  claim,
  policy,
  initialTemplate,
  onRequestSent,
}: {
  caseId: string;
  customer: string | null;
  plate: string | null;
  quote: number | null;
  version: string;
  rec: Recommendation;
  queue: string | undefined;
  closed: boolean;
  needsUser: boolean;
  missingFields: string[];
  failedTrigger: string | null;
  decisionId: string | null;
  reviewer: string;
  events: Row[];
  className?: string;
  /** Needed for the demo "customer reply → re-check" flow. */
  claim?: Claim;
  policy?: Policy;
  initialTemplate?: TemplateKey;
  onRequestSent?: () => void;
}) {
  const qc = useQueryClient();
  const recommended: TemplateKey[] =
    queue === "waiting_customer"
      ? ["reminder", "request"]
      : rec === "request_information"
        ? ["request"]
        : ["accept", "deny"];
  const [tpl, setTpl] = useState<TemplateKey>(initialTemplate ?? recommended[0]);
  const [denyKey, setDenyKey] = useState<string>(
    DENY_REASONS.find((r) => r.key === failedTrigger)?.key ?? "not_covered",
  );
  const channel = "email" as const; // email only
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const missing = missingFields.length
    ? missingFields.map((f) => FIELD_LABELS[f] ?? f.replace(/_/g, " ")).join(" and ")
    : "the missing documents";
  const vars = useMemo(
    () => ({
      customer: customer ?? "customer",
      case_id: caseId,
      plate: plate ?? "(plate unknown)",
      amount: quote === null ? "the quoted amount" : (fmtEur(quote) ?? ""),
      reason: DENY_REASONS.find((r) => r.key === denyKey)?.text ?? "",
      missing,
      reviewer,
    }),
    [customer, caseId, plate, quote, denyKey, missing, reviewer],
  );

  // reset the draft when the case, template or deny reason changes
  useEffect(() => {
    setBody(templateText(tpl, vars));
    setConfirming(false);
  }, [tpl, vars]);
  useEffect(() => {
    setTpl(initialTemplate ?? recommended[0]);
    setDenyKey(DENY_REASONS.find((r) => r.key === failedTrigger)?.key ?? "not_covered");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, initialTemplate]);

  const thread = events
    .filter((e) =>
      [
        "message_sent",
        "message_received",
        "outreach_sent",
        "reminder_sent",
        "closed",
        "retriaged",
      ].includes(e.type),
    )
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [thread.length]);

  const must = async (p: PromiseLike<{ error: unknown }>) => {
    const { error } = await p;
    if (error) throw error;
  };
  const ev = (type: string, payload: Record<string, unknown>) =>
    supabase
      .from("case_events")
      .insert({
        case_id: caseId,
        type,
        actor: reviewer,
        payload: { policy_version: version, ...payload } as any,
      });

  const send = async () => {
    const t = TEMPLATES[tpl];
    if (t.closes && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const reasonLabel =
        tpl === "deny" ? DENY_REASONS.find((r) => r.key === denyKey)?.label : undefined;
      await must(
        ev("message_sent", {
          direction: "out",
          channel,
          template: tpl,
          body: body.trim(),
          to: customer,
          reason: reasonLabel,
        }),
      );
      if (tpl === "request") {
        await must(ev("outreach_sent", { channel, missing_items: missingFields, manual: true }));
        await must(
          supabase
            .from("case_workflow")
            .update({ queue: "waiting_customer", qa_sample: false, updated_at: now })
            .eq("case_id", caseId),
        );
      }
      if (tpl === "reminder") await must(ev("reminder_sent", { channel, manual: true }));
      if (t.closes) {
        await must(
          supabase
            .from("outcomes")
            .insert({
              case_id: caseId,
              decision_id: decisionId,
              final_outcome: t.closes,
              correct_next_step: rec,
              recorded_by: reviewer,
            }),
        );
        await must(supabase.from("claims").update({ case_status: "closed" }).eq("case_id", caseId));
        await must(
          supabase
            .from("case_workflow")
            .update({ queue: "done", qa_sample: false, updated_at: now })
            .eq("case_id", caseId),
        );
        await must(ev("closed", { outcome: t.closes, reason: reasonLabel }));
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case", caseId] }),
        qc.invalidateQueries({ queryKey: ["cases"] }),
      ]);
      toast(t.closes ? `Message sent · claim ${t.closes} and closed` : "Message sent (simulated)");
      setConfirming(false);
      // the decision panel moves on to the next case after a decision or a request
      if (tpl === "request" || t.closes) onRequestSent?.();
    } catch (e) {
      toast(`Could not send: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const order: TemplateKey[] = ["accept", "deny", "request", "reminder", "message"];
  const T = TEMPLATES[tpl];

  return (
    <div className={cn("card-quiet mb-5 overflow-hidden", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-7 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-surface-2 font-mono text-[11px] font-medium text-text-2 ring-1 ring-line">
            {(customer ?? "?")
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)}
          </span>
          <div>
            <h2 className="section-title leading-tight">
              Customer · {customer ?? "Unknown customer"}
            </h2>
            <p className="label-mono mt-0.5">
              {caseId} · {plate ?? "no plate"} · simulated email
            </p>
          </div>
        </div>
        {closed ? (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-2">
            <Lock className="size-3.5" /> Claim closed – conversation archived
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-3 text-[12.5px] text-text-2">
            {queue === "waiting_customer" && claim && policy && (
              <SimulateReplyDialog
                caseId={caseId}
                claim={claim}
                policy={policy}
                customer={customer}
                actor={reviewer}
              />
            )}
          </span>
        )}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* thread */}
        <div
          ref={threadRef}
          className="max-h-[420px] min-h-[220px] space-y-3 overflow-y-auto border-line/70 bg-surface-2 px-7 py-5 lg:border-r"
        >
          {thread.length === 0 && (
            <p className="py-10 text-center text-[13px] text-text-3">No messages yet.</p>
          )}
          {thread.map((e) => {
            const p = (e.payload ?? {}) as Row;
            if (e.type === "message_sent" && p.body)
              return (
                <div key={e.id} className="ml-auto max-w-[92%]">
                  <div className="whitespace-pre-line rounded-[6px] rounded-br-[4px] bg-link px-4 py-3 text-[13px] leading-relaxed text-primary-foreground shadow-none">
                    {p.body}
                  </div>
                  <p className="label-mono mt-1 text-right normal-case">
                    {fmtTime(e.created_at)} · {e.actor} · {p.channel === "sms" ? "SMS" : "Email"}
                    {p.template && p.template !== "message"
                      ? ` · ${TEMPLATES[p.template as TemplateKey]?.label ?? p.template}`
                      : ""}
                  </p>
                </div>
              );
            if (e.type === "message_received")
              return (
                <div key={e.id} className="max-w-[92%]">
                  <div className="whitespace-pre-line rounded-[6px] rounded-bl-[4px] bg-surface px-4 py-3 text-[13px] leading-relaxed ring-1 ring-line">
                    {p.body}
                  </div>
                  <p className="label-mono mt-1 normal-case">
                    {fmtTime(e.created_at)} · {customer}
                  </p>
                </div>
              );
            if (e.type === "retriaged")
              return (
                <p
                  key={e.id}
                  className="flex items-center justify-center gap-1.5 py-1 text-center text-[12px] text-text-2"
                >
                  <CircleCheck className="size-3" /> Documents received · re-checked under{" "}
                  {String(p.policy_version ?? "").toUpperCase()} →{" "}
                  <strong className="font-medium text-foreground">
                    {RECOMMENDATION_LABELS[p.after as Recommendation] ?? p.after}
                  </strong>
                  {p.queue ? ` · ${QUEUE_LABELS[p.queue as Queue] ?? p.queue}` : ""} ·{" "}
                  {fmtTime(e.created_at)}
                </p>
              );
            if (e.type === "closed")
              return (
                <p
                  key={e.id}
                  className="flex items-center justify-center gap-1.5 py-1 text-center text-[12px] text-text-2"
                >
                  <Lock className="size-3" /> Claim {p.outcome ?? "closed"}
                  {p.reason ? ` · ${p.reason}` : ""} and closed · {fmtTime(e.created_at)} ·{" "}
                  {e.actor}
                </p>
              );
            // automatic outreach and reminders from the rules engine (no body stored)
            if (p.manual) return null;
            return (
              <p
                key={e.id}
                className="flex items-center justify-center gap-1.5 py-1 text-center text-[12px] text-text-3"
              >
                <Mail className="size-3" /> Automatic{" "}
                {e.type === "reminder_sent" ? "reminder" : "request for missing information"} sent ·{" "}
                {fmtTime(e.created_at)}
              </p>
            );
          })}
        </div>

        {/* composer */}
        <div className="px-7 py-5">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {order.filter((k) => k !== "reminder" || queue === "waiting_customer").map((k) => {
              const t = TEMPLATES[k];
              const Icon = t.icon;
              return (
                <Button
                  variant="outline"
                  key={k}
                  type="button"
                  disabled={closed}
                  onClick={() => setTpl(k)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium ring-1 transition-shadow disabled:opacity-40",
                    tpl === k
                      ? "bg-surface shadow-none ring-link/40"
                      : "bg-surface-2 ring-line hover:bg-surface",
                  )}
                >
                  <Icon className={cn("size-3.5", t.tone)} strokeWidth={1.8} />
                  {t.label}
                  {recommended.includes(k) && !closed && (
                    <span
                      className="ml-0.5 size-1.5 rounded-full bg-link"
                      title="Suggested for this case"
                    />
                  )}
                </Button>
              );
            })}
          </div>

          {tpl === "deny" && !closed && (
            <div className="mb-3">
              <label htmlFor="deny-reason" className="label-mono mb-1.5 block">
                Reason for denial
              </label>
              <select
                id="deny-reason"
                value={denyKey}
                onChange={(e) => setDenyKey(e.target.value)}
                className="h-9 w-full rounded-[10px] border border-line bg-surface px-3 text-[13.5px] focus-visible:outline-2 focus-visible:outline-link"
              >
                {DENY_REASONS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Textarea
            value={closed ? "" : body}
            disabled={closed}
            onChange={(e) => {
              setBody(e.target.value);
              setConfirming(false);
            }}
            placeholder={closed ? "This claim is closed." : ""}
            className="min-h-[190px] bg-surface text-[13px] leading-relaxed"
          />

          {!closed && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-[12px] text-text-2">
                <Mail className="size-3.5" strokeWidth={1.7} /> Sent by email to{" "}
                {customer ?? "the customer"}
              </span>
              {confirming ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] text-text-2">
                    This sends the message and closes the claim for good.
                  </span>
                  <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                  <Button disabled={busy || body.trim().length < 10} onClick={() => void send()}>
                    <Send /> Yes, send & close
                  </Button>
                </div>
              ) : (
                <Button disabled={busy || body.trim().length < 10} onClick={() => void send()}>
                  <Send />{" "}
                  {T.closes
                    ? `Send & ${T.closes === "accepted" ? "accept" : "deny"} claim`
                    : tpl === "request"
                      ? "Send request"
                      : tpl === "reminder"
                        ? "Send reminder"
                        : "Send"}
                </Button>
              )}
            </div>
          )}
          {!closed && needsUser && (tpl === "accept" || tpl === "deny") && (
            <p className="mt-2 text-[12px] text-text-3">
              Recorded with {reviewer}, policy {version.toUpperCase()} and the time. The claim is
              then closed and never re-evaluated.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact customer bar on the case page. Clicking it opens the full conversation (same component)
 * in a pop-up window, so the case page stays short.
 */
export function CustomerChatLauncher(props: Parameters<typeof CustomerChat>[0]) {
  const [open, setOpen] = useState(false);
  const thread = props.events
    .filter((e) => e.type === "message_sent" || e.type === "message_received")
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const last = thread[thread.length - 1] as Row | undefined;
  const lastText = last
    ? String((last.payload as Row | null)?.body ?? "")
        .replace(/\s+/g, " ")
        .slice(0, 110)
    : "";
  const name = props.customer ?? "Unknown customer";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card-quiet mb-5 flex w-full items-center gap-4 px-7 py-4 text-left transition-shadow hover:shadow-none focus-visible:outline-2 focus-visible:outline-link"
      >
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[11px] font-medium text-text-2 ring-1 ring-line">
          {name
            .split(" ")
            .map((p) => p[0])
            .join("")
            .slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="section-title block leading-tight">Customer · {name}</span>
          <span className="mt-0.5 block truncate text-[13px] text-text-2">
            {last
              ? `${last.type === "message_received" ? name : "You"}: ${lastText}`
              : "No messages yet"}
          </span>
        </span>
        <span className="hidden shrink-0 text-[12.5px] text-text-2 sm:inline">
          {thread.length} {thread.length === 1 ? "message" : "messages"}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-line">
          <Mail className="size-3.5" strokeWidth={1.8} />{" "}
          {props.closed ? "View conversation" : "Open conversation"}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto border-0 bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">Conversation with {name}</DialogTitle>
          <DialogDescription className="sr-only">
            Email messages for claim {props.caseId}
          </DialogDescription>
          <CustomerChat {...props} className="mb-0 bg-background" />
        </DialogContent>
      </Dialog>
    </>
  );
}
