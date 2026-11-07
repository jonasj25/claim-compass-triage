import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  Lock,
  MessageSquare,
  PhoneCall,
  Phone,
  Send,
  UserPlus,
  X,
  Copy,
  Sparkles,
  FileText,
  User,
  Car,
  Calendar,
  Inbox,
  Wrench,
  Receipt,
  Shield,
  ListChecks,
  TriangleAlert,
  CircleCheck,
  CircleX,
  RefreshCw,
  FileQuestion,
  BellRing,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { activePolicyQuery, caseDetailQuery, casesQuery } from "@/lib/data";
import { readCaseNav } from "@/lib/case-nav";
import { channelLabel, claimTypeLabel, humanize, repairTypeLabel, valueLabel } from "@/lib/labels";
import {
  decide,
  FIELD_LABELS,
  POLICY_V1,
  RECOMMENDATION_LABELS,
  type Claim,
  type Recommendation,
} from "@/lib/triage";
import { isClosed } from "@/lib/csv";
import { queueFor } from "@/lib/lifecycle";
import { useRole } from "@/lib/role";
import { Card, Chip, Mono, StatusDot, Unknown, fmtEur, fmtTime } from "@/components/triage/ui";
import { CustomerChat, type TemplateKey } from "@/components/triage/CustomerChat";
import { secondCheckReason } from "@/lib/second-check";
import { CUSTOMER_STATUS_LABEL, customerStatus } from "@/lib/customer-status";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { WORK_TABS, claimPriority, type WorkTab } from "@/lib/workstream-presentation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TranscriptLine, FormField, IntakeDocument } from "@/lib/intake";

