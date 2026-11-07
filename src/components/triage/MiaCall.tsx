import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { VoiceOrb, type Phase } from "@/components/triage/VoiceOrb";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CUSTOMER_MISSING, FIELD_QUESTIONS, QUESTIONS, cleanAgentAnswers, type AnswerKey, type ReportAnswers } from "@/lib/report-intake";
import { addClaimInfo, endClaimCall } from "@/lib/report.functions";

// Incoming follow-up call in the customer portal: rings, then Mia (ElevenLabs agent) asks only for the
// open items. Answers are applied on the server and the claim is re-run through the active policy.

const FOLLOW_UP_AGENT_ID = "agent_4801m6vyrn5ter48ct7xkqmwmvy3";
type Line = { speaker: "agent" | "customer"; text: string };

function covered(field: string, a: Partial<ReportAnswers>) {
  if (field === "liability_disputed") return a.other_party === "no" || a.other_party === "unsure" || a.fault !== undefined;
  return (FIELD_QUESTIONS[field] ?? []).some((k) => a[k] !== undefined && a[k] !== "");
}

function nextAsk(field: string, a: Partial<ReportAnswers>) {
  const keys = FIELD_QUESTIONS[field] ?? [];
  const key: AnswerKey | undefined = field === "liability_disputed" ? (a.other_party === "yes" ? "fault" : "other_party") : keys[0];
  return QUESTIONS.find((q) => q.key === key)?.ask ?? CUSTOMER_MISSING[field] ?? field;
}

export function MiaCall({
  caseId,
  firstName,
  items,
  requestedAt,
  who,
  onFinished,
}: {
  caseId: string;
  firstName: string | null;
  /** Claim fields Mia should collect */
  items: string[];
  requestedAt: string;
  who: { email?: string; plate?: string };
  onFinished: (message: string | null) => void;
}) {
  const [inCall, setInCall] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const session = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const partial = useRef<Partial<ReportAnswers>>({});
  const linesRef = useRef<Line[]>([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const fields = items.filter((f) => FIELD_QUESTIONS[f]);

  // Two-tone ring while waiting
  useEffect(() => {
    if (inCall) return;
    let stop = () => undefined as void;
    try {
      const ctx = new AudioContext();
      const beep = () => {
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
      stop = () => {
        window.clearInterval(t);
        ctx.close().catch(() => undefined);
      };
    } catch {
      /* sound is optional */
    }
    return () => stop();
  }, [inCall, requestedAt]);

  const level = () => {
    const s = session.current;
    if (!inCall) return 0.4 + 0.3 * Math.sin(Date.now() / 160);
    try {
      return Math.min(1, (phaseRef.current === "speaking" ? s?.getOutputVolume?.() : s?.getInputVolume?.()) ?? 0);
    } catch {
      return 0;
    }
  };

  const finish = async () => {
    setPhase("thinking");
    let msg: string | null = null;
    try {
      if (Object.keys(partial.current).length) {
        const r = await addClaimInfo({ data: { case_id: caseId, ...who, answers: partial.current, via: "call", transcript: linesRef.current } });
        msg =
          r.recommendation === "routine_processing"
            ? "Thanks! Your claim is now complete and goes into processing."
            : r.recommendation === "human_review"
              ? "Thanks! We've added your answers; a claims specialist is looking at your claim."
              : "Thanks! A few points are still open; we'll get back to you.";
      } else {
        await endClaimCall({ data: { case_id: caseId, ...who, outcome: "no_answer_given" } });
      }
    } catch (e) {
      msg = (e as Error).message;
    }
    partial.current = {};
    setInCall(false);
    setPhase("idle");
    onFinished(msg);
  };

  const accept = async () => {
    setInCall(true);
    setLines([]);
    linesRef.current = [];
    partial.current = {};
    setPhase("thinking");
    const spoken = fields.map((f) => (CUSTOMER_MISSING[f] ?? f).toLowerCase());
    try {
      const url = "https://esm.sh/@elevenlabs/client";
      const mod: any = await import(/* @vite-ignore */ url); // eslint-disable-line @typescript-eslint/no-explicit-any
      session.current = await mod.Conversation.startSession({
        agentId: FOLLOW_UP_AGENT_ID,
        connectionType: "websocket",
        dynamicVariables: {
          customer_name: firstName ?? "there",
          case_id: caseId.replace(/-/g, " "),
          missing_items: spoken.join(", and ") || "a few details",
        },
        clientTools: {
          update_claim: async (params: Record<string, unknown>) => {
            partial.current = { ...partial.current, ...cleanAgentAnswers(params ?? {}) };
            const open = fields.filter((f) => !covered(f, partial.current));
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
          void finish();
        },
      });
    } catch {
      setInCall(false);
      setPhase("idle");
      onFinished("The call could not be connected. Please allow the microphone and try again.");
    }
  };

  const decline = async () => {
    await endClaimCall({ data: { case_id: caseId, ...who, outcome: "declined" } }).catch(() => undefined);
    onFinished(null);
  };

  const hangUp = () => {
    const s = session.current;
    session.current = null;
    s?.endSession?.();
    void finish();
  };

  return (
    <div className="card-quiet mt-6 flex flex-col items-center p-8 text-center ring-2 ring-link/30">
      <VoiceOrb phase={inCall ? phase : "speaking"} level={level} />
      <p className="mt-5 text-[18px] font-semibold">
        {inCall ? (phase === "speaking" ? "Mia is speaking…" : phase === "listening" ? "Listening…" : "Connecting…") : "Clearpath is calling you"}
      </p>
      <p className="mt-1 text-[13.5px] text-text-2">
        {inCall ? "Answer naturally. Say if you're not sure about something." : `Mia would like to complete your claim ${caseId}.`}
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
              <div className={cn("max-w-[80%] rounded-[12px] px-3.5 py-2 text-[13.5px]", l.speaker === "customer" ? "bg-link text-white" : "bg-surface-2 ring-1 ring-line")}>
                {l.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
