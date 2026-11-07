import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, Keyboard, Lock, Mic, Paperclip, Search, Send, Volume2, VolumeX } from "lucide-react";
import { Logo } from "@/components/triage/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { RECOMMENDATION_LABELS } from "@/lib/triage";
import {
  activeQuestions,
  answerLabel,
  EMPTY_ANSWERS,
  extractFromUtterance,
  fieldState,
  interpretReply,
  parseEuro,
  FIELD_QUESTIONS,
  QUESTIONS,
  CUSTOMER_MISSING,
  cleanAgentAnswers,
  toCsvRow,
  type AnswerKey,
  type Question,
  type ReportAnswers,
} from "@/lib/report-intake";
import { addClaimInfo, submitClaimReport, type ReportResult } from "@/lib/report.functions";
import { speakText, transcribeAudio, voiceStatus } from "@/lib/voice.functions";
import { VoiceOrb, type Phase } from "@/components/triage/VoiceOrb";

// Public page (no sign-in): a customer reports a motor claim, by form or by voice.
// What they say only fills answers they confirm; the recommendation comes from the rules engine on submit.
export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Report a motor claim — Clearpath" },
      { name: "description", content: "Report damage to your car in about three minutes, by form or by voice." },
      { property: "og:title", content: "Report a motor claim — Clearpath" },
      { property: "og:description", content: "Report damage to your car in about three minutes, by form or by voice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportPage,
});

type Mode = "start" | "form" | "review" | "done";
type Line = { speaker: "agent" | "customer"; text: string };


const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function canContinue(q: Question, a: ReportAnswers) {
  const v = String(a[q.key] ?? "").trim();
  if (q.optional) return true;
  if (!v) return false;
  if (q.type === "email") return emailOk(v);
  return true;
}

function ReportPage() {
  const [mode, setMode] = useState<Mode>("start");
  const [answers, setAnswers] = useState<ReportAnswers>(EMPTY_ANSWERS);
  const [step, setStep] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [heardIn, setHeardIn] = useState<Partial<Record<AnswerKey, number>>>({});
  const [files, setFiles] = useState<{ incident_report?: string; quote?: string }>({});
  const [result, setResult] = useState<ReportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channel = useRef<"online_form" | "phone">("online_form");

  const qs = useMemo(() => activeQuestions(answers), [answers]);
  const set = (k: AnswerKey, v: string) => setAnswers((a) => ({ ...a, [k]: v }));

  // Latest values for callbacks that fire later (voice agent, timers)
  const latest = useRef({ answers, lines, heardIn, files });
  latest.current = { answers, lines, heardIn, files };
  const submitting = useRef(false);

  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const cur = latest.current;
      const res = await submitClaimReport({ data: { channel: channel.current, answers: cur.answers, transcript: cur.lines, heardIn: cur.heardIn, files: cur.files } });
      setResult(res);
      setMode("done");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message || "Something went wrong. Please try again.");
      setMode("review");
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  };

  /** Every point is answered or marked "not sure": create the claim file right away (review only if basics are missing). */
  const completeAndSubmit = () => {
    const a = latest.current.answers;
    const basicsOk = activeQuestions(a).every((q) => canContinue(q, a));
    if (basicsOk) void submit();
    else setMode("review");
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-5">
        <Link to="/" aria-label="Clearpath: go to the login page" className="flex items-center gap-2.5 text-left">
          <Logo />
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight">Clearpath</span>
            <span className="label-mono mt-1 text-[9.5px]">Motor claims</span>
          </span>
        </Link>
        <span className="flex items-center gap-4 text-[12.5px] text-text-2">
          <span className="hidden items-center gap-1.5 sm:flex">
            <Lock className="size-3.5" /> Your answers are sent securely
          </span>
          <Link
            to="/status"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-[14px] font-medium text-background transition hover:opacity-90"
          >
            <Search className="size-4" /> Check claim status
          </Link>
        </span>
      </header>

      <main className="mx-auto max-w-[1180px] px-6 pb-16">
        {mode === "start" && (
          <Landing
            qs={qs}
            answers={answers}
            heardIn={heardIn}
            conversation={
              <Conversation
                answers={answers}
                setAnswers={setAnswers}
                lines={lines}
                setLines={setLines}
                setHeardIn={setHeardIn}
                onStart={() => {
                  channel.current = "phone";
                }}
                onDone={() => {
                  channel.current = "phone";
                  setMode("review");
                }}
                onComplete={() => {
                  channel.current = "phone";
                  completeAndSubmit();
                }}
              />
            }
            onForm={() => {
              channel.current = "online_form";
              setStep(0);
              setMode("form");
            }}
          />
        )}

        {mode === "form" && (
          <Shell side={<Checklist qs={qs} answers={answers} heardIn={{}} onJump={(i) => setStep(i)} current={qs[step]?.key} />}>
            <FormStep
              q={qs[Math.min(step, qs.length - 1)]}
              index={Math.min(step, qs.length - 1)}
              total={qs.length}
              answers={answers}
              set={set}
              onBack={() => (step === 0 ? setMode("start") : setStep((s) => s - 1))}
              onNext={() => (step >= qs.length - 1 ? completeAndSubmit() : setStep((s) => s + 1))}
            />
          </Shell>
        )}

        {mode === "review" && (
          <Review
            qs={qs}
            answers={answers}
            set={set}
            heardIn={heardIn}
            voice={channel.current === "phone"}
            files={files}
            setFiles={setFiles}
            busy={busy}
            error={error}
            onBack={() => setMode(channel.current === "phone" ? "start" : "form")}
            onSubmit={submit}
          />
        )}

        {busy && mode !== "review" && mode !== "done" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="card-quiet px-6 py-5 text-center">
              <p className="section-title">Creating your claim…</p>
              <p className="mt-1 text-[13px] text-text-2">Checking it against our rules.</p>
            </div>
          </div>
        )}
        {mode === "done" && result && <Done result={result} setResult={setResult} name={answers.name} email={answers.email} plate={answers.plate ?? ""} />}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ landing: the conversation is the page

