import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, Lock, X } from "lucide-react";
import { activePolicyQuery, caseDetailQuery } from "@/lib/data";
import { decide, FIELD_LABELS, POLICY_V1, type Claim, type Recommendation } from "@/lib/triage";
import { isClosed } from "@/lib/csv";
import { Card, Mono, StatusDot, Unknown, fmtTime } from "@/components/triage/ui";
import { cn } from "@/lib/utils";
import type { TranscriptLine, FormField, IntakeDocument } from "@/lib/intake";

export const Route = createFileRoute("/_authenticated/claims/$caseId")({
  head: ({ params }) => ({ meta: [{ title: `${params.caseId} — Triage` }, { name: "description", content: `Case ${params.caseId}: recommendation, checklist and sources.` }] }),
  component: CaseDetail,
});

const HUMAN_EVENTS = new Set(["confirmed", "override", "comment", "call_logged"]);

function CaseDetail() {
  const { caseId } = Route.useParams();
  const { data, isLoading } = useQuery(caseDetailQuery(caseId));
  const policyQ = useQuery(activePolicyQuery);
  const [hl, setHl] = useState<string | null>(null);

  if (isLoading) return <p className="label-mono">Loading</p>;
  if (!data?.claim) return <p className="text-text-2">Case not found.</p>;

  const claim = data.claim as unknown as Claim;
  const closed = isClosed(claim.case_status);
  const policy = policyQ.data ?? POLICY_V1;
  const live = decide(claim, policy);
  const rec = (data.decision?.recommendation ?? live.recommendation) as Recommendation;
  const needsUser = !closed && (data.workflow?.queue === "on_you" || data.workflow?.qa_sample);
  const tone = !needsUser ? "" : rec === "request_information" ? "tint-wait" : rec === "human_review" ? "tint-action" : "";

  const transcript = (data.intake?.transcript as unknown as TranscriptLine[] | null) ?? null;
  const form = (data.intake?.form as unknown as FormField[] | null) ?? null;
  const docs = (data.intake?.documents as unknown as IntakeDocument[] | null) ?? [];
  const facts = data.facts;
  const refOf = (f: string) => facts.find((x) => x.field === f);

  return (
    <div>
      <Link to="/claims" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-text-2 hover:text-foreground">
        <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to my queue
      </Link>

      <div className={cn("card-quiet mb-6 p-6", tone)}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <Mono className={cn(tone && "text-current")}>{caseId} · {data.intake?.customer_name} · {data.intake?.plate}</Mono>
            <div className="mt-3 text-[24px] font-semibold tracking-tight">
              <StatusDot rec={rec} closed={closed} />
            </div>
            <p className={cn("mt-2 max-w-xl", tone ? "text-current" : "text-text-2")}>{data.decision?.explanation}</p>
            <p className="mt-1 text-[13px] text-text-2">{claim.claim_summary}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
            {[
              ["Rule", data.decision?.rule_id?.toUpperCase()],
              ["Policy", data.decision?.policy_version?.toUpperCase()],
              ["Received", fmtTime(data.claim.received_at)],
              ["Assignee", data.workflow?.assignee ?? "Unassigned"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className={cn("label-mono", tone && "text-current opacity-80")}>{k}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        {closed && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-text-2">
            <Lock className="size-3.5" strokeWidth={1.5} /> Closed. This decision is frozen.
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Card>
            <h2 className="section-title mb-4">Checklist</h2>
            <ul className="divide-y divide-line">
              {live.checklist.map((c) => {
                const src = refOf(c.field);
                return (
                  <li key={c.key}>
                    <button
                      onClick={() => setHl(c.field)}
                      className={cn("flex w-full items-center gap-3 py-2.5 text-left", hl === c.field && "bg-surface-2")}
                    >
                      <span
                        className={cn(
                          "inline-flex size-5 items-center justify-center rounded-full",
                          c.status === "pass" && "text-text-3",
                          c.status === "fail" && (c.stage === "R1" ? "text-action" : "text-wait"),
                          c.status === "unknown" && "border border-dashed border-text-3 text-text-2",
                        )}
                      >
                        {c.status === "pass" ? <Check className="size-4" strokeWidth={1.5} /> : c.status === "fail" ? <X className="size-4" strokeWidth={2} /> : <span className="text-[11px]">?</span>}
                      </span>
                      <span className={cn("flex-1", c.status === "fail" && "font-semibold", c.status === "pass" && "text-text-2")}>{c.note}</span>
                      {src && <span className="label-mono">{src.ref}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 border-t border-line pt-4 text-[13px] text-text-2">
              <Mono className="mr-2">What would have to change?</Mono>
              {live.counterfactual}
            </p>
          </Card>

          <Card>
            <h2 className="section-title mb-4">Timeline</h2>
            <ol className="relative ml-1.5 border-l border-line">
              {data.events.map((e) => (
                <li key={e.id} className="relative pb-4 pl-5 last:pb-0">
                  <span className={cn("absolute -left-[4.5px] top-1.5 size-2 rounded-full", HUMAN_EVENTS.has(e.type) ? "bg-ink" : e.type === "escalated" ? "bg-action-dot" : "bg-text-3")} />
                  <p className="text-[13px] capitalize">{e.type.replace(/_/g, " ")}</p>
                  <p className="label-mono mt-0.5 normal-case">{fmtTime(e.created_at)} · {e.actor}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <Card className="h-fit">
          <h2 className="section-title mb-1">Sources</h2>
          <p className="mb-4 text-[12px] text-text-2">Click a checklist item to see where the fact came from.</p>
          {hl && refOf(hl) && (
            <div className="mb-4 rounded-md border border-line bg-surface-2 p-3 text-[13px]">
              <Mono>{FIELD_LABELS[hl] ?? hl} · {refOf(hl)!.source_type} · {refOf(hl)!.ref}</Mono>
              <p className="mt-1">“{refOf(hl)!.quote}”</p>
              {refOf(hl)!.confidence === "unconfirmed" && <p className="mt-1"><Unknown>unconfirmed</Unknown></p>}
            </div>
          )}
          {transcript && (
            <div className="mb-5">
              <Mono>Call transcript</Mono>
              <ol className="mt-2 space-y-1 text-[13px]">
                {transcript.map((l) => {
                  const active = hl && refOf(hl)?.ref?.includes(`line ${l.line}`) && refOf(hl)?.ref?.match(new RegExp(`line ${l.line}(\\b|$)`));
                  return (
                    <li key={l.line} className={cn("flex gap-2 rounded px-1.5 py-1", active && "bg-wait-tint")}>
                      <span className="w-5 shrink-0 font-mono text-[11px] text-text-3">{l.line}</span>
                      <span className={cn("w-16 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.06em]", l.speaker === "customer" ? "text-foreground" : "text-text-2")}>{l.speaker}</span>
                      <span className={cn(l.speaker === "system" && "text-text-2")}>{l.text}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          {form && (
            <div className="mb-5">
              <Mono>Online form</Mono>
              <dl className="mt-2 divide-y divide-line text-[13px]">
                {form.map((f) => {
                  const active = hl && refOf(hl)?.ref === `field ${f.field}`;
                  return (
                    <div key={f.field} className={cn("flex justify-between gap-3 px-1.5 py-1.5", active && "bg-wait-tint")}>
                      <dt className="text-text-2"><span className="mr-2 font-mono text-[11px] text-text-3">{f.field}</span>{f.label}</dt>
                      <dd className="text-right">{f.value ?? <Unknown>empty</Unknown>}</dd>
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
                const active = hl && refOf(hl)?.ref === d.name;
                return (
                  <li key={d.name} className={cn("flex items-center justify-between rounded px-1.5 py-1", active && "bg-wait-tint")}>
                    <span className="font-mono text-[12px]">{d.name}</span>
                    <span className={cn("text-[12px]", d.status === "missing" || d.status === "incomplete" ? "text-wait" : d.status === "unknown" ? "" : "text-text-2")}>
                      {d.status === "unknown" ? <Unknown /> : d.note}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
