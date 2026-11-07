import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, Lock, MessageSquare, PhoneCall, Send, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { activePolicyQuery, caseDetailQuery, casesQuery } from "@/lib/data";
import { readCaseNav } from "@/lib/case-nav";
import { channelLabel, claimTypeLabel, humanize, repairTypeLabel, valueLabel } from "@/lib/labels";
import { decide, FIELD_LABELS, POLICY_V1, RECOMMENDATION_LABELS, type Claim, type Recommendation } from "@/lib/triage";
import { isClosed } from "@/lib/csv";
import { queueFor, SLA_HOURS } from "@/lib/lifecycle";
import { useRole } from "@/lib/role";
import { Card, Chip, Mono, StatusDot, Unknown, fmtEur, fmtTime } from "@/components/triage/ui";
import { CustomerChatLauncher } from "@/components/triage/CustomerChat";
import { secondCheckReason } from "@/lib/second-check";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TranscriptLine, FormField, IntakeDocument } from "@/lib/intake";

export const Route = createFileRoute("/_authenticated/claims/$caseId")({
  head: ({ params }) => ({ meta: [{ title: `${params.caseId} — Clearpath` }, { name: "description", content: `Case ${params.caseId}: recommendation, checklist and sources.` }] }),
  component: CaseDetail,
});

const HUMAN_EVENTS = new Set(["message_sent", "closed", "confirmed", "override", "comment", "call_logged", "assigned", "reminder_sent", "qa_confirmed"]);
const RECS: Recommendation[] = ["routine_processing", "request_information", "human_review"];
const REASONS: [string, string][] = [
  ["new_information", "New information"],
  ["evidence_misread", "Evidence misread"],
  ["policy_gap", "Policy gap"],
  ["data_error", "Data error"],
  ["other", "Other"],
];
const EVENT_TEXT: Record<string, string> = {
  received: "Claim received",
  triaged: "Triaged by the rules engine",
  assigned: "Assigned",
  outreach_sent: "Request sent to customer",
  reminder_sent: "Reminder sent",
  call_logged: "Phone call logged",
  documents_received: "Documents received",
  retriaged: "Re-triaged",
  escalated: "Escalated to a reviewer",
  confirmed: "Recommendation confirmed",
  qa_confirmed: "QA sample confirmed",
  override: "Recommendation overridden",
  comment: "Comment",
  policy_recheck: "Re-checked under new policy",
  qa_sampled: "Picked as random QA sample",
  second_check_flagged: "Flagged for a second check (close to the limit)",
  closed: "Claim closed",
  message_sent: "Message sent to customer",
  message_received: "Customer replied",
};

type Row = Record<string, any>;

