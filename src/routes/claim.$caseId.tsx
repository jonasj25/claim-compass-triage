import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, Lock, Phone, PhoneOff } from "lucide-react";
import { Logo } from "@/components/triage/Logo";
import { VoiceOrb, type Phase } from "@/components/triage/VoiceOrb";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CUSTOMER_MISSING, FIELD_QUESTIONS, QUESTIONS, cleanAgentAnswers, type AnswerKey, type ReportAnswers } from "@/lib/report-intake";
import { addClaimInfo, endClaimCall, getClaimStatus, type ClaimStatus } from "@/lib/report.functions";

// Public customer claim page. Shows where the claim stands and rings when a reviewer starts a follow-up call:
// Mia (ElevenLabs voice agent) asks only for the missing items, then the claim is checked again by the rules.
export const Route = createFileRoute("/claim/$caseId")({
  validateSearch: (s: Record<string, unknown>) => ({ e: typeof s.e === "string" ? s.e : "" }),
  head: ({ params }) => ({
    meta: [
      { title: `Your claim ${params.caseId} — Clearpath` },
      { name: "description", content: "Status of your motor claim." },
      { property: "og:title", content: "Your claim — Clearpath" },
      { property: "og:description", content: "Status of your motor claim." },
    ],
  }),
  component: ClaimPortal,
});

// Public ElevenLabs agent "Clearpath – Mia, follow-up call" (no API key needed in the browser)
const FOLLOW_UP_AGENT_ID = "agent_4801m6vyrn5ter48ct7xkqmwmvy3";

type Line = { speaker: "agent" | "customer"; text: string };

/** Is this missing claim field answered (or marked "not sure") by what the customer said on the call? */
function covered(field: string, a: Partial<ReportAnswers>) {
  if (field === "liability_disputed") return a.other_party === "no" || a.other_party === "unsure" || a.fault !== undefined;
  return (FIELD_QUESTIONS[field] ?? []).some((k) => a[k] !== undefined && a[k] !== "");
}

function nextAsk(field: string, a: Partial<ReportAnswers>) {
  const keys = FIELD_QUESTIONS[field] ?? [];
  const key: AnswerKey | undefined = field === "liability_disputed" ? (a.other_party === "yes" ? "fault" : "other_party") : keys[0];
  return QUESTIONS.find((q) => q.key === key)?.ask ?? CUSTOMER_MISSING[field] ?? field;
}