function Landing({ qs, answers, heardIn, conversation, onForm }: { qs: Question[]; answers: ReportAnswers; heardIn: Partial<Record<AnswerKey, number>>; conversation: ReactNode; onForm: () => void }) {
  const started = qs.some((q) => fieldState(q, answers) !== "missing");
  return (
    <div className="pt-6">
      <div className="mx-auto max-w-[720px] text-center">
        <p className="label-mono">Report a claim</p>
        <h1 className="mt-3 text-[40px] font-semibold leading-[1.08] tracking-[-0.02em]">Damage to your car? Just tell us.</h1>
        <p className="mx-auto mt-4 max-w-[560px] text-[16px] leading-relaxed text-text-2">
          Our assistant asks a few short questions and records your claim in about three minutes. Not sure about something? Just say so. We never guess.
        </p>
      </div>

      <div className={cn("mx-auto mt-10 grid gap-6", started ? "max-w-[1120px] lg:grid-cols-[minmax(0,1fr)_320px]" : "max-w-[760px]")}>
        <div className="min-w-0">{conversation}</div>
        {started && (
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <Checklist qs={qs} answers={answers} heardIn={heardIn} />
          </aside>
        )}
      </div>

      <div className="mx-auto mt-6 max-w-[760px] text-center">
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={onForm}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-surface px-6 text-[15px] font-medium ring-1 ring-line shadow-sm transition hover:ring-link/50"
          >
            <Keyboard className="size-4" /> Prefer writing? Fill in the form <ArrowRight className="size-4" />
          </button>
          <Link
            to="/status"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-surface px-6 text-[15px] font-medium ring-1 ring-line shadow-sm transition hover:ring-link/50"
          >
            <Search className="size-4" /> Already reported? Check status
          </Link>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-[760px]">
        <p className="label-mono text-center">Good to have at hand</p>
        <ul className="mt-3 flex flex-wrap justify-center gap-2 text-[13px] text-text-2">
          {["Policy number", "Number plate", "Repair quote, ideally itemized", "Incident or police report"].map((t) => (
            <li key={t} className="rounded-full border border-line bg-surface px-3 py-1">
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


// ------------------------------------------------------------------ layout + checklist

function Shell({ children, side }: { children: ReactNode; side: ReactNode }) {
  return (
    <div className="grid gap-6 pt-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">{children}</div>
      <aside className="lg:sticky lg:top-6 lg:self-start">{side}</aside>
    </div>
  );
}

function Checklist({ qs, answers, heardIn, onJump, current }: { qs: Question[]; answers: ReportAnswers; heardIn: Partial<Record<AnswerKey, number>>; onJump?: (i: number) => void; current?: AnswerKey }) {
  const done = qs.filter((q) => fieldState(q, answers) !== "missing").length;
  return (
    <div className="card-quiet p-5">
      <div className="flex items-baseline justify-between">
        <p className="section-title">Your claim</p>
        <span className="label-mono">
          {done} / {qs.length}
        </span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
        <div className="h-full rounded-full bg-link transition-[width] duration-300" style={{ width: `${(done / qs.length) * 100}%` }} />
      </div>
      <ul className="mt-4 space-y-0.5">
        {qs.map((q, i) => {
          const s = fieldState(q, answers);
          const label = answerLabel(q, answers);
          const Row = onJump ? "button" : "div";
          return (
            <li key={q.key}>
              <Row
                {...(onJump ? { onClick: () => onJump(i), type: "button" as const } : {})}
                className={cn("flex w-full items-start gap-2.5 rounded-[8px] px-2 py-1.5 text-left", onJump && "hover:bg-surface-2", current === q.key && "bg-surface-2")}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
                    s === "answered" && "bg-link text-white",
                    s === "unsure" && "border border-dashed border-text-3",
                    s === "missing" && "border border-line bg-surface",
                  )}
                >
                  {s === "answered" && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[13px]", s === "missing" ? "text-text-2" : "font-medium")}>{q.label}</span>
                  {s === "answered" && <span className="block truncate text-[12px] text-text-2">{label}</span>}
                  {s === "unsure" && <span className="block text-[12px] text-text-3">Not sure yet, that's fine</span>}
                </span>
                {heardIn[q.key] && s !== "missing" && <span className="label-mono mt-0.5 text-[9.5px] text-link">Heard</span>}
              </Row>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ form (one question at a time)

function FormStep({ q, index, total, answers, set, onBack, onNext }: { q: Question; index: number; total: number; answers: ReportAnswers; set: (k: AnswerKey, v: string) => void; onBack: () => void; onNext: () => void }) {
  const value = String(answers[q.key] ?? "");
  const ok = canContinue(q, answers);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, [q.key]);

  const choose = (v: string) => {
    set(q.key, v);
    window.setTimeout(onNext, 180);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (q.type === "choice" && q.choices && /^[a-d]$/i.test(e.key) && tag !== "INPUT" && tag !== "TEXTAREA") {
        const c = q.choices["abcd".indexOf(e.key.toLowerCase())];
        if (c) choose(c.value);
      }
      if (e.key === "Enter" && !e.shiftKey && ok && tag !== "TEXTAREA") {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.key, ok]);

  return (
    <div className="card-quiet flex min-h-[460px] flex-col p-8 md:p-10">
      <div className="h-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-link transition-[width] duration-300" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
      <p className="label-mono mt-8">
        Question {index + 1} of {total}
      </p>
      <h2 key={q.key} className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.01em]">
        {q.ask}
      </h2>
      {q.hint && <p className="mt-2 text-[14px] text-text-2">{q.hint}</p>}

      <div className="mt-7 max-w-[560px]">
        {q.type === "choice" && q.choices && (
          <div className="grid gap-2">
            {q.choices.map((c, i) => (
              <button
                key={c.value}
                type="button"
                onClick={() => choose(c.value)}
                className={cn(
                  "flex items-center gap-3 rounded-[10px] border px-4 py-3 text-left text-[15px] transition-colors",
                  value === c.value ? "border-link bg-link/10 font-medium" : "border-line bg-surface hover:border-link/40",
                )}
              >
                <span className={cn("flex size-6 items-center justify-center rounded-[6px] border font-mono text-[11px]", value === c.value ? "border-link bg-link text-white" : "border-line text-text-2")}>
                  {"ABCD"[i]}
                </span>
                {c.label}
              </button>
            ))}
          </div>
        )}
        {q.type === "textarea" && (
          <Textarea ref={inputRef} value={value} onChange={(e) => set(q.key, e.target.value)} placeholder="e.g. I reversed into a pole in a car park and dented the rear bumper." className="min-h-[130px] bg-surface text-[15px]" />
        )}
        {(q.type === "text" || q.type === "email" || q.type === "date" || q.type === "money") && (
          <div className="relative">
            {q.type === "money" && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-text-2">€</span>}
            <Input
              ref={inputRef}
              type={q.type === "email" ? "email" : q.type === "date" ? "date" : "text"}
              inputMode={q.type === "money" ? "decimal" : undefined}
              value={value}
              max={q.type === "date" ? new Date().toISOString().slice(0, 10) : undefined}
              onChange={(e) => set(q.key, e.target.value)}
              placeholder={q.key === "plate" ? "e.g. M AB 1234" : q.key === "policy_number" ? "e.g. POL-482913" : q.type === "money" ? "1,450" : ""}
              className={cn("h-12 bg-surface text-[16px]", q.type === "money" && "pl-8")}
            />
          </div>
        )}
        {q.type === "email" && value && !emailOk(value) && <p className="mt-2 text-[13px] text-action">Please check the email address.</p>}
      </div>

      <div className="mt-auto flex items-center justify-between pt-10">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
        <div className="flex items-center gap-3">
          {q.type !== "choice" && <span className="hidden text-[12px] text-text-3 sm:inline">press Enter ↵</span>}
          <Button onClick={onNext} disabled={!ok}>
            {index === total - 1 ? "Check my answers" : q.optional && !value ? "Skip" : "Continue"} <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ voice

// ------------------------------------------------------------------ conversation (ElevenLabs voice, browser fallback)

/* eslint-disable @typescript-eslint/no-explicit-any */
const AGENT_NAME = "Mia";
// Public ElevenLabs Conversational AI agent "Clearpath – Mia, claims intake" (no API key needed in the browser).
// It records answers through the client tool update_claim; our page decides what is still missing.
const ELEVEN_AGENT_ID = "agent_1601m6vwfayef1dtqx31hd971xtr";

const getRecognition = (): any => {
  if (typeof window === "undefined") return null;
  const R = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  return R ? new R() : null;
};

const blobToBase64 = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

/** Records one spoken answer: starts on voice, stops after ~1.3 s of silence (or 25 s). */
function recordAnswer(stream: MediaStream, analyser: AnalyserNode, stopRef: { current: boolean }): Promise<{ blob: Blob; mime: string } | null> {
  return new Promise((resolve) => {
    const mime = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/mp4";
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const buf = new Uint8Array(analyser.fftSize);
    const t0 = Date.now();
    let spokeAt = 0;
    let lastVoice = 0;
    let done = false;
    const finish = (keep: boolean) => {
      if (done) return;
      done = true;
      window.clearInterval(timer);
      rec.onstop = () => resolve(keep && chunks.length ? { blob: new Blob(chunks, { type: mime }), mime } : null);
      rec.state !== "inactive" ? rec.stop() : resolve(null);
    };
    const timer = window.setInterval(() => {
      if (stopRef.current) return finish(false);
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      const now = Date.now();
      if (rms > 0.035) {
        if (!spokeAt) spokeAt = now;
        lastVoice = now;
      }
      if (spokeAt && now - lastVoice > 1300 && lastVoice - spokeAt > 300) finish(true);
      else if (!spokeAt && now - t0 > 15000) finish(false);
      else if (now - t0 > 25000) finish(!!spokeAt);
    }, 60);
    rec.start(250);
  });
}

function Conversation({
  answers,
  setAnswers,
  lines,
  setLines,
  setHeardIn,
  onStart,
  onDone,
  onComplete,
}: {
  answers: ReportAnswers;
  setAnswers: (fn: (a: ReportAnswers) => ReportAnswers) => void;
  lines: Line[];
  setLines: (fn: (l: Line[]) => Line[]) => void;
  setHeardIn: (fn: (h: Partial<Record<AnswerKey, number>>) => Partial<Record<AnswerKey, number>>) => void;
  onStart: () => void;
  onDone: () => void;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(lines.length ? "ended" : "idle");
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const [eleven, setEleven] = useState<boolean | null>(null);
  const [muted, setMuted] = useState(false);
  const [typed, setTyped] = useState("");
  const [interim, setInterim] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [lang, setLang] = useState<"en" | "de">("en");
  const answersRef = useRef(answers);
  const linesRef = useRef(lines);
  answersRef.current = answers;
  linesRef.current = lines;
  const stopRef = useRef(false);
  const mic = useRef<{ stream: MediaStream; ctx: AudioContext; analyser: AnalyserNode } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<any>(null);
  const session = useRef<any>(null);
  const [viaAgent, setViaAgent] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // Loudness 0..1 that drives the orb: agent voice while it speaks, the customer's mic while listening
  const levelBuf = useRef<Uint8Array | null>(null);
  const level = (): number => {
    const sess = session.current;
    if (sess) {
      try {
        return Math.min(1, (phaseRef.current === "speaking" ? sess.getOutputVolume?.() : sess.getInputVolume?.()) ?? 0);
      } catch {
        return 0;
      }
    }
    const m = mic.current;
    if (m && phaseRef.current === "listening") {
      const buf = (levelBuf.current ??= new Uint8Array(m.analyser.fftSize));
      m.analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(sum / buf.length) * 6);
    }
    return phaseRef.current === "speaking" ? 0.35 + 0.25 * Math.sin(Date.now() / 140) : 0;
  };

  useEffect(() => {
    voiceStatus()
      .then((s) => setEleven(s.elevenlabs))
      .catch(() => setEleven(false));
    return () => shutdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [lines.length, interim, phase]);

  const nextQuestion = (a: ReportAnswers) => {
    const open = activeQuestions(a)
      .filter((q) => fieldState(q, a) === "missing")
      .sort((x, y) => Number(y.key === "what_happened") - Number(x.key === "what_happened"));
    return open.find((q) => !q.optional) ?? open[0];
  };
  const pending = nextQuestion(answers);

  function shutdown() {
    stopRef.current = true;
    const sess = session.current;
    session.current = null;
    sess?.endSession?.().catch?.(() => undefined);
    audioRef.current?.pause();
    recRef.current?.stop?.();
    window.speechSynthesis?.cancel();
    mic.current?.stream.getTracks().forEach((t) => t.stop());
    mic.current?.ctx.close().catch(() => undefined);
    mic.current = null;
  }

  // ---- speaking: ElevenLabs voice, falling back to the browser voice
  const speak = async (text: string) => {
    setLines((l) => [...l, { speaker: "agent", text }]);
    if (mutedRef.current || stopRef.current) return;
    setPhase("speaking");
    let played = false;
    if (eleven) {
      try {
        const { audio } = await speakText({ data: { text } });
        if (audio && !stopRef.current) {
          await new Promise<void>((resolve) => {
            const el = new Audio(`data:audio/mpeg;base64,${audio}`);
            audioRef.current = el;
            el.onended = () => resolve();
            el.onerror = () => resolve();
            el.play().catch(() => resolve());
          });
          played = true;
        }
      } catch {
        /* fall back below */
      }
    }
    if (!played && typeof window !== "undefined" && window.speechSynthesis && !stopRef.current) {
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-GB";
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      });
    }
  };

  // ---- understanding one answer (deterministic keyword rules; the customer confirms everything later)
  const understand = (text: string): string => {
    const clean = text.trim();
    const before = answersRef.current;
    const asked = nextQuestion(before);
    const lineNo = linesRef.current.length + 1;
    const found = { ...(asked ? interpretReply(asked, clean) : {}), ...extractFromUtterance(clean) };
    if (!before.what_happened && clean.split(/\s+/).length >= 6 && !found.what_happened) found.what_happened = clean;
    const merged = { ...before, ...found };
    answersRef.current = merged;
    linesRef.current = [...linesRef.current, { speaker: "customer", text: clean }];
    setLines((l) => [...l, { speaker: "customer", text: clean }]);
    setAnswers(() => merged);
    setHeardIn((h) => {
      const n = { ...h };
      for (const k of Object.keys(found) as AnswerKey[]) n[k] = lineNo;
      return n;
    });
    const nq = nextQuestion(merged);
    if (!nq) return "";
    return Object.keys(found).length ? `Thanks. ${nq.ask}` : `Sorry, I didn't quite catch that. ${nq.ask}`;
  };

  // ---- listening: ElevenLabs speech-to-text (recorded turns) or the browser's live recognition
  const listenOnce = async (): Promise<string | null> => {
    if (eleven && mic.current) {
      setPhase("listening");
      const rec = await recordAnswer(mic.current.stream, mic.current.analyser, stopRef);
      if (!rec || stopRef.current) return null;
      setPhase("thinking");
      const { text } = await transcribeAudio({ data: { audio: await blobToBase64(rec.blob), mime: rec.mime, lang } });
      return text;
    }
    const r = getRecognition();
    if (!r) return null;
    setPhase("listening");
    return new Promise((resolve) => {
      r.lang = lang === "de" ? "de-DE" : "en-GB";
      r.interimResults = true;
      r.continuous = false;
      let final = "";
      r.onresult = (e: any) => {
        let partial = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript;
          else partial += e.results[i][0].transcript;
        }
        setInterim(partial);
      };
      r.onend = () => {
        setInterim("");
        resolve(final.trim() || null);
      };
      r.onerror = () => undefined;
      recRef.current = r;
      r.start();
    });
  };

  const loop = async () => {
    let misses = 0;
    while (!stopRef.current) {
      const heard = await listenOnce();
      if (stopRef.current) break;
      if (!heard) {
        misses += 1;
        if (misses >= 2) {
          setNote("I couldn't hear you. Tap the microphone to try again, or type your answer below.");
          setPhase("idle");
          return;
        }
        continue;
      }
      misses = 0;
      const reply = understand(heard);
      if (!reply) {
        await speak("Thank you, that's everything I need. Please check your answers and send them.");
        finish();
        return;
      }
      await speak(reply);
    }
  };

  const finish = () => {
    shutdown();
    setPhase("ended");
    window.setTimeout(onComplete, 600);
  };

  // ---- preferred engine: the ElevenLabs voice agent (introduces itself, asks, records via update_claim)
  const startAgent = async (): Promise<boolean> => {
    try {
      const url = "https://esm.sh/@elevenlabs/client";
      const mod: any = await import(/* @vite-ignore */ url);
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setPhase("thinking");
      const sess = await mod.Conversation.startSession({
        agentId: ELEVEN_AGENT_ID,
        connectionType: "websocket",
        clientTools: {
          update_claim: async (params: Record<string, unknown>) => {
            const found = cleanAgentAnswers(params ?? {});
            const merged = { ...answersRef.current, ...found };
            answersRef.current = merged;
            setAnswers(() => merged);
            const lastCustomer = linesRef.current.map((l) => l.speaker).lastIndexOf("customer") + 1;
            if (lastCustomer > 0)
              setHeardIn((h) => {
                const n = { ...h };
                for (const k of Object.keys(found) as AnswerKey[]) n[k] = lastCustomer;
                return n;
              });
            const open = activeQuestions(merged).filter((q) => fieldState(q, merged) === "missing");
            const nq = nextQuestion(merged);
            if (!nq) return "Saved. Nothing is missing. Close the conversation now.";
            return `Saved. Still missing: ${open.map((q) => q.label + (q.optional ? " (optional)" : "")).join(", ")}. Ask next: "${nq.ask}"`;
          },
        },
        onMessage: (m: any) => {
          const text = String(m?.message ?? "").trim();
          if (!text) return;
          const speaker: Line["speaker"] = m?.source === "user" || m?.role === "user" ? "customer" : "agent";
          linesRef.current = [...linesRef.current, { speaker, text }];
          setLines((l) => [...l, { speaker, text }]);
        },
        onModeChange: (m: any) => setPhase(m?.mode === "speaking" ? "speaking" : "listening"),
        onDisconnect: () => {
          session.current = null;
          const done = !nextQuestion(answersRef.current);
          setPhase(done ? "ended" : "ended");
          if (done) window.setTimeout(onComplete, 800);
        },
        onError: () => setNote("The voice connection had a problem. You can continue by typing below."),
      });
      session.current = sess;
      setViaAgent(true);
      return true;
    } catch {
      return false;
    }
  };

  const start = async () => {
    setNote(null);
    stopRef.current = false;
    onStart();
    if (await startAgent()) return;
    if (eleven || !getRecognition()) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        mic.current = { stream, ctx, analyser };
      } catch {
        setNote("Microphone access was blocked. You can type your answers below instead.");
        setEleven(false);
      }
    }
    const q = nextQuestion(answersRef.current);
    const intro = linesRef.current.length
      ? q?.ask ?? ""
      : `Hi, I'm ${AGENT_NAME}, the Clearpath claims assistant. I'll ask you a few short questions to record your claim. If you're not sure about something, just say so. ${q?.ask ?? ""}`;
    await speak(intro);
    if (mic.current || getRecognition()) void loop();
    else setPhase("idle");
  };

  const stop = () => {
    shutdown();
    setPhase(lines.length ? "ended" : "idle");
  };

  const sendTyped = async () => {
    const t = typed.trim();
    if (!t) return;
    setTyped("");
    if (session.current?.sendUserMessage) {
      linesRef.current = [...linesRef.current, { speaker: "customer", text: t }];
      setLines((l) => [...l, { speaker: "customer", text: t }]);
      session.current.sendUserMessage(t);
      return;
    }
    if (!linesRef.current.length) {
      onStart();
      setLines(() => [{ speaker: "agent", text: `Hi, I'm ${AGENT_NAME}, the Clearpath claims assistant. ${nextQuestion(answersRef.current)?.ask ?? ""}` }]);
      linesRef.current = [{ speaker: "agent", text: "" }];
    }
    const reply = understand(t);
    if (!reply) {
      setLines((l) => [...l, { speaker: "agent", text: "Thank you, that's everything I need. Please check your answers and send them." }]);
      window.setTimeout(onComplete, 900);
    } else setLines((l) => [...l, { speaker: "agent", text: reply }]);
  };

  const live = phase === "speaking" || phase === "listening" || phase === "thinking";
  const status =
    phase === "speaking" ? `${AGENT_NAME} is speaking…` : phase === "listening" ? "Listening… just answer naturally" : phase === "thinking" ? "One moment…" : phase === "ended" ? "Conversation paused" : `Talk to ${AGENT_NAME}, our claims assistant`;

  return (
    <div className="card-quiet overflow-hidden p-0">
      <div className="flex flex-col items-center px-6 pb-6 pt-9 text-center">
        <button
          type="button"
          onClick={live ? stop : start}
          aria-label={live ? "End conversation" : "Start conversation"}
          className="group relative size-44 rounded-full transition-transform duration-200 hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-link"
        >
          <VoiceOrb phase={phase} level={level} />
          {!live && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-white/85 text-link shadow-sm ring-1 ring-white transition-transform group-hover:scale-105">
                <Mic className="size-5" />
              </span>
            </span>
          )}
        </button>
        <p className="mt-5 text-[17px] font-semibold">{status}</p>
        <p className="mt-1 text-[13px] text-text-2">
          {live ? "Tap the circle to end the conversation." : phase === "ended" ? "Tap the circle to continue where you left off." : "Tap the circle and allow the microphone. Takes about three minutes."}
        </p>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-text-3">
          <span>{viaAgent || eleven ? "Voice by ElevenLabs" : "Voice by ElevenLabs agent"}</span>
          <span>·</span>
          <select aria-label="Your language" value={lang} disabled={live} onChange={(e) => setLang(e.target.value as "en" | "de")} className="rounded-[6px] border border-line bg-surface px-1.5 py-0.5 text-[12px] text-text-2">
            <option value="en">I'll speak English</option>
            <option value="de">Ich spreche Deutsch</option>
          </select>
          <button type="button" onClick={() => setMuted((m) => !m)} className="inline-flex items-center gap-1 hover:text-foreground" aria-label="Toggle assistant voice">
            {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />} {muted ? "Muted" : "Sound on"}
          </button>
        </div>
        {note && <p className="mt-3 text-[13px] text-action">{note}</p>}
      </div>

      {(lines.length > 0 || interim) && (
        <div ref={scroller} className="max-h-[320px] space-y-3 overflow-y-auto border-t border-line px-6 py-5">
          {lines.map((l, i) => (
            <div key={i} className={cn("flex", l.speaker === "customer" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] rounded-[14px] px-4 py-2.5 text-left text-[14px] leading-relaxed", l.speaker === "customer" ? "bg-link text-white" : "bg-surface-2 ring-1 ring-line")}>{l.text}</div>
            </div>
          ))}
          {interim && (
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-[14px] bg-link/15 px-4 py-2.5 text-[14px] italic text-text-2">{interim}…</div>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-line px-6 py-4">
        {pending && lines.length > 0 && (
          <p className="mb-2 text-[12.5px] text-text-2">
            <span className="label-mono mr-2">Still needed</span>
            {pending.label}
          </p>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendTyped();
          }}
        >
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Can't talk right now? Type your answer here…" className="bg-surface" />
          <Button type="submit" variant="outline" disabled={!typed.trim()} aria-label="Send">
            <Send />
          </Button>
        </form>
        {lines.length > 1 && (
          <div className="mt-3 flex justify-end">
            <Button
              variant={pending ? "ghost" : "default"}
              onClick={() => {
                shutdown();
                onDone();
              }}
            >
              Check my answers <ArrowRight />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */


// ------------------------------------------------------------------ review + send

function Review({
  qs,
  answers,
  set,
  heardIn,
  voice,
  files,
  setFiles,
  busy,
  error,
  onBack,
  onSubmit,
}: {
  qs: Question[];
  answers: ReportAnswers;
  set: (k: AnswerKey, v: string) => void;
  heardIn: Partial<Record<AnswerKey, number>>;
  voice: boolean;
  files: { incident_report?: string; quote?: string };
  setFiles: (f: { incident_report?: string; quote?: string }) => void;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const required = qs.filter((q) => !q.optional && q.type !== "choice" && !canContinue(q, answers));
  return (
    <div className="mx-auto max-w-[760px] pt-4">
      <p className="label-mono">Almost done</p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.01em]">Check your answers</h1>
      <p className="mt-2 text-[14px] text-text-2">
        {voice ? "These are the points we heard. Please correct anything we got wrong." : "You can still change anything here."} Answers you're not sure about stay open; we'll ask again if we need them.
      </p>

      <div className="card-quiet mt-6 divide-y divide-line p-0">
        {qs.map((q) => {
          const v = String(answers[q.key] ?? "");
          return (
            <div key={q.key} className="grid gap-2 px-5 py-3.5 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center">
              <label htmlFor={`r-${q.key}`} className="flex items-center gap-2 text-[13px] text-text-2">
                {q.label}
                {voice && heardIn[q.key] && <span className="label-mono text-[9.5px] text-link">Heard · please check</span>}
              </label>
              {q.type === "choice" && q.choices ? (
                <select id={`r-${q.key}`} value={v} onChange={(e) => set(q.key, e.target.value)} className="h-9 rounded-[8px] border border-line bg-surface px-3 text-[14px]">
                  <option value="">Not answered</option>
                  {q.choices.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              ) : q.type === "textarea" ? (
                <Textarea id={`r-${q.key}`} value={v} onChange={(e) => set(q.key, e.target.value)} className="min-h-[72px] bg-surface" />
              ) : (
                <Input
                  id={`r-${q.key}`}
                  type={q.type === "email" ? "email" : q.type === "date" ? "date" : "text"}
                  value={v}
                  onChange={(e) => set(q.key, e.target.value)}
                  placeholder={q.optional ? "Not given" : ""}
                  className="h-9 bg-surface"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="card-quiet mt-5 p-5">
        <p className="section-title">Documents</p>
        <p className="mt-1 text-[13px] text-text-2">Attach them now if you have them. You can also send them later.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <FilePick label="Incident or police report" name={files.incident_report} onPick={(n) => setFiles({ ...files, incident_report: n })} />
          <FilePick label="Repair quote" name={files.quote} onPick={(n) => setFiles({ ...files, quote: n })} />
        </div>
        <p className="mt-3 text-[11.5px] text-text-3">Demo: only the file name is recorded, the file itself is not uploaded.</p>
      </div>

      {required.length > 0 && <p className="mt-4 text-[13px] text-action">Please fill in: {required.map((q) => q.label).join(", ")}.</p>}
      {error && <p className="mt-4 text-[13px] text-action">{error}</p>}

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
        <Button onClick={onSubmit} disabled={busy || required.length > 0} className="h-11 px-6">
          {busy ? "Sending…" : "Send my claim"} <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function FilePick({ label, name, onPick }: { label: string; name?: string; onPick: (n?: string) => void }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-3 rounded-[10px] border px-4 py-3", name ? "border-link/40 bg-link/5" : "border-dashed border-line hover:bg-surface-2")}>
      {name ? <FileText className="size-4 text-link" /> : <Paperclip className="size-4 text-text-2" />}
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium">{label}</span>
        <span className="block truncate text-[12px] text-text-2">{name ?? "PDF or photo"}</span>
      </span>
      <input type="file" accept=".pdf,image/*" className="sr-only" onChange={(e) => onPick(e.target.files?.[0]?.name)} />
    </label>
  );
}

// ------------------------------------------------------------------ done

function Done({ result, setResult, name, email, plate = "" }: { result: ReportResult; setResult: (r: ReportResult) => void; name: string; email: string; plate?: string }) {
  const first = name.split(" ")[0] || "there";
  const [rechecked, setRechecked] = useState<ReportResult["recommendation"] | null>(null);
  const missing = result.missing_fields.map((f) => CUSTOMER_MISSING[f] ?? f);
  const next =
    result.recommendation === "routine_processing"
      ? { title: "Your claim is complete", text: "Everything we need is there, so your claim goes straight into processing. This is not yet a payment approval; we'll confirm the next steps by email." }
      : result.recommendation === "request_information"
        ? { title: "We need a little more", text: `We've sent a request to ${email}. You can also add the missing points right here; your claim is then checked again automatically.` }
        : { title: "A claims specialist will look at it", text: "Some points need a person to check them. A specialist will review your claim and get back to you." };
  const csv = toCsvRow(result.row);

  const download = () => {
    const url = URL.createObjectURL(new Blob([csv + "\n"], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.case_id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[680px] pt-10">
      <span className="flex size-12 items-center justify-center rounded-full bg-link text-white">
        <Check className="size-6" strokeWidth={2.5} />
      </span>
      <h1 className="mt-6 text-[32px] font-semibold tracking-[-0.02em]">Thank you, {first}. We've got your claim.</h1>
      <p className="mt-2 text-[15px] text-text-2">
        Your reference number is <span className="font-mono font-medium text-foreground">{result.case_id}</span>. Please keep it for any questions.
      </p>
      <p className="mt-3">
        <Link
          to="/status"
          search={plate ? { plate, case: result.case_id } : {}}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-link px-5 text-[14px] font-medium text-white hover:bg-link/90"
        >
          Track your claim status <ArrowRight className="size-4" />
        </Link>
      </p>

      {rechecked && (
        <p className="mt-4 rounded-[10px] bg-link/10 px-4 py-2.5 text-[14px] text-foreground">Thanks, we've added your information and checked your claim again.</p>
      )}

      <div className="card-quiet mt-8 p-6">
        <p className="label-mono">What happens next</p>
        <p className="mt-2 text-[18px] font-semibold">{next.title}</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-text-2">{next.text}</p>
        {result.recommendation === "request_information" && missing.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {missing.map((m) => (
              <li key={m} className="flex items-start gap-2 text-[14px]">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-wait-dot" /> {m}
              </li>
            ))}
          </ul>
        )}
      </div>

      {result.recommendation === "request_information" && (
        <AddMissing
          result={result}
          email={email}
          onDone={(r) => {
            setResult(r);
            setRechecked(r.recommendation);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      <div className="mt-6 rounded-[10px] border border-dashed border-line p-5">
        <p className="label-mono">Demo · inside Clearpath</p>
        <p className="mt-2 text-[14px]">
          Rules engine: <strong>{RECOMMENDATION_LABELS[result.recommendation]}</strong> · rule {result.rule_id.toUpperCase()} · policy {result.policy_version.toUpperCase()}
          {" · "}
          {result.recommendation === "human_review" ? "now in the reviewer workstream" : result.recommendation === "request_information" ? "waiting on the customer" : "processed automatically"}
        </p>
        <p className="mt-3 text-[12.5px] text-text-2">The claim as one row in the case CSV format (same columns as the judges' data). Empty cells are unknown, never guessed.</p>
        <pre className="mt-2 overflow-x-auto rounded-[8px] bg-surface-2 p-3 font-mono text-[11px] leading-relaxed ring-1 ring-line">{csv}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/claims/$caseId" params={{ caseId: result.case_id }}>
              Open in reviewer workspace <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a href={`/claim/${result.case_id}?e=${encodeURIComponent(email)}`} target="_blank" rel="noreferrer">
              Your claim page
            </a>
          </Button>
          <Button variant="ghost" onClick={download}>
            <FileText /> Download CSV row
          </Button>
          <Button asChild variant="ghost">
            <a href="/report">Report another claim</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The customer adds what was missing; the claim is then re-run through the rules on the server. */
function AddMissing({ result, email, onDone }: { result: ReportResult; email: string; onDone: (r: ReportResult) => void }) {
  const [partial, setPartial] = useState<Partial<ReportAnswers>>({});
  const [files, setFiles] = useState<{ incident_report?: string; quote?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keys = Array.from(new Set(result.missing_fields.flatMap((f) => FIELD_QUESTIONS[f] ?? [])));
  const qs = QUESTIONS.filter((q) => keys.includes(q.key) && (q.key !== "fault" || partial.other_party === "yes"));
  const set = (k: AnswerKey, v: string) => setPartial((p) => ({ ...p, [k]: v }));
  if (!qs.length) return null;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await addClaimInfo({ data: { case_id: result.case_id, email, answers: partial, files } }));
      setPartial({});
    } catch (e) {
      setError((e as Error).message || "Could not send. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-quiet mt-5 p-6">
      <p className="section-title">Add the missing information now</p>
      <p className="mt-1 text-[13px] text-text-2">Only answer what you know. Anything you leave open stays open.</p>
      <div className="mt-4 space-y-4">
        {qs.map((q) => {
          const v = String(partial[q.key] ?? "");
          return (
            <div key={q.key}>
              <p className="text-[14px] font-medium">{q.ask}</p>
              {q.type === "choice" && q.choices ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.choices.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => set(q.key, c.value)}
                      className={cn("rounded-[8px] border px-3 py-1.5 text-[13.5px]", v === c.value ? "border-link bg-link/10 font-medium" : "border-line bg-surface hover:border-link/40")}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              ) : (
                <Input value={v} onChange={(e) => set(q.key, e.target.value)} placeholder={q.type === "money" ? "e.g. 1,450" : q.key === "policy_number" ? "e.g. POL-482913" : ""} className="mt-2 h-10 max-w-[320px] bg-surface" />
              )}
              {q.key === "incident_report" && v === "yes" && (
                <div className="mt-2 max-w-[360px]">
                  <FilePick label="Incident or police report" name={files.incident_report} onPick={(n) => setFiles({ ...files, incident_report: n })} />
                </div>
              )}
              {q.key === "quote_itemized" && v === "yes" && (
                <div className="mt-2 max-w-[360px]">
                  <FilePick label="Itemized repair quote" name={files.quote} onPick={(n) => setFiles({ ...files, quote: n })} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-3 text-[13px] text-action">{error}</p>}
      <div className="mt-5 flex justify-end">
        <Button onClick={send} disabled={busy || Object.keys(partial).length === 0}>
          {busy ? "Checking…" : "Send and check again"} <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