function CaseDetail() {
  const { caseId } = Route.useParams();
  const { me } = useRole();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(caseDetailQuery(caseId));
  const policyQ = useQuery(activePolicyQuery);
  const [hover, setHover] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState<Recommendation | null>(null);
  const [busy, setBusy] = useState(false);
  const opened = useRef(Date.now());
  const confirmKey = useRef<(() => void) | null>(null);
  const overrideKey = useRef<(() => void) | null>(null);

  useEffect(() => {
    opened.current = Date.now();
    setHover(null);
  }, [caseId]);

  // ---------- step through the list the case was opened from (like a task queue) ----------
  const allCases = useQuery(casesQuery);
  const navigate = useNavigate();
  const nav = useMemo(() => {
    const stored = readCaseNav();
    if (stored && stored.ids.includes(caseId)) return stored;
    const list = allCases.data ?? [];
    const onYou = list
      .filter((c) => !isClosed(c.claim.case_status) && (c.workflow?.queue === "on_you" || (c.workflow?.qa_sample && c.workflow.queue !== "done")))
      .map((c) => c.claim.case_id);
    if (onYou.includes(caseId)) return { label: "To review", ids: onYou };
    return { label: "All claims", ids: list.map((c) => c.claim.case_id) };
  }, [caseId, allCases.data]);
  const pos = nav.ids.indexOf(caseId);
  const prevId = pos > 0 ? nav.ids[pos - 1] : null;
  const nextId = pos >= 0 && pos < nav.ids.length - 1 ? nav.ids[pos + 1] : null;
  const goTo = (id: string | null) => {
    if (id) navigate({ to: "/claims/$caseId", params: { caseId: id } });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overrideOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.key === "ArrowRight" || e.key === "j" || e.key === "J") goTo(nextId);
      else if (e.key === "ArrowLeft" || e.key === "k" || e.key === "K") goTo(prevId);
      else if (e.key === "c" || e.key === "C") confirmKey.current?.();
      else if (e.key === "o" || e.key === "O") overrideKey.current?.();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextId, prevId, overrideOpen]);

  if (isLoading) return <p className="label-mono">Loading</p>;
  if (!data?.claim) return <p className="text-text-2">Case not found.</p>;

  const claim = data.claim as unknown as Claim;
  const closed = isClosed(claim.case_status);
  const policy = policyQ.data ?? POLICY_V1;
  const live = decide(claim, policy);
  const decision = data.decision as Row | null;
  const workflow = data.workflow as Row | null;
  const overrides = (data.overrides ?? []) as Row[];
  const comments = (data.comments ?? []) as Row[];
  const lastOverride = overrides[overrides.length - 1] as Row | undefined;
  const systemRec = (decision?.recommendation ?? live.recommendation) as Recommendation;
  const rec = (lastOverride?.new_recommendation ?? systemRec) as Recommendation;
  const version = (decision?.policy_version ?? policy.version) as string;
  const queue = workflow?.queue as string | undefined;
  const qa = !!workflow?.qa_sample;
  const nearLimit = qa ? secondCheckReason(claim, policy, systemRec) : null;
  const recheck = !!decision?.needs_recheck;
  const confirmed = (data.events as Row[]).some((e) => e.type === "confirmed" || e.type === "qa_confirmed");
  const needsUser = !closed && (queue === "on_you" || qa);
  const tone = !needsUser ? "" : rec === "request_information" ? "tint-wait" : rec === "human_review" ? "tint-action" : "";
  const unknownCount = live.checklist.filter((c) => c.status === "unknown").length;
  const mine = workflow?.assignee === me.name;

  const transcript = (data.intake?.transcript as unknown as TranscriptLine[] | null) ?? null;
  const form = (data.intake?.form as unknown as FormField[] | null) ?? null;
  const docs = (data.intake?.documents as unknown as IntakeDocument[] | null) ?? [];
  const facts = data.facts as Row[];
  const refOf = (f: string) => facts.find((x) => x.field === f);
  // Only the checklist item under the pointer (or keyboard focus) marks its source
  const active = hover;
  const activeItem = active ? live.checklist.find((c) => c.field === active) : undefined;
  // The source gets the same colour as the checklist row: red trigger, amber missing, grey unknown, blue otherwise
  const hlCls =
    activeItem?.status === "fail"
      ? activeItem.stage === "R1"
        ? "bg-action-tint ring-1 ring-action-border"
        : "bg-wait-tint ring-1 ring-wait-border"
      : activeItem?.status === "unknown"
        ? "bg-surface-2 ring-1 ring-text-3/50"
        : "bg-link/10 ring-1 ring-link/30";
  const activeSrc = active ? refOf(active) : undefined;
  // System checks that are not already a line in the call transcript (online-form and CSV cases)
  const systemSources = facts
    .filter((x) => x.source_type === "system" && !String(x.ref ?? "").startsWith("line"))
    .filter((x, i, arr) => arr.findIndex((y) => y.ref === x.ref) === i);

  const slaDue = workflow?.sla_due_at ? new Date(workflow.sla_due_at) : null;
  const slaText = slaDue
    ? slaDue < new Date()
      ? `SLA passed ${relTime(slaDue)} ago`
      : `SLA due in ${relTime(slaDue)}`
    : `SLA ${SLA_HOURS}h`;

  // ---------- writes (all append-only except the workflow row) ----------
  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["case", caseId] }), qc.invalidateQueries({ queryKey: ["cases"] })]);
  };
  const event = (type: string, payload: Record<string, unknown> = {}) =>
    supabase.from("case_events").insert({ case_id: caseId, type, actor: me.name, payload: { policy_version: version, ...payload } as any });
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast(ok);
      return true;
    } catch (e) {
      toast(`Could not save: ${(e as Error).message}`);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const must = async (p: PromiseLike<{ error: unknown }>) => {
    const { error } = await p;
    if (error) throw error;
  };

  const confirm = async (advance = false) => {
    const handling_seconds = Math.round((Date.now() - opened.current) / 1000);
    const ok = await run(async () => {
      if (qa && queue !== "on_you") {
        await must(event("qa_confirmed", { recommendation: rec, rule_id: decision?.rule_id, handling_seconds }));
        await must(supabase.from("case_workflow").update({ qa_sample: false, updated_at: new Date().toISOString() }).eq("case_id", caseId));
      } else {
        await must(event("confirmed", { recommendation: rec, rule_id: decision?.rule_id, handling_seconds }));
        await must(supabase.from("case_workflow").update({ queue: "done", qa_sample: false, updated_at: new Date().toISOString() }).eq("case_id", caseId));
      }
    }, advance && nextId ? `Confirmed in ${handling_seconds}s · next case` : `Confirmed in ${handling_seconds}s`);
    if (ok && advance && nextId) goTo(nextId);
  };

  const assignMe = () =>
    run(async () => {
      await must(supabase.from("case_workflow").update({ assignee: me.name, updated_at: new Date().toISOString() }).eq("case_id", caseId));
      await must(event("assigned", { assignee: me.name }));
    }, "Assigned to you");

  const reminder = () => run(() => must(event("reminder_sent", { channel: "email", manual: true })), "Reminder sent (simulated)");
  const call = () => run(() => must(event("call_logged", { channel: "phone" })), "Phone call logged");

  const saveOverride = async (next: Recommendation, reasonCode: string, reasonText: string) => {
    await run(async () => {
      await must(
        supabase.from("overrides").insert({
          case_id: caseId,
          decision_id: decision?.id ?? null,
          original_recommendation: rec,
          new_recommendation: next,
          reason_code: reasonCode,
          reason_text: reasonText,
          reviewer: me.name,
          policy_version: version,
          handling_seconds: Math.round((Date.now() - opened.current) / 1000),
        }),
      );
      await must(event("override", { from: rec, to: next, reason_code: reasonCode, reason_text: reasonText, rule_id: decision?.rule_id }));
      const q = queueFor(next, false);
      await must(
        supabase
          .from("case_workflow")
          .update({ queue: q, qa_sample: false, assignee: q === "on_you" ? workflow?.assignee ?? me.name : workflow?.assignee ?? null, updated_at: new Date().toISOString() })
          .eq("case_id", caseId),
      );
    }, "Override recorded");
    setOverrideOpen(null);
  };

  const postComment = (body: string) =>
    run(async () => {
      await must(supabase.from("comments").insert({ case_id: caseId, author: me.name, body }));
    }, "Comment posted");

  // ---------- next-step content by state ----------
  let stepTitle = "";
  let stepText: ReactNode = "";
  let actions: ReactNode = null;
  const overrideBtn = (label = "Override", pre?: Recommendation) => (
    <Button variant="outline" disabled={busy} onClick={() => setOverrideOpen(pre ?? (rec === "human_review" ? "routine_processing" : "human_review"))} title={`${label} (O)`}>
      {label} <Kbd>O</Kbd>
    </Button>
  );
  const assignBtn = !mine && !closed && queue === "on_you" && (
    <Button variant="ghost" disabled={busy} onClick={assignMe}>
      <UserPlus /> Assign to me
    </Button>
  );

  if (closed) {
    stepTitle = "Nothing to do";
    stepText = `Closed. The decision is frozen under policy ${version.toUpperCase()} and will never be re-evaluated.`;
  } else if (queue === "done" || confirmed) {
    stepTitle = "Done";
    stepText = "A reviewer has confirmed this case. It continues in the normal claims process. You can still correct it while the claim is open.";
    actions = (
      <>
        {overrideBtn("Override")}
        {nextId && (
          <Button onClick={() => goTo(nextId)}>
            Next case <Kbd dark>→</Kbd>
          </Button>
        )}
      </>
    );
  } else if (queue === "on_you" && rec === "human_review") {
    stepTitle = recheck ? "Check the new policy result" : "Review this claim";
    stepText = recheck
      ? "The policy changed and this open case now gets a different recommendation. Check the evidence and confirm, or correct it."
      : "A known risk needs a person. Check the highlighted item in the checklist against its source, then confirm the escalation or correct it with a reason.";
    actions = (
      <>
        {assignBtn}
        {overrideBtn("Override")}
        <Button disabled={busy} onClick={() => confirm(true)} title="Confirm (C)">
          <Check /> {recheck ? `Confirm ${version} result` : "Confirm review"}
          {nextId && " & next"} <Kbd dark>C</Kbd>
        </Button>
      </>
    );
  } else if (qa || queue === "on_you") {
    stepTitle = nearLimit ? "Second check: close to the limit" : qa ? "Random QA sample" : "Check this case";
    stepText = nearLimit
      ? `${nearLimit} Check the quote and evidence; confirm if auto-processing is right, or correct it.`
      : qa
      ? "This claim was processed automatically. It was picked at random so a person can check the rules still work. Confirm if the decision is right, or correct it."
      : "This case is waiting for you. Confirm the recommendation or correct it.";
    actions = (
      <>
        {assignBtn}
        {overrideBtn("Override")}
        <Button disabled={busy} onClick={() => confirm(true)} title="Confirm (C)">
          <Check /> Confirm {RECOMMENDATION_LABELS[rec].toLowerCase()}
          {nextId && " & next"} <Kbd dark>C</Kbd>
        </Button>
      </>
    );
  } else if (queue === "waiting_customer") {
    const missing = (decision?.missing_fields as string[] | undefined) ?? [];
    stepTitle = "Waiting on the customer";
    stepText = (
      <>
        We asked the customer for {missing.length ? <strong>{missing.map((f) => FIELD_LABELS[f] ?? f).join(", ")}</strong> : "the missing information"}. Reminders go out
        automatically after 48h and 96h; after that the case comes to a reviewer. Nothing needed from you unless the customer calls.
      </>
    );
    actions = (
      <>
        <Button variant="ghost" disabled={busy} onClick={call}>
          <PhoneCall /> Log phone call
        </Button>
        {overrideBtn("Override")}
        <Button variant="outline" disabled={busy} onClick={reminder}>
          <Send /> Send reminder now
        </Button>
      </>
    );
  } else {
    stepTitle = "Processed automatically";
    stepText = "All checks passed, so this claim went into the normal process. Nothing to do – history only. Auto-processed is not a payment approval.";
    actions = overrideBtn("Pull into review", "human_review");
  }

  // keyboard: C confirms (and moves on), O opens the override
  const canConfirm = !closed && !busy && !(queue === "done" || confirmed) && (queue === "on_you" || qa);
  confirmKey.current = canConfirm ? () => void confirm(true) : null;
  overrideKey.current = !closed && !busy ? () => setOverrideOpen(rec === "human_review" ? "routine_processing" : "human_review") : null;

  // ---------- timeline: past + what happens next ----------
  const past = [
    ...(data.events as Row[]).map((e) => ({ at: e.created_at as string, kind: "event" as const, e })),
    ...comments.map((c) => ({ at: c.created_at as string, kind: "comment" as const, e: c })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const upcoming: string[] = closed
    ? []
    : queue === "done" || confirmed
      ? ["Normal claims handling (outside triage)"]
      : queue === "on_you"
        ? [`Reviewer decision · ${slaText}`, "Then: normal claims handling, or a request to the customer"]
        : queue === "waiting_customer"
          ? ["Automatic reminder (48h, then 96h)", "Customer sends documents → checked again automatically", "No answer after 2 reminders → goes to a reviewer"]
          : ["Normal claims handling (~7% are sampled for QA)"];

  return (
    <div>
      {/* 0 · Move through the queue */}
      <nav aria-label="Case navigation" className="mb-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" className="bg-white">
          <Link to="/dashboard">
            <ArrowLeft /> Back to my queue
          </Link>
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {pos >= 0 && (
            <span className="label-mono mr-1">
              {nav.label} · Case {pos + 1} of {nav.ids.length}
            </span>
          )}
          <Button variant="outline" className="bg-white" disabled={!prevId} onClick={() => goTo(prevId)} title="Previous case (←)">
            <ChevronLeft /> Previous <Kbd>←</Kbd>
          </Button>
          <Button variant="outline" className="bg-white font-semibold" disabled={!nextId} onClick={() => goTo(nextId)} title="Next case without deciding (→)">
            {nextId ? "Next case" : "Last case"} <Kbd>→</Kbd> <ArrowRight />
          </Button>
        </div>
      </nav>

      {/* 1 · Verdict and short description */}
      <div className={cn("card-quiet mb-5 p-7", tone)}>
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Mono className={cn(tone && "text-current")}>
                {caseId}
                {data.intake?.customer_name ? ` · ${data.intake.customer_name}` : ""}
                {data.intake?.plate ? ` · ${data.intake.plate}` : ""}
              </Mono>
              {closed ? <Chip><Lock className="mr-1 size-3" /> Closed</Chip> : <Chip>Open</Chip>}
              {recheck && <Chip>Needs re-check · policy {version}</Chip>}
              {qa && <Chip>{nearLimit ? "Second check · near limit" : "QA sample"}</Chip>}
              {lastOverride && <Chip>Overridden</Chip>}
              {unknownCount > 0 && <Chip className="border-dashed">{unknownCount} unknown {unknownCount === 1 ? "field" : "fields"}</Chip>}
            </div>
            <div className="mt-4 text-[28px] font-semibold leading-none tracking-tight">
              <StatusDot rec={rec} closed={closed} plain />
            </div>
            <p className={cn("mt-3 max-w-2xl text-[15px] font-medium", tone ? "text-current" : "text-foreground")}>
              {lastOverride ? lastOverride.reason_text : humanize(decision?.explanation ?? live.reasons.join(". "))}
            </p>
            <p className="mt-1.5 max-w-2xl text-[13.5px] text-text-2">
              <span className="label-mono mr-2">Summary</span>
              {claim.claim_summary ?? "No summary provided."}
            </p>
            {lastOverride && (
              <p className="mt-3 max-w-2xl rounded-[10px] bg-white/60 px-3 py-2 text-[12.5px] text-text-2 ring-1 ring-white/80">
                System said <strong className="text-foreground">{RECOMMENDATION_LABELS[lastOverride.original_recommendation as Recommendation] ?? lastOverride.original_recommendation}</strong> ({String(decision?.rule_id ?? "").toUpperCase()}).
                Changed to <strong className="text-foreground">{RECOMMENDATION_LABELS[rec]}</strong> by {lastOverride.reviewer} · {reasonLabel(lastOverride.reason_code)} · policy{" "}
                {String(lastOverride.policy_version ?? "").toUpperCase()} · {fmtTime(lastOverride.created_at)}
              </p>
            )}
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
            {[
              ["Rule", String(decision?.rule_id ?? live.recommendation).toUpperCase()],
              ["Policy", version.toUpperCase()],
              ["Received", fmtTime(data.claim.received_at)],
              ["Assignee", workflow?.assignee ?? "Unassigned"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className={cn("label-mono", tone && "text-current opacity-80")}>{k}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Fact label="Quote" value={claim.quote_eur === null ? null : fmtEur(claim.quote_eur)} flag={live.checklist.some((c) => c.field === "quote_eur" && c.status === "fail")} />
          <Fact label="Claim type" value={claim.claim_type ? claimTypeLabel(claim.claim_type) : null} flag={live.checklist.some((c) => c.field === "claim_type" && c.status === "fail")} />
          <Fact label="Repair" value={claim.repair_type ? repairTypeLabel(claim.repair_type) : null} flag={live.checklist.some((c) => c.field === "repair_type" && c.status === "fail")} />
          <Fact label="Channel" value={channelLabel(data.intake?.channel ?? "csv_import")} />
        </div>
      </div>

      {/* 2 · What the reviewer does now */}
      <div className="card-quiet mb-5 flex flex-wrap items-center justify-between gap-4 px-7 py-5">
        <div className="min-w-0 max-w-2xl">
          <p className="label-mono mb-1">Your next step</p>
          <h2 className="section-title">{stepTitle}</h2>
          <p className="mt-1 text-[13.5px] text-text-2">{stepText}</p>
        </div>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {/* 2b · Customer conversation (opens in a pop-up): accept / deny / request / remind via templates */}
      <CustomerChatLauncher
        caseId={caseId}
        customer={data.intake?.customer_name ?? null}
        plate={data.intake?.plate ?? null}
        quote={claim.quote_eur}
        version={version}
        rec={rec}
        queue={queue}
        closed={closed}
        needsUser={needsUser}
        missingFields={((decision?.missing_fields as string[] | undefined) ?? []).concat(live.checklist.filter((c) => c.stage === "R2" && c.status === "fail").map((c) => c.field)).filter((f, i, a) => a.indexOf(f) === i)}
        failedTrigger={live.checklist.find((c) => c.status === "fail" && c.stage === "R1")?.key ?? null}
        decisionId={(decision?.id as string | undefined) ?? null}
        reviewer={me.name}
        events={data.events as Row[]}
      />

      {/* 3 · Evidence: checklist and sources side by side, same height */}
      <div className="mb-5 grid items-stretch gap-5 lg:grid-cols-2">
        <Card className="flex flex-col">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="section-title">Checklist · policy {version}</h2>
            <span className="label-mono">
              {live.checklist.filter((c) => c.status === "fail").length} failed · {unknownCount} unknown
            </span>
          </div>
          <ul className="divide-y divide-line/80" onMouseLeave={() => setHover(null)}>
            {live.checklist.map((c) => {
              const src = refOf(c.field);
              return (
                <li key={c.key}>
                  <button
                    onMouseEnter={() => setHover(c.field)}
                    onFocus={() => setHover(c.field)}
                    onBlur={() => setHover(null)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[8px] px-2 py-2.5 text-left transition-[background-color,box-shadow] duration-200",
                      c.status === "fail" && c.stage === "R1" && "my-1 bg-action-tint ring-1 ring-action-border",
                      c.status === "fail" && c.stage !== "R1" && "my-1 bg-wait-tint ring-1 ring-wait-border",
                      c.status === "unknown" && "my-1 border border-dashed border-text-3/60 bg-surface-2",
                      active === c.field &&
                        (c.status === "pass"
                          ? "bg-link/10 ring-1 ring-link/30"
                          : c.status === "unknown"
                            ? "border-text-2"
                            : c.stage === "R1"
                              ? "ring-2 ring-action-dot/45"
                              : "ring-2 ring-wait-dot/50"),
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-5 shrink-0 items-center justify-center rounded-full",
                        c.status === "pass" && "text-ok",
                        c.status === "fail" && (c.stage === "R1" ? "text-action" : "text-wait"),
                        c.status === "unknown" && "border border-dashed border-text-3 text-text-2",
                      )}
                    >
                      {c.status === "pass" ? <Check className="size-4" strokeWidth={2} /> : c.status === "fail" ? <X className="size-4" strokeWidth={2} /> : <span className="text-[11px]">?</span>}
                    </span>
                    <span
                      className={cn(
                        "flex-1 text-[13.5px]",
                        c.status === "fail" && "font-semibold",
                        c.status === "fail" && (c.stage === "R1" ? "text-action" : "text-wait"),
                        c.status === "pass" && "text-text-2",
                      )}
                    >
                      {humanize(c.note)}
                    </span>
                    {src ? (
                      <span className="label-mono hidden text-[10px] sm:inline">{src.ref}</span>
                    ) : (
                      <span className="label-mono hidden text-[10px] text-text-3 sm:inline">no source</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-auto border-t border-line/80 pt-4 text-[13px] text-text-2">
            <Mono className="mr-2">What would have to change?</Mono>
            {live.counterfactual}
          </p>
        </Card>

        <Card className="flex flex-col">
          <h2 className="section-title">Sources</h2>
          <p className="mb-4 mt-1 text-[12.5px] text-text-2">Point at a checklist item to see where the fact came from.</p>
          {transcript && (
            <div className="mb-5">
              <Mono>Call transcript</Mono>
              <ol className="mt-2 space-y-1 text-[13px]">
                {transcript.map((l) => {
                  const on = !!activeSrc?.ref?.match(new RegExp(`line ${l.line}(\\b|$)`));
                  return (
                    <li key={l.line} data-on={on || undefined} className={cn("flex gap-2 rounded-[6px] px-1.5 py-1 transition-colors duration-200", on && hlCls)}>
                      <span className="w-5 shrink-0 font-mono text-[11px] text-text-3">{l.line}</span>
                      <span className={cn("w-16 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.06em]", l.speaker === "customer" ? "text-foreground" : "text-text-2")}>{l.speaker}</span>
                      <span className={cn(l.speaker === "system" && "text-text-2")}>{humanize(l.text)}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          {form && (
            <div className="mb-5">
              <Mono>Online form</Mono>
              <dl className="mt-2 divide-y divide-line/80 text-[13px]">
                {form.map((f) => {
                  const on = activeSrc?.ref === `field ${f.field}`;
                  return (
                    <div key={f.field} data-on={on || undefined} className={cn("flex justify-between gap-3 rounded-[6px] px-1.5 py-1.5 transition-colors duration-200", on && hlCls)}>
                      <dt className="text-text-2">
                        <span className="mr-2 font-mono text-[11px] text-text-3">{f.field}</span>
                        {f.label}
                      </dt>
                      <dd className="text-right">{f.value === null ? <Unknown>empty</Unknown> : valueLabel(f.value)}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}
          <div>
            <Mono>Documents</Mono>
            <ul className="mt-2 space-y-1.5 text-[13px]">
              {docs.map((d) => {
                const on = activeSrc?.ref === d.name;
                return (
                  <li key={d.name} data-on={on || undefined} className={cn("flex items-center justify-between rounded-[6px] px-1.5 py-1 transition-colors duration-200", on && hlCls)}>
                    <span className="font-mono text-[12px]">{d.name}</span>
                    <span className={cn("text-[12px]", d.status === "missing" || d.status === "incomplete" ? "text-wait" : d.status === "unknown" ? "" : "text-text-2")}>
                      {d.status === "unknown" ? <Unknown /> : humanize(d.note)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          {systemSources.length > 0 && (
            <div className="mt-5">
              <Mono>System checks</Mono>
              <ul className="mt-2 space-y-1.5 text-[13px]">
                {systemSources.map((f) => {
                  const on = activeSrc?.ref === f.ref;
                  return (
                    <li key={f.ref} data-on={on || undefined} className={cn("flex items-center justify-between gap-3 rounded-[6px] px-1.5 py-1 transition-colors duration-200", on && hlCls)}>
                      <span className="font-mono text-[12px]">{f.ref}</span>
                      <span className="text-right text-[12px] text-text-2">{humanize(f.quote)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* 4 · Timeline and comments side by side, same height */}
      <div className="grid items-stretch gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="section-title mb-5">Timeline</h2>
          {upcoming.length > 0 && (
            <ol className="relative mb-2 ml-1.5 border-l border-dashed border-text-3/60">
              {upcoming.map((u, i) => (
                <li key={u} className="relative pb-4 pl-5">
                  <span className={cn("absolute -left-[5px] top-1.5 size-2.5 rounded-full border-2 bg-surface", i === 0 && needsUser ? "border-action-dot" : "border-text-3")} />
                  <p className={cn("text-[13px]", i === 0 ? "font-medium" : "text-text-2")}>
                    <span className="label-mono mr-2">{i === 0 ? "Next" : "Then"}</span>
                    {u.replace(/^Then: /, "")}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <ol className="relative ml-1.5 border-l border-line">
            {past.map((p) => {
              const e = p.e;
              if (p.kind === "comment")
                return (
                  <li key={`c-${e.id}`} className="relative pb-4 pl-5 last:pb-0">
                    <span className="absolute -left-[4.5px] top-1.5 size-2 rounded-full bg-ink" />
                    <p className="text-[13px]">
                      <MessageSquare className="mr-1.5 inline size-3.5 text-text-2" strokeWidth={1.6} />“{e.body}”
                    </p>
                    <p className="label-mono mt-0.5 normal-case">
                      {fmtTime(e.created_at)} · {e.author}
                    </p>
                  </li>
                );
              const pl = (e.payload ?? {}) as Row;
              return (
                <li key={e.id} className="relative pb-4 pl-5 last:pb-0">
                  <span className={cn("absolute -left-[4.5px] top-1.5 size-2 rounded-full", HUMAN_EVENTS.has(e.type) && !/engine|system/i.test(String(e.actor ?? "system")) ? "bg-ink" : e.type === "escalated" ? "bg-action-dot" : "bg-text-3")} />
                  <p className="text-[13px]">
                    {EVENT_TEXT[e.type] ?? e.type.replace(/_/g, " ")}
                    {e.type === "override" && pl.from && (
                      <span className="text-text-2">
                        {" "}
                        · {RECOMMENDATION_LABELS[pl.from as Recommendation] ?? pl.from} <ArrowRight className="inline size-3" /> {RECOMMENDATION_LABELS[pl.to as Recommendation] ?? pl.to} · {reasonLabel(pl.reason_code)} · “{pl.reason_text}”
                      </span>
                    )}
                    {e.type === "triaged" && decision && <span className="text-text-2"> · {RECOMMENDATION_LABELS[systemRec]} ({String(decision.rule_id).toUpperCase()})</span>}
                  </p>
                  <p className="label-mono mt-0.5 normal-case">
                    {fmtTime(e.created_at)} · {e.actor ?? "System"}
                    {pl.policy_version ? ` · policy ${pl.policy_version}` : ""}
                  </p>
                </li>
              );
            })}
          </ol>
        </Card>
        <CommentBox disabled={busy} onPost={postComment} comments={comments} />
      </div>

      <OverrideDialog
        open={overrideOpen !== null}
        initial={overrideOpen}
        current={rec}
        rule={String(decision?.rule_id ?? "").toUpperCase()}
        reviewer={me.name}
        version={version}
        busy={busy}
        onClose={() => setOverrideOpen(null)}
        onSave={saveOverride}
      />
    </div>
  );
}

function Fact({ label, value, flag }: { label: string; value: ReactNode | null; flag?: boolean }) {
  return (
    <div className={cn("rounded-[12px] bg-white/65 px-3.5 py-2.5 ring-1 ring-white/80", flag && "bg-white ring-action-border")}>
      <p className={cn("label-mono text-[10px]", flag && "text-action")}>{label}</p>
      <p className={cn("mt-0.5 truncate text-[13.5px] font-medium text-foreground", flag && "text-action")}>{value ?? <Unknown />}</p>
    </div>
  );
}

function CommentBox({ onPost, disabled, comments }: { onPost: (body: string) => Promise<unknown>; disabled: boolean; comments: Row[] }) {
  const [body, setBody] = useState("");
  const post = async () => {
    if (body.trim().length < 2) return;
    await onPost(body.trim());
    setBody("");
  };
  const recent = [...comments].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">Comments</h2>
        <span className="label-mono">{comments.length ? `${comments.length} · cannot be edited` : "Cannot be edited"}</span>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-4">
        <ul className="max-h-[220px] space-y-2.5 overflow-y-auto pr-1">
          {recent.length === 0 && <li className="text-[13px] text-text-3">No comments yet.</li>}
          {recent.map((c) => (
            <li key={c.id} className="rounded-[10px] bg-surface-2 px-3 py-2 ring-1 ring-line">
              <p className="text-[13px]">{c.body}</p>
              <p className="label-mono mt-1 normal-case">
                {fmtTime(c.created_at)} · {c.author}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void post();
            }}
            placeholder="Note for colleagues, e.g. Called the workshop, quote confirmed."
            className="min-h-[96px] flex-1 bg-white/80"
          />
          <div className="mt-3 flex items-center justify-end gap-3">
            <span className="text-[12px] text-text-3">⌘ + Enter to post</span>
            <Button variant="outline" disabled={disabled || body.trim().length < 2} onClick={() => void post()}>
              Post comment
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function OverrideDialog({
  open,
  initial,
  current,
  rule,
  reviewer,
  version,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: Recommendation | null;
  current: Recommendation;
  rule: string;
  reviewer: string;
  version: string;
  busy: boolean;
  onClose: () => void;
  onSave: (next: Recommendation, code: string, text: string) => Promise<void>;
}) {
  const [next, setNext] = useState<Recommendation | null>(initial);
  const [code, setCode] = useState("");
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) {
      setNext(initial);
      setCode("");
      setText("");
    }
  }, [open, initial]);
  const valid = next && next !== current && code && text.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Override recommendation</DialogTitle>
          <DialogDescription>
            Current: <strong>{RECOMMENDATION_LABELS[current]}</strong>
            {rule ? ` (${rule})` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label className="mb-2 block">New recommendation</Label>
            <div className="grid grid-cols-3 gap-2">
              {RECS.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={r === current}
                  onClick={() => setNext(r)}
                  className={cn(
                    "rounded-[10px] border px-2 py-2.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-40",
                    next === r ? "border-transparent bg-white shadow-[var(--shadow-lift)] ring-2 ring-link" : "border-line bg-white/60 hover:bg-white",
                  )}
                >
                  <StatusDot rec={r} plain />
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="reason-code" className="mb-2 block">
              Reason
            </Label>
            <select
              id="reason-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-9 w-full rounded-[10px] border border-line bg-white px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-link"
            >
              <option value="" disabled>
                Choose a reason
              </option>
              {REASONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="reason-text" className="mb-2 block">
              Explain why <span className="font-normal text-text-2">(at least 10 characters)</span>
            </Label>
            <Textarea id="reason-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Workshop confirmed the quote is €1,450, the scan was misread." className="min-h-[90px]" />
          </div>
          <p className="text-[12px] text-text-2">
            Recorded with reviewer <strong className="text-foreground">{reviewer}</strong>, policy <strong className="text-foreground">{version.toUpperCase()}</strong> and a timestamp. Cannot be edited
            afterwards.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!valid || busy} onClick={() => next && onSave(next, code, text.trim())}>
              Save override
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function reasonLabel(code: unknown) {
  return REASONS.find(([v]) => v === code)?.[1] ?? String(code ?? "");
}

function relTime(d: Date) {
  const h = Math.abs(d.getTime() - Date.now()) / 3600e3;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}

function Kbd({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <kbd
      className={cn(
        "ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] px-1 font-mono text-[10px] font-medium",
        dark ? "bg-white/15 text-white/80 ring-1 ring-white/25" : "bg-surface-2 text-text-2 ring-1 ring-line",
      )}
    >
      {children}
    </kbd>
  );
}