export const Route = createFileRoute("/_authenticated/claims/$caseId")({
  head: ({ params }) => ({
    meta: [
      { property: "og:title", content: `${params.caseId} — Clearpath` },
      {
        property: "og:description",
        content: "Clearpath claims workspace: review evidence, policy decisions and case activity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: `${params.caseId} — Clearpath` },
      {
        name: "description",
        content: `Case ${params.caseId}: recommendation, checklist and sources.`,
      },
    ],
  }),
  component: CaseDetail,
});

const HUMAN_EVENTS = new Set([
  "message_sent",
  "closed",
  "confirmed",
  "override",
  "comment",
  "call_logged",
  "assigned",
  "reminder_sent",
  "qa_confirmed",
]);
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
  policy_change: "Policy changed",
  triaged: "Triaged by the rules engine",
  assigned: "Assigned",
  outreach_sent: "Request sent to customer",
  reminder_sent: "Reminder sent",
  call_logged: "Phone call logged",
  call_requested: "Call to the customer started (Mia, voice agent)",
  call_ended: "Call with the customer ended",
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
  const [mainTab, setMainTab] = useState("Overview");
  const [sideTab, setSideTab] = useState("Tasks");
  const [taskChecks, setTaskChecks] = useState<Set<string>>(new Set());
  // Which customer message the decision panel opened in the Customer tab (accept / deny / request / reminder)
  const [chatTpl, setChatTpl] = useState<TemplateKey | undefined>(undefined);
  const opened = useRef(Date.now());
  const confirmKey = useRef<(() => void) | null>(null);
  const overrideKey = useRef<(() => void) | null>(null);

  useEffect(() => {
    opened.current = Date.now();
    setHover(null);
    setMainTab("Overview");
    setSideTab("Tasks");
    setTaskChecks(new Set());
    setChatTpl(undefined);
  }, [caseId]);

  // ---------- step through the list the case was opened from (like a task queue) ----------
  const allCases = useQuery(casesQuery);
  const navigate = useNavigate();
  const nav = useMemo(() => {
    const stored = readCaseNav();
    if (stored && stored.ids.includes(caseId)) return stored;
    const list = allCases.data ?? [];
    const onYou = list
      .filter(
        (c) =>
          !isClosed(c.claim.case_status) &&
          (c.workflow?.queue === "on_you" ||
            (c.workflow?.qa_sample && c.workflow.queue !== "done")),
      )
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
      if (
        t &&
        (t.isContentEditable ||
          t.closest("input, textarea, select, [role=dialog], [role=listbox], [role=combobox]"))
      )
        return;
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
  const confirmed = (data.events as Row[]).some(
    (e) => e.type === "confirmed" || e.type === "qa_confirmed",
  );
  const needsUser = !closed && (queue === "on_you" || qa);
  const tone = !needsUser
    ? ""
    : rec === "request_information"
      ? "tint-wait"
      : rec === "human_review"
        ? "tint-action"
        : "";
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

  // ---------- writes (all append-only except the workflow row) ----------
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["case", caseId] }),
      qc.invalidateQueries({ queryKey: ["cases"] }),
    ]);
  };
  const event = (type: string, payload: Record<string, unknown> = {}) =>
    supabase
      .from("case_events")
      .insert({
        case_id: caseId,
        type,
        actor: me.name,
        payload: { policy_version: version, ...payload } as any,
      });
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
    const ok = await run(
      async () => {
        if (qa && queue !== "on_you") {
          await must(
            event("qa_confirmed", {
              recommendation: rec,
              rule_id: decision?.rule_id,
              handling_seconds,
            }),
          );
          await must(
            supabase
              .from("case_workflow")
              .update({ qa_sample: false, updated_at: new Date().toISOString() })
              .eq("case_id", caseId),
          );
        } else {
          await must(
            event("confirmed", {
              recommendation: rec,
              rule_id: decision?.rule_id,
              handling_seconds,
            }),
          );
          await must(
            supabase
              .from("case_workflow")
              .update({ queue: "done", qa_sample: false, updated_at: new Date().toISOString() })
              .eq("case_id", caseId),
          );
        }
      },
      advance && nextId
        ? `Confirmed in ${handling_seconds}s · next case`
        : `Confirmed in ${handling_seconds}s`,
    );
    if (ok && advance) {
      if (nextId) goTo(nextId);
      else void navigate({ to: "/dashboard" });
    }
    return ok;
  };

  const assignMe = () =>
    run(async () => {
      await must(
        supabase
          .from("case_workflow")
          .update({ assignee: me.name, updated_at: new Date().toISOString() })
          .eq("case_id", caseId),
      );
      await must(event("assigned", { assignee: me.name }));
    }, "Assigned to you");

  const reminder = () =>
    run(
      () => must(event("reminder_sent", { channel: "email", manual: true })),
      "Reminder sent (simulated)",
    );
  const call = () =>
    run(() => must(event("call_logged", { channel: "phone" })), "Phone call logged");
  // Mia calls the customer in their claim portal and asks only for what is missing
  // What Mia asks: facts the rules are missing plus every check that is still unknown
  const callItems = (): string[] =>
    Array.from(
      new Set([
        ...((decision?.missing_fields as string[] | undefined) ?? []),
        ...live.checklist.filter((c) => c.status === "unknown").map((c) => c.field),
      ]),
    ).filter((f) => !["duplicate_flag", "evidence_conflict"].includes(f));
  const callTopics = (): string[] => {
    const items = callItems();
    if (items.length) return items;
    return Array.from(new Set(live.checklist.filter((c) => c.status === "fail").map((c) => c.field))).filter(
      (f) => !["duplicate_flag", "evidence_conflict"].includes(f),
    );
  };
  const callCustomer = () =>
    run(
      () => must(event("call_requested", { channel: "portal", missing_items: callTopics() })),
      "Calling the customer… their claim page is ringing",
    );
  const portalEmail = String(((data?.claim as Row | undefined)?.raw as Row | undefined)?.customer_email ?? "");
  const portalPlate = String(data?.intake?.plate ?? "");
  const portalUrl = portalPlate
    ? `/status?plate=${encodeURIComponent(portalPlate)}&case=${encodeURIComponent(caseId)}`
    : portalEmail
      ? `/claim/${caseId}?e=${encodeURIComponent(portalEmail)}`
      : null;

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
      await must(
        event("override", {
          from: rec,
          to: next,
          reason_code: reasonCode,
          reason_text: reasonText,
          rule_id: decision?.rule_id,
        }),
      );
      const q = queueFor(next, false);
      await must(
        supabase
          .from("case_workflow")
          .update({
            queue: q,
            qa_sample: false,
            assignee:
              q === "on_you" ? (workflow?.assignee ?? me.name) : (workflow?.assignee ?? null),
            updated_at: new Date().toISOString(),
          })
          .eq("case_id", caseId),
      );
    }, "Override recorded");
    setOverrideOpen(null);
  };

  const postComment = (body: string) =>
    run(async () => {
      await must(supabase.from("comments").insert({ case_id: caseId, author: me.name, body }));
    }, "Comment posted");

  // keyboard: C confirms (and moves on), O opens the override
  const isReview = !closed && queue === "on_you" && !confirmed;
  const isCheck = !closed && qa && queue !== "on_you" && queue !== "done" && !confirmed;
  const isWaiting = !closed && queue === "waiting_customer";
  const canConfirm = !busy && isCheck;
  const openChat = (tpl: TemplateKey) => {
    setChatTpl(tpl);
    setMainTab("Customer");
  };
  confirmKey.current = canConfirm ? () => void confirm(true) : null;
  overrideKey.current =
    !closed && !busy
      ? () => setOverrideOpen(rec === "human_review" ? "routine_processing" : "human_review")
      : null;

  // ---------- timeline: past + what happens next ----------
  const past = [
    ...(data.events as Row[]).map((e) => ({
      at: e.created_at as string,
      kind: "event" as const,
      e,
    })),
    ...comments.map((c) => ({ at: c.created_at as string, kind: "comment" as const, e: c })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const upcoming: string[] = closed
    ? []
    : queue === "done" || confirmed
      ? ["Normal claims handling (outside triage)"]
      : queue === "on_you"
        ? ["Reviewer decision", "Then: accept, deny or ask the customer for information"]
        : qa && queue !== "waiting_customer"
          ? ["Quick double-check by a reviewer", "Then: normal claims handling"]
        : queue === "waiting_customer"
          ? [
              "Automatic reminder (48h, then 96h)",
              "Customer sends documents → checked again automatically",
              "No answer after 2 reminders → goes to a reviewer",
            ]
          : ["Normal claims handling (~7% are sampled for QA)"];

  const storedLabel = nav.labelsById?.[caseId];
  const caseTab: WorkTab =
    storedLabel && WORK_TABS.includes(storedLabel as WorkTab)
      ? (storedLabel as WorkTab)
      : nearLimit
        ? "Near limit"
        : recheck
          ? "Policy change"
          : qa
            ? "QA sample"
            : "Risk cases";
  const priority = claimPriority(claim, caseTab);
  const missingFields = [
    ...new Set([
      ...(decision?.missing_fields ?? []),
      ...live.checklist.filter((c) => c.stage === "R2" && c.status === "fail").map((c) => c.field),
    ]),
  ] as string[];
  const triggers = live.checklist.filter((c) => c.status === "fail");
  const lastClose = [...((data.events ?? []) as Row[])].reverse().find((e) => e.type === "closed");
  const custStatus = customerStatus({
    caseStatus: claim.case_status as string | null,
    queue,
    recommendation: rec,
    outcome: ((lastClose?.payload ?? {}) as Row).outcome as string | undefined,
  });
  const status = closed
    ? "Closed"
    : queue === "done" || confirmed
      ? "Done"
      : queue === "waiting_customer"
        ? "Waiting on customer"
        : needsUser
          ? queue === "on_you"
            ? "To review"
            : "Quick double-check"
          : "Auto-processed";
  const assignees = [
    ...new Set([
      me.name,
      ...(allCases.data ?? []).map((c) => c.workflow?.assignee).filter((v): v is string => !!v),
    ]),
  ];
  const assign = (name: string) =>
    run(async () => {
      await must(
        supabase
          .from("case_workflow")
          .update({
            assignee: name === "unassigned" ? null : name,
            updated_at: new Date().toISOString(),
          })
          .eq("case_id", caseId),
      );
      await must(event("assigned", { assignee: name === "unassigned" ? null : name }));
    }, "Assignee updated");
  const tasks = [
    ...triggers.map((c) => ({
      key: c.key,
      label: `Check ${FIELD_LABELS[c.field] ?? c.field.replace(/_/g, " ")}`,
      note: humanize(c.note),
      tab: "Evidence",
    })),
    ...(nearLimit
      ? [{ key: "near_limit", label: "Verify quote amount", note: nearLimit, tab: "Evidence" }]
      : []),
    ...live.checklist
      .filter((c) => c.status === "unknown")
      .map((c) => ({
        key: c.key,
        label: `Clarify ${(FIELD_LABELS[c.field] ?? c.field.replace(/_/g, " ")).toLowerCase()}`,
        note: "Unknown – check the documents or ask the customer. Never guessed.",
        tab: "Evidence",
      })),
  ].filter(() => !isWaiting && !closed);
  const lastPolicyChange = [...(data.events as Row[])]
    .filter((e) => e.type === "policy_change")
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const pc = (lastPolicyChange?.payload ?? {}) as Row;
  const recLabel = (v: unknown) =>
    RECOMMENDATION_LABELS[v as Recommendation] ?? (v ? String(v) : "?");
  const unknownChecks = live.checklist.filter((c) => c.status === "unknown");
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const ruleLabel = (id: unknown) => {
    const r = String(id ?? "").split(".").pop()?.toUpperCase();
    const name =
      r === "R1" ? "Needs a person" : r === "BLANK" ? "Unknown field" : r === "R2" ? "Document missing" : r === "R3" ? "All clear" : null;
    return id ? (name ? `${name} (${String(id)})` : String(id)) : null;
  };
  return (
    <div>
      <nav aria-label="Case navigation" className="mb-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="px-0 text-text-2">
          <Link to="/dashboard">
            <ArrowLeft className="size-4" />
            Workstream
          </Link>
        </Button>
        <span className="font-mono text-[16px] font-semibold">{caseId}</span>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Copy case ID"
          title="Copy case ID"
          onClick={() =>
            void navigator.clipboard.writeText(caseId).then(() => toast("Case ID copied"))
          }
        >
          <Copy className="size-3.5" />
        </Button>
        <span
          className={cn(
            "text-[12px]",
            status === "To review"
              ? "text-action"
              : status === "Waiting on customer"
                ? "text-wait"
                : "text-text-2",
          )}
        >
          {status}
        </span>
        {(status === "To review" || status === "Quick double-check") && (
          <span
            title={priority.why}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11.5px] font-medium",
              priority.level === "High"
                ? "bg-action-tint text-action"
                : priority.level === "Medium"
                  ? "bg-wait-tint text-wait"
                  : "bg-ok/10 text-ok",
            )}
          >
            {priority.level} priority
          </span>
        )}
        {recheck && !closed && (
          <span className="inline-flex items-center gap-1 text-[12px] text-text-2">
            <RefreshCw className="size-3.5 text-link" /> Policy change
          </span>
        )}
        <span
          className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-text-2 ring-1 ring-line"
          title="What the customer sees on the public status page"
        >
          Customer sees: <span className="font-medium text-foreground">{CUSTOMER_STATUS_LABEL[custStatus]}</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          {!closed &&
            (workflow?.assignee ? (
              <span className="text-[11px] text-text-2">
                Assigned to <span className="font-medium text-foreground">{workflow.assignee === me.name ? "you" : workflow.assignee}</span>
              </span>
            ) : (
              <Button size="sm" variant="outline" className="h-8 bg-white text-[12px]" disabled={busy} onClick={() => void assignMe()}>
                Assign to me
              </Button>
            ))}
          <span className="text-[11px] text-text-2">
            Updated {fmtTime(workflow?.updated_at ?? data.claim.received_at)}
          </span>
          <span className="ml-2 text-[11px] text-text-2">
            Case {pos + 1} of {nav.ids.length}
          </span>
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            aria-label="Previous case"
            title="Previous case (←)"
            disabled={!prevId}
            onClick={() => goTo(prevId)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            aria-label="Next case"
            title="Next case (→)"
            disabled={!nextId}
            onClick={() => goTo(nextId)}
          >
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </nav>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2.125fr)_minmax(320px,1fr)]">
        <section className="min-w-0">
          <div
            role="tablist"
            aria-label="Case sections"
            className="mb-4 flex gap-5 border-b border-line"
          >
            {["Overview", "Evidence", "Customer"].map((tab) => (
              <Button
                key={tab}
                variant="ghost"
                role="tab"
                aria-selected={mainTab === tab}
                className={cn(
                  "h-10 rounded-none border-b-2 px-1 text-[13px]",
                  mainTab === tab ? "border-link text-link" : "border-transparent text-text-2",
                )}
                onClick={() => setMainTab(tab)}
              >
                {tab}
              </Button>
            ))}
          </div>
          {mainTab === "Overview" && (
            <>
              <div className="mb-4 grid items-stretch gap-4 md:grid-cols-2">
                <Card>
                  <h2 className="section-title mb-3">Case details</h2>
                  <dl className="divide-y divide-line">
                    {[
                      [User, "Customer", data.intake?.customer_name],
                      [Car, "Plate", data.intake?.plate],
                      [Calendar, "Received", fmtTime(data.claim.received_at)],
                      [Inbox, "Channel", channelLabel(data.intake?.channel ?? "csv_import")],
                      [
                        FileText,
                        "Claim type",
                        claim.claim_type ? claimTypeLabel(claim.claim_type) : null,
                      ],
                      [
                        Wrench,
                        "Repair",
                        claim.repair_type ? repairTypeLabel(claim.repair_type) : null,
                      ],
                      [Receipt, "Quote", fmtEur(claim.quote_eur)],
                      [Shield, "Policy version", version],
                      [ListChecks, "Rule", ruleLabel(decision?.rule_id)],
                    ].map(([Icon, label, val]) => {
                      const DetailIcon = Icon as typeof User;
                      return (
                        <div
                          key={String(label)}
                          className="flex items-center justify-between gap-2 py-2 text-[12px]"
                        >
                          <dt className="flex items-center gap-2 text-text-2">
                            <DetailIcon className="size-3.5" />
                            {String(label)}
                          </dt>
                          <dd className="text-right">{val ? String(val) : <Unknown />}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </Card>
                <Card>
                  <h2 className="section-title">What happened</h2>
                  <p className="mt-3 text-[13px] leading-relaxed">
                    {claim.claim_summary ?? "The incident summary is unknown."}
                  </p>
                  <h3 className="mt-4 text-[12px] font-semibold">Case triggers</h3>
                  <ul className="mt-2 space-y-2 text-[12px] text-text-2">
                    {nearLimit && (
                      <li>
                        <strong className="text-wait">
                          <TriangleAlert className="mr-1 inline size-3" />
                          Near limit.
                        </strong>{" "}
                        {nearLimit}
                      </li>
                    )}
                    {triggers.map((c) => (
                      <li key={c.key}>
                        <strong className="text-foreground">
                          {cap(FIELD_LABELS[c.field] ?? c.field.replace(/_/g, " "))}:
                        </strong>{" "}
                        {humanize(c.note)}
                      </li>
                    ))}
                    {unknownChecks.map((c) => (
                      <li key={c.key}>
                        <strong className="text-foreground">
                          {cap(FIELD_LABELS[c.field] ?? c.field.replace(/_/g, " "))}:
                        </strong>{" "}
                        unknown – we never guess, so the customer is asked.
                      </li>
                    ))}
                    {qa && !nearLimit && (
                      <li>
                        <strong className="text-foreground">Random QA sample:</strong> picked at
                        random to check that the rules still work.
                      </li>
                    )}
                    {recheck && (
                      <li>
                        <strong className="text-foreground">Policy change:</strong>{" "}
                        {pc.from_version && pc.to_version
                          ? `${pc.from_version} said ${recLabel(pc.before)}, ${pc.to_version} says ${recLabel(pc.after)}. Check the result under the new rules.`
                          : `the result changed under policy ${version}. Check it under the new rules.`}
                      </li>
                    )}
                    {!triggers.length && !unknownChecks.length && !qa && !recheck && !nearLimit && (
                      <li>All checks passed.</li>
                    )}
                  </ul>
                  <p className="mt-4 border-t border-line pt-3 text-[12px] text-text-2">
                    {closed
                      ? "Closed – the decision is frozen."
                      : queue === "done" || confirmed
                        ? "Reviewed – now in normal claims handling."
                        : isWaiting
                          ? `Waiting for the customer to send: ${missingFields.map((f) => (FIELD_LABELS[f] ?? f).toLowerCase()).join(", ") || "the missing information"}. Nothing to do until they reply.`
                          : isReview
                            ? "Next step: check the flagged points, then accept, deny or ask the customer."
                            : isCheck
                              ? "Next step: a quick look. Confirm if it is right, otherwise change the recommendation."
                              : "Auto-processed. Nothing to do."}
                  </p>
                </Card>
              </div>
            </>
          )}
          {mainTab === "Evidence" && (
            <div className="grid gap-4">
              {" "}
              <Card className="flex flex-col">
                <div className="mb-4 flex items-baseline justify-between gap-3">
                  <h2 className="section-title">Checklist · policy {version}</h2>
                  <span className="label-mono">
                    {live.checklist.filter((c) => c.status === "fail").length} failed ·{" "}
                    {unknownCount} unknown
                  </span>
                </div>
                <ul className="divide-y divide-line/80" onMouseLeave={() => setHover(null)}>
                  {live.checklist.map((c) => {
                    const src = refOf(c.field);
                    return (
                      <li key={c.key}>
                        <Button
                          variant="ghost"
                          onMouseEnter={() => setHover(c.field)}
                          onFocus={() => setHover(c.field)}
                          onBlur={() => setHover(null)}
                          className={cn(
                            "h-auto whitespace-normal flex w-full items-center gap-3 rounded-[8px] px-2 py-2.5 text-left transition-[background-color,box-shadow] duration-200",
                            c.status === "fail" &&
                              c.stage === "R1" &&
                              "my-1 bg-action-tint ring-1 ring-action-border",
                            c.status === "fail" &&
                              c.stage !== "R1" &&
                              "my-1 bg-wait-tint ring-1 ring-wait-border",
                            c.status === "unknown" &&
                              "my-1 border border-dashed border-text-3/60 bg-surface-2",
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
                              c.status === "fail" &&
                                (c.stage === "R1" ? "text-action" : "text-wait"),
                              c.status === "unknown" &&
                                "border border-dashed border-text-3 text-text-2",
                            )}
                          >
                            {c.status === "pass" ? (
                              <Check className="size-4" strokeWidth={2} />
                            ) : c.status === "fail" ? (
                              <X className="size-4" strokeWidth={2} />
                            ) : (
                              <span className="text-[11px]">?</span>
                            )}
                          </span>
                          <span
                            className={cn(
                              "flex-1 text-[13.5px]",
                              c.status === "fail" && "font-semibold",
                              c.status === "fail" &&
                                (c.stage === "R1" ? "text-action" : "text-wait"),
                              c.status === "pass" && "text-text-2",
                            )}
                          >
                            {humanize(c.note)}
                          </span>
                          {src ? (
                            <span className="label-mono hidden text-[10px] sm:inline">
                              {src.ref}
                            </span>
                          ) : (
                            <span className="label-mono hidden text-[10px] text-text-3 sm:inline">
                              no source
                            </span>
                          )}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-auto border-t border-line/80 pt-4 text-[13px] text-text-2">
                  <Mono className="mr-2">What would have to change?</Mono>
                  {live.counterfactual}
                </p>
              </Card>{" "}
              <Card className="flex flex-col">
                <h2 className="section-title">Sources</h2>

                {transcript && (
                  <div className="mb-5">
                    <Mono>Call transcript</Mono>
                    <ol className="mt-2 space-y-1 text-[13px]">
                      {transcript.map((l) => {
                        const on = !!activeSrc?.ref?.match(new RegExp(`line ${l.line}(\\b|$)`));
                        return (
                          <li
                            key={l.line}
                            data-on={on || undefined}
                            className={cn(
                              "flex gap-2 rounded-[6px] px-1.5 py-1 transition-colors duration-200",
                              on && hlCls,
                            )}
                          >
                            <span className="w-5 shrink-0 font-mono text-[11px] text-text-3">
                              {l.line}
                            </span>
                            <span
                              className={cn(
                                "w-16 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.06em]",
                                l.speaker === "customer" ? "text-foreground" : "text-text-2",
                              )}
                            >
                              {l.speaker}
                            </span>
                            <span className={cn(l.speaker === "system" && "text-text-2")}>
                              {humanize(l.text)}
                            </span>
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
                          <div
                            key={f.field}
                            data-on={on || undefined}
                            className={cn(
                              "flex justify-between gap-3 rounded-[6px] px-1.5 py-1.5 transition-colors duration-200",
                              on && hlCls,
                            )}
                          >
                            <dt className="text-text-2">
                              <span className="mr-2 font-mono text-[11px] text-text-3">
                                {f.field}
                              </span>
                              {f.label}
                            </dt>
                            <dd className="text-right">
                              {f.value === null ? <Unknown>empty</Unknown> : valueLabel(f.value)}
                            </dd>
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
                        <li
                          key={d.name}
                          data-on={on || undefined}
                          className={cn(
                            "flex items-center justify-between rounded-[6px] px-1.5 py-1 transition-colors duration-200",
                            on && hlCls,
                          )}
                        >
                          <span className="font-mono text-[12px]">{d.name}</span>
                          <span
                            className={cn(
                              "text-[12px]",
                              d.status === "missing" || d.status === "incomplete"
                                ? "text-wait"
                                : d.status === "unknown"
                                  ? ""
                                  : "text-text-2",
                            )}
                          >
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
                          <li
                            key={f.ref}
                            data-on={on || undefined}
                            className={cn(
                              "flex items-center justify-between gap-3 rounded-[6px] px-1.5 py-1 transition-colors duration-200",
                              on && hlCls,
                            )}
                          >
                            <span className="font-mono text-[12px]">{f.ref}</span>
                            <span className="text-right text-[12px] text-text-2">
                              {humanize(f.quote)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </Card>
            </div>
          )}
          {mainTab === "Customer" && (
            <CustomerChat
              caseId={caseId}
              customer={data.intake?.customer_name ?? null}
              plate={data.intake?.plate ?? null}
              quote={claim.quote_eur}
              version={version}
              rec={rec}
              queue={queue}
              closed={closed}
              needsUser={needsUser}
              missingFields={((decision?.missing_fields as string[] | undefined) ?? [])
                .concat(
                  live.checklist
                    .filter((c) => c.stage === "R2" && c.status === "fail")
                    .map((c) => c.field),
                )
                .filter((f, i, a) => a.indexOf(f) === i)}
              failedTrigger={
                live.checklist.find((c) => c.status === "fail" && c.stage === "R1")?.key ?? null
              }
              decisionId={(decision?.id as string | undefined) ?? null}
              reviewer={me.name}
              events={data.events as Row[]}
              claim={claim}
              policy={policy}
              initialTemplate={chatTpl}
              callSlot={
                closed ? null : (
                  <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
                    <button
                      type="button"
                      disabled={busy || !portalUrl}
                      onClick={() => void callCustomer()}
                      aria-label="Call customer"
                      title={portalUrl ? "Call the customer with Mia" : "No plate or email to reach the customer's claim page"}
                      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[oklch(0.62_0.17_150)] text-white shadow-sm transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                    >
                      <Phone className="size-5 fill-white" strokeWidth={1.5} />
                    </button>
                    <div className="min-w-0 text-[12.5px]">
                      <p className="font-medium">Or call {data.intake?.customer_name ?? "the customer"}</p>
                      <p className="text-text-2">
                        {portalUrl
                          ? `Mia (voice agent) calls them in their claim page${callTopics().length ? ` and asks about: ${callTopics().map((f) => (FIELD_LABELS[f] ?? f.replace(/_/g, " ")).toLowerCase()).join(", ")}` : ""}.`
                          : "No plate or email on file, so the claim page cannot ring."}
                      </p>
                      {portalUrl && (
                        <a href={portalUrl} target="_blank" rel="noreferrer" className="text-[11.5px] text-link hover:underline">
                          Open the customer's claim page (demo)
                        </a>
                      )}
                    </div>
                  </div>
                )
              }
              onRequestSent={() => {
                if (chatTpl) {
                  if (nextId) goTo(nextId);
                  else void navigate({ to: "/dashboard" });
                }
              }}
              className="mb-0"
            />
          )}
        </section>
        <aside className="card-quiet sticky top-[76px] flex h-[calc(100vh-148px)] min-h-[480px] flex-col overflow-hidden">
          <div
            role="tablist"
            aria-label="Case side panel"
            className="flex shrink-0 gap-4 border-b border-line px-4"
          >
            {["Tasks", "Files", "History"].map((tab) => (
              <Button
                key={tab}
                variant="ghost"
                role="tab"
                aria-selected={sideTab === tab}
                className={cn(
                  "h-11 rounded-none border-b-2 px-1 text-[12px]",
                  sideTab === tab ? "border-link text-link" : "border-transparent text-text-2",
                )}
                onClick={() => setSideTab(tab)}
              >
                {tab}
              </Button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {sideTab === "Tasks" && !tasks.length && (
              <p className="text-[12px] text-text-2">
                {closed
                  ? "Closed. No tasks."
                  : isWaiting
                    ? "Waiting on the customer. No tasks until they reply."
                    : "No checks flagged. Nothing to tick off."}
              </p>
            )}
            {sideTab === "Tasks" && (
              <ul className="space-y-5">
                {tasks.map((task) => (
                  <li key={task.key} className="flex gap-2.5">
                    <Checkbox
                      id={`task-${task.key}`}
                      checked={taskChecks.has(task.key)}
                      onCheckedChange={(on) =>
                        setTaskChecks((cur) => {
                          const n = new Set(cur);
                          if (on) n.add(task.key);
                          else n.delete(task.key);
                          return n;
                        })
                      }
                      className="mt-0.5"
                    />
                    <div>
                      <Label htmlFor={`task-${task.key}`} className="text-[12px] font-medium">
                        {task.label}
                      </Label>
                      <p className="mt-1 text-[11px] text-text-2">{task.note}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-6 rounded-md bg-surface-2 px-2 text-[10px] text-text-2"
                        onClick={() => {
                          setMainTab(task.tab);
                          setHover(triggers.find((c) => c.key === task.key)?.field ?? null);
                        }}
                      >
                        {task.tab} ↗
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {sideTab === "Files" && (
              <ul className="divide-y divide-line">
                {docs.length === 0 && <li className="text-text-2">No documents recorded.</li>}
                {docs.map((doc) => (
                  <li key={doc.name} className="flex items-start gap-2 py-3">
                    <FileText className="mt-0.5 size-4 shrink-0 text-text-3" />
                    <div className="min-w-0">
                      <p className="break-words font-mono text-[11px]">{doc.name}</p>
                      <p className="mt-1 text-[11px] text-text-2">
                        {doc.name.split(".").pop()?.toUpperCase()} ·{" "}
                        <span
                          className={
                            doc.status === "missing" || doc.status === "incomplete"
                              ? "text-wait"
                              : "text-text-2"
                          }
                        >
                          {doc.status}
                        </span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {sideTab === "History" && (
              <div>
                {" "}
                <div>
                  <h2 className="section-title mb-5">Timeline</h2>
                  {upcoming.length > 0 && (
                    <ol className="relative mb-2 ml-1.5 border-l border-dashed border-text-3/60">
                      {upcoming.map((u, i) => (
                        <li key={u} className="relative pb-4 pl-5">
                          <span
                            className={cn(
                              "absolute -left-[5px] top-1.5 size-2.5 rounded-full border-2 bg-surface",
                              i === 0 && needsUser ? "border-action-dot" : "border-text-3",
                            )}
                          />
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
                              <MessageSquare
                                className="mr-1.5 inline size-3.5 text-text-2"
                                strokeWidth={1.6}
                              />
                              “{e.body}”
                            </p>
                            <p className="label-mono mt-0.5 normal-case">
                              {fmtTime(e.created_at)} · {e.author}
                            </p>
                          </li>
                        );
                      const pl = (e.payload ?? {}) as Row;
                      return (
                        <li key={e.id} className="relative pb-4 pl-5 last:pb-0">
                          <span
                            className={cn(
                              "absolute -left-[4.5px] top-1.5 size-2 rounded-full",
                              HUMAN_EVENTS.has(e.type) &&
                                !/engine|system/i.test(String(e.actor ?? "system"))
                                ? "bg-ink"
                                : e.type === "escalated"
                                  ? "bg-action-dot"
                                  : "bg-text-3",
                            )}
                          />
                          <p className="text-[13px]">
                            {e.type === "received" && pl.channel === "csv_import"
                              ? "Imported from CSV"
                              : (EVENT_TEXT[e.type] ?? e.type.replace(/_/g, " "))}
                            {e.type === "policy_change" && pl.from_version && (
                              <span className="text-text-2">
                                {" "}
                                · {String(pl.from_version)}: {recLabel(pl.before)}{" "}
                                <ArrowRight className="inline size-3" /> {String(pl.to_version)}:{" "}
                                {recLabel(pl.after)}
                              </span>
                            )}
                            {e.type === "override" && pl.from && (
                              <span className="text-text-2">
                                {" "}
                                · {RECOMMENDATION_LABELS[pl.from as Recommendation] ?? pl.from}{" "}
                                <ArrowRight className="inline size-3" />{" "}
                                {RECOMMENDATION_LABELS[pl.to as Recommendation] ?? pl.to} ·{" "}
                                {reasonLabel(pl.reason_code)} · “{pl.reason_text}”
                              </span>
                            )}
                            {e.type === "triaged" && decision && (
                              <span className="text-text-2">
                                {" "}
                                · {recLabel(pl.recommendation ?? systemRec)} (
                                {String(pl.rule_id ?? decision.rule_id).toUpperCase()})
                              </span>
                            )}
                          </p>
                          <p className="label-mono mt-0.5 normal-case">
                            {fmtTime(e.created_at)} · {e.actor ?? "System"}
                            {pl.policy_version ? ` · policy ${pl.policy_version}` : ""}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </div>
                <div className="mt-5 border-t border-line pt-4">
                  <CommentBox disabled={busy} onPost={postComment} comments={comments} />
                </div>
              </div>
            )}
          </div>
          <div className="shrink-0 border-t border-line bg-surface p-4">
            {closed ? (
              <p className="flex items-start gap-2 text-[12px] text-text-2">
                <Lock className="size-4 shrink-0" />
                Closed – decision frozen under policy {version}
              </p>
            ) : (
              <DecisionPanel
                mode={
                  queue === "done" || confirmed
                    ? "done"
                    : isReview
                      ? "review"
                      : isCheck
                        ? "check"
                        : isWaiting
                          ? "waiting"
                          : "auto"
                }
                rec={rec}
                reason={
                  nearLimit ??
                  (triggers[0] ? humanize(triggers[0].note) : unknownChecks[0] ? humanize(unknownChecks[0].note) : null)
                }
                busy={busy}
                onAccept={() => openChat("accept")}
                onDeny={() => openChat("deny")}
                onRequest={() => openChat("request")}
                onReminder={() => openChat("reminder")}
                onConfirm={() => void confirm(true)}
                onOverride={() =>
                  setOverrideOpen(rec === "human_review" ? "routine_processing" : "human_review")
                }
              />
            )}
          </div>
        </aside>
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

// One place for the reviewer's decision. What it offers depends on why the case is here;
// "Ask customer for information" is always the last action (it opens the Customer tab:
// write an email or call the customer).
function DecisionPanel({
  mode,
  rec,
  reason,
  busy,
  onAccept,
  onDeny,
  onRequest,
  onReminder,
  onConfirm,
  onOverride,
}: {
  mode: "review" | "check" | "waiting" | "done" | "auto";
  rec: Recommendation;
  reason: string | null;
  busy: boolean;
  onAccept: () => void;
  onDeny: () => void;
  onRequest: () => void;
  onReminder: () => void;
  onConfirm: () => void;
  onOverride: () => void;
}) {
  const head = (title: string, sub: string | null) => (
    <>
      <Label className="block text-[12px]">{title}</Label>
      {sub && <p className="mb-3 mt-1 line-clamp-2 text-[11px] text-text-2">{sub}</p>}
    </>
  );
  const body =
    mode === "review" ? (
      <>
        {head("Your decision", reason ? `Flagged: ${reason}` : `Rules say: ${RECOMMENDATION_LABELS[rec]}`)}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={busy} onClick={onAccept} className="text-ok">
            <CircleCheck className="size-4" /> Accept claim
          </Button>
          <Button variant="outline" disabled={busy} onClick={onDeny} className="text-action">
            <CircleX className="size-4" /> Deny claim
          </Button>
        </div>
      </>
    ) : mode === "check" ? (
      <>
        {head("Quick double-check", reason ?? "Random QA sample")}
        <Button className="w-full" disabled={busy} onClick={onConfirm}>
          Looks right – confirm & next <Kbd dark>C</Kbd>
        </Button>
      </>
    ) : mode === "waiting" ? (
      <>
        {head("Waiting on customer", "A request was sent. The case is checked again automatically when they reply.")}
        <Button variant="outline" className="w-full" disabled={busy} onClick={onReminder}>
          <BellRing className="size-4" /> Send reminder
        </Button>
      </>
    ) : (
      head(
        mode === "done" ? "Reviewed" : "Auto-processed",
        mode === "done" ? "In normal claims handling. Nothing left to do here." : "No reviewer needed.",
      )
    );
  return (
    <>
      {body}
      <Button variant="outline" disabled={busy} onClick={onRequest} className="mt-2 w-full">
        <FileQuestion className="size-4" /> Ask customer for information
      </Button>
      <p className="mt-1.5 text-[10.5px] text-text-3">Opens the Customer tab: write an email or call. Nothing is sent before you confirm.</p>
      <button
        type="button"
        disabled={busy}
        onClick={onOverride}
        className="mt-3 w-full text-center text-[11px] text-text-2 underline-offset-4 hover:text-foreground hover:underline"
      >
        Rule got it wrong? Change recommendation <Kbd>O</Kbd>
      </button>
    </>
  );
}

function CommentBox({
  onPost,
  disabled,
  comments,
}: {
  onPost: (body: string) => Promise<unknown>;
  disabled: boolean;
  comments: Row[];
}) {
  const [body, setBody] = useState("");
  const post = async () => {
    if (body.trim().length < 2) return;
    await onPost(body.trim());
    setBody("");
  };
  const recent = [...comments].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">Comments</h2>
        <span className="label-mono">
          {comments.length ? `${comments.length} · cannot be edited` : "Cannot be edited"}
        </span>
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
            className="min-h-[96px] flex-1 bg-surface"
          />
          <div className="mt-3 flex items-center justify-end gap-3">
            <span className="text-[12px] text-text-3">⌘ + Enter to post</span>
            <Button
              variant="outline"
              disabled={disabled || body.trim().length < 2}
              onClick={() => void post()}
            >
              Post comment
            </Button>
          </div>
        </div>
      </div>
    </div>
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
                    next === r
                      ? "border-transparent bg-white shadow-[var(--shadow-lift)] ring-2 ring-link"
                      : "border-line bg-white/60 hover:bg-white",
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
            <Textarea
              id="reason-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Workshop confirmed the quote is €1,450, the scan was misread."
              className="min-h-[90px]"
            />
          </div>
          <p className="text-[12px] text-text-2">
            Recorded with reviewer <strong className="text-foreground">{reviewer}</strong>, policy{" "}
            <strong className="text-foreground">{version.toUpperCase()}</strong> and a timestamp.
            Cannot be edited afterwards.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!valid || busy}
              onClick={() => next && onSave(next, code, text.trim())}
            >
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

function Kbd({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <kbd
      className={cn(
        "ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] px-1 font-mono text-[10px] font-medium",
        dark ? "bg-white/15 text-white/80 ring-1 ring-white/25" : "bg-surface-2 text-text-2 ring-1 ring-line",
      )}
    >
      {children}
    </kbd>
  );
}