function ClaimPortal() {
  const { caseId } = Route.useParams();
  const { e: email } = Route.useSearch();
  const [status, setStatus] = useState<ClaimStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [inCall, setInCall] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const session = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const partial = useRef<Partial<ReportAnswers>>({});
  const linesRef = useRef<Line[]>([]);
  const ring = useRef<{ stop: () => void } | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const load = async () => {
    try {
      setStatus(await getClaimStatus({ data: { case_id: caseId, email } }));
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Claim not found");
    }
  };

  // Poll so the page notices when a reviewer starts a call
  useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      if (!session.current) void load();
    }, 3000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, email]);

  const incoming = status?.incoming_call && status.incoming_call.requested_at !== dismissed && !inCall ? status.incoming_call : null;

  // Simple two-tone ring while a call is waiting
  useEffect(() => {
    if (!incoming) {
      ring.current?.stop();
      ring.current = null;
      return;
    }
    try {
      const ctx = new AudioContext();
      let alive = true;
      const beep = () => {
        if (!alive) return;
        for (const [f, at] of [[440, 0], [480, 0], [440, 0.45], [480, 0.45]] as const) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = f;
          g.gain.setValueAtTime(0.05, ctx.currentTime + at);
          g.gain.setValueAtTime(0, ctx.currentTime + at + 0.35);
          o.connect(g).connect(ctx.destination);
          o.start(ctx.currentTime + at);
          o.stop(ctx.currentTime + at + 0.36);
        }
      };
      beep();
      const t = window.setInterval(beep, 2500);
      ring.current = {
        stop: () => {
          alive = false;
          window.clearInterval(t);
          ctx.close().catch(() => undefined);
        },
      };
    } catch {
      /* sound is optional */
    }
    return () => {
      ring.current?.stop();
      ring.current = null;
    };
  }, [incoming?.requested_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const missingFields = (status?.missing_fields ?? []).filter((f) => FIELD_QUESTIONS[f]);
  const levelOf = () => {
    const s = session.current;
    try {
      return Math.min(1, (phaseRef.current === "speaking" ? s?.getOutputVolume?.() : s?.getInputVolume?.()) ?? 0);
    } catch {
      return 0;
    }
  };

  const finishCall = async () => {
    const answered = Object.keys(partial.current).length > 0;
    setPhase("thinking");
    try {
      if (answered) {
        const r = await addClaimInfo({ data: { case_id: caseId, email, answers: partial.current, via: "call", transcript: linesRef.current } });
        setNotice(
          r.recommendation === "routine_processing"
            ? "Thanks! Your claim is now complete and goes straight into processing."
            : r.recommendation === "human_review"
              ? "Thanks! A claims specialist will now look at your claim."
              : "Thanks! A few points are still open; we'll get back to you.",
        );
      } else {
        await endClaimCall({ data: { case_id: caseId, email, outcome: "no_answer_given" } });
      }
    } catch (e) {
      setNotice((e as Error).message);
    }
    setInCall(false);
    setPhase("idle");
    partial.current = {};
    await load();
  };

  const accept = async () => {
    if (!status?.incoming_call) return;
    ring.current?.stop();
    setDismissed(status.incoming_call.requested_at);
    setInCall(true);
    setLines([]);
    linesRef.current = [];
    partial.current = {};
    setNotice(null);
    setPhase("thinking");
    const items = missingFields.map((f) => (CUSTOMER_MISSING[f] ?? f).toLowerCase());
    try {
      const url = "https://esm.sh/@elevenlabs/client";
      const mod: any = await import(/* @vite-ignore */ url); // eslint-disable-line @typescript-eslint/no-explicit-any
      session.current = await mod.Conversation.startSession({
        agentId: FOLLOW_UP_AGENT_ID,
        connectionType: "websocket",
        dynamicVariables: {
          customer_name: (status.name ?? "there").split(" ")[0],
          case_id: caseId.replace(/-/g, " "),
          missing_items: items.join(", and ") || "a few details",
        },
        clientTools: {
          update_claim: async (params: Record<string, unknown>) => {
            partial.current = { ...partial.current, ...cleanAgentAnswers(params ?? {}) };
            const open = missingFields.filter((f) => !covered(f, partial.current));
            if (!open.length) return "Saved. Nothing is missing. Say goodbye and end the call.";
            return `Saved. Still missing: ${open.map((f) => CUSTOMER_MISSING[f] ?? f).join(", ")}. Ask next: "${nextAsk(open[0], partial.current)}"`;
          },
        },
        onMessage: (m: { message?: string; source?: string; role?: string }) => {
          const text = String(m?.message ?? "").trim();
          if (!text) return;
          const line: Line = { speaker: m?.source === "user" || m?.role === "user" ? "customer" : "agent", text };
          linesRef.current = [...linesRef.current, line];
          setLines(linesRef.current);
        },
        onModeChange: (m: { mode?: string }) => setPhase(m?.mode === "speaking" ? "speaking" : "listening"),
        onDisconnect: () => {
          session.current = null;
          void finishCall();
        },
      });
    } catch {
      setNotice("The call could not be connected. Please check that your microphone is allowed and try again.");
      setInCall(false);
      setPhase("idle");
    }
  };

  const decline = async () => {
    if (!status?.incoming_call) return;
    ring.current?.stop();
    setDismissed(status.incoming_call.requested_at);
    await endClaimCall({ data: { case_id: caseId, email, outcome: "declined" } }).catch(() => undefined);
    await load();
  };

  const hangUp = () => {
    const s = session.current;
    session.current = null;
    s?.endSession?.();
    void finishCall();
  };

  const view =
    !status?.recommendation
      ? null
      : status.recommendation === "routine_processing"
        ? { label: "Complete", tone: "ok", title: "Your claim is complete", text: "Everything we need is there. Your claim is in processing; this is not yet a payment approval." }
        : status.recommendation === "request_information"
          ? { label: "Waiting for information", tone: "wait", title: "We need a little more", text: "To continue, we still need the points below. Mia may call you here to collect them." }
          : { label: "With a specialist", tone: "action", title: "A claims specialist is looking at it", text: "Some points need a person to check them. We'll get back to you." };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[1080px] items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight">Clearpath</span>
            <span className="label-mono mt-1 text-[9.5px]">Your claim</span>
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-[12.5px] text-text-2">
          <Lock className="size-3.5" /> Only visible with your link
        </span>
      </header>

      <main className="mx-auto max-w-[720px] px-6 pb-16 pt-6">
        {error && <p className="card-quiet p-6 text-[14px] text-text-2">{error}. Please use the link from your confirmation.</p>}

        {status && (
          <>
            <p className="label-mono">Claim {status.case_id}</p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.02em]">Hello {status.name?.split(" ")[0] ?? "there"}, here's where your claim stands.</h1>
            {status.summary && <p className="mt-2 text-[14px] text-text-2">“{status.summary}”</p>}

            {notice && <p className="mt-5 rounded-[10px] bg-link/10 px-4 py-2.5 text-[14px]">{notice}</p>}

            {(incoming || inCall) && (
              <div className="card-quiet mt-6 flex flex-col items-center p-8 text-center ring-2 ring-link/30">
                <VoiceOrb phase={inCall ? phase : "speaking"} level={inCall ? levelOf : () => 0.4 + 0.3 * Math.sin(Date.now() / 160)} />
                <p className="mt-5 text-[18px] font-semibold">{inCall ? (phase === "speaking" ? "Mia is speaking…" : phase === "listening" ? "Listening…" : "Connecting…") : "Clearpath is calling you"}</p>
                <p className="mt-1 text-[13.5px] text-text-2">
                  {inCall ? "Answer naturally. Say if you're not sure about something." : `Mia from Clearpath would like to complete your claim ${status.case_id}.`}
                </p>
                <div className="mt-5 flex gap-3">
                  {inCall ? (
                    <Button onClick={hangUp} className="h-11 rounded-full bg-action px-6 hover:bg-action/90">
                      <PhoneOff /> Hang up
                    </Button>
                  ) : (
                    <>
                      <Button onClick={() => void decline()} variant="outline" className="h-11 rounded-full px-6">
                        <PhoneOff /> Decline
                      </Button>
                      <Button onClick={() => void accept()} className="h-11 rounded-full bg-ok px-6 text-white hover:bg-ok/90">
                        <Phone /> Accept call
                      </Button>
                    </>
                  )}
                </div>
                {lines.length > 0 && (
                  <div className="mt-6 max-h-[260px] w-full space-y-2 overflow-y-auto text-left">
                    {lines.map((l, i) => (
                      <div key={i} className={cn("flex", l.speaker === "customer" ? "justify-end" : "justify-start")}>
                        <div className={cn("max-w-[80%] rounded-[12px] px-3.5 py-2 text-[13.5px]", l.speaker === "customer" ? "bg-link text-white" : "bg-surface-2 ring-1 ring-line")}>{l.text}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view && (
              <div className="card-quiet mt-6 p-6">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", view.tone === "ok" ? "bg-ok-dot" : view.tone === "wait" ? "bg-wait-dot" : "bg-action-dot")} />
                  <span className="label-mono">{view.label}</span>
                </div>
                <p className="mt-2 text-[18px] font-semibold">{view.title}</p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-text-2">{view.text}</p>
                {status.recommendation === "request_information" && status.missing_fields.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {status.missing_fields.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[14px]">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-wait-dot" /> {CUSTOMER_MISSING[f] ?? f}
                      </li>
                    ))}
                  </ul>
                )}
                {status.recommendation === "routine_processing" && (
                  <p className="mt-4 flex items-center gap-2 text-[14px] text-ok">
                    <Check className="size-4" /> Nothing missing
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
