import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, Keyboard, Lock, Mic, MicOff, Paperclip, Send, Volume2, VolumeX } from "lucide-react";
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
  type AnswerKey,
  type Question,
  type ReportAnswers,
} from "@/lib/report-intake";
import { submitClaimReport, type ReportResult } from "@/lib/report.functions";

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

type Mode = "start" | "form" | "voice" | "review" | "done";
type Line = { speaker: "agent" | "customer"; text: string };

const CUSTOMER_MISSING: Record<string, string> = {
  incident_report_present: "Your incident or police report",
  itemized_quote_present: "A repair quote that lists each part and the labour",
  quote_eur: "The amount of your repair quote",
  policy_active_on_incident: "Your policy number",
  claim_type: "What kind of claim this is",
  injury_reported: "Whether anyone was injured",
  liability_disputed: "Whether you and the other party agree on who caused it",
  repair_type: "What needs repairing",
};

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

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await submitClaimReport({ data: { channel: channel.current, answers, transcript: lines, heardIn, files } });
      setResult(res);
      setMode("done");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-5">
        <button onClick={() => setMode("start")} className="flex items-center gap-2.5 text-left">
          <Logo />
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight">Clearpath</span>
            <span className="label-mono mt-1 text-[9.5px]">Motor claims</span>
          </span>
        </button>
        <span className="flex items-center gap-1.5 text-[12.5px] text-text-2">
          <Lock className="size-3.5" /> Your answers are sent securely
        </span>
      </header>

      <main className="mx-auto max-w-[1180px] px-6 pb-16">
        {mode === "start" && (
          <Start
            onForm={() => {
              channel.current = "online_form";
              setStep(0);
              setMode("form");
            }}
            onVoice={() => {
              channel.current = "phone";
              setMode("voice");
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
              onNext={() => (step >= qs.length - 1 ? setMode("review") : setStep((s) => s + 1))}
            />
          </Shell>
        )}

        {mode === "voice" && (
          <Shell side={<Checklist qs={qs} answers={answers} heardIn={heardIn} />}>
            <VoiceIntake
              answers={answers}
              setAnswers={setAnswers}
              lines={lines}
              setLines={setLines}
              setHeardIn={setHeardIn}
              onBack={() => setMode("start")}
              onDone={() => setMode("review")}
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
            onBack={() => setMode(channel.current === "phone" ? "voice" : "form")}
            onSubmit={submit}
          />
        )}

        {mode === "done" && result && <Done result={result} name={answers.name} email={answers.email} />}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ start

function Start({ onForm, onVoice }: { onForm: () => void; onVoice: () => void }) {
  return (
    <div className="mx-auto max-w-[880px] pt-10">
      <p className="label-mono">Report a claim</p>
      <h1 className="mt-3 text-[40px] font-semibold leading-[1.08] tracking-[-0.02em]">Damage to your car? Tell us what happened.</h1>
      <p className="mt-4 max-w-[620px] text-[16px] leading-relaxed text-text-2">
        It takes about three minutes. If you're not sure about something, just say so. We never guess: open points stay open until you or we have checked them.
      </p>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <ModeCard
          icon={<Keyboard className="size-5" />}
          title="Fill in the form"
          text="One short question at a time. You can go back and change anything before you send it."
          cta="Start the form"
          onClick={onForm}
          primary
        />
        <ModeCard
          icon={<Mic className="size-5" />}
          title="Tell us by voice"
          text="Just talk. We tick off each point we hear and only ask about what's still missing."
          cta="Start talking"
          onClick={onVoice}
        />
      </div>

      <div className="card-quiet mt-8 p-5">
        <p className="section-title">Good to have at hand</p>
        <ul className="mt-3 grid gap-2 text-[14px] text-text-2 sm:grid-cols-2">
          {["Your policy number", "The number plate of your car", "The repair quote from your workshop, ideally with each part listed", "An incident or police report, if there is one"].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-link" /> {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ModeCard({ icon, title, text, cta, onClick, primary }: { icon: ReactNode; title: string; text: string; cta: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} className="card-quiet group flex flex-col p-6 text-left transition-colors hover:border-link/40 hover:bg-white">
      <span className="flex size-10 items-center justify-center rounded-[10px] bg-link/10 text-link">{icon}</span>
      <span className="mt-5 text-[18px] font-semibold">{title}</span>
      <span className="mt-1.5 text-[14px] leading-relaxed text-text-2">{text}</span>
      <span className={cn("mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium", primary ? "text-foreground" : "text-link")}>
        {cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
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

/* eslint-disable @typescript-eslint/no-explicit-any */
const getRecognition = (): any => {
  if (typeof window === "undefined") return null;
  const R = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  return R ? new R() : null;
};

function VoiceIntake({
  answers,
  setAnswers,
  lines,
  setLines,
  setHeardIn,
  onBack,
  onDone,
}: {
  answers: ReportAnswers;
  setAnswers: (fn: (a: ReportAnswers) => ReportAnswers) => void;
  lines: Line[];
  setLines: (fn: (l: Line[]) => Line[]) => void;
  setHeardIn: (fn: (h: Partial<Record<AnswerKey, number>>) => Partial<Record<AnswerKey, number>>) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [typed, setTyped] = useState("");
  const [speak, setSpeak] = useState(true);
  const [lang, setLang] = useState<"en-GB" | "de-DE">("en-GB");
  const [supported, setSupported] = useState(true);
  const rec = useRef<any>(null);
  const wantListening = useRef(false);
  const speaking = useRef(false);
  const answersRef = useRef(answers);
  const linesRef = useRef(lines);
  answersRef.current = answers;
  linesRef.current = lines;
  const scroller = useRef<HTMLDivElement>(null);

  // By voice the story comes first, then whatever is still missing
  const nextQuestion = (a: ReportAnswers) => {
    const open = activeQuestions(a)
      .filter((q) => fieldState(q, a) === "missing")
      .sort((x, y) => Number(y.key === "what_happened") - Number(x.key === "what_happened"));
    return open.find((q) => !q.optional) ?? open[0];
  };
  const pending = nextQuestion(answers);

  const say = useCallback(
    (text: string) => {
      setLines((l) => [...l, { speaker: "agent", text }]);
      if (!speak || typeof window === "undefined" || !window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-GB";
      u.rate = 1.03;
      speaking.current = true;
      u.onend = () => {
        speaking.current = false;
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    },
    [speak, setLines],
  );

  // Greeting once
  useEffect(() => {
    setSupported(!!getRecognition());
    if (linesRef.current.length === 0)
      setLines(() => [{ speaker: "agent", text: "Hi, I'm the Clearpath claims assistant. Tell me what happened, in your own words. You can say everything at once; I'll tick off what I hear and ask about the rest." }]);
    return () => {
      wantListening.current = false;
      rec.current?.stop?.();
      window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [lines.length, interim]);

  const handleUtterance = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const before = answersRef.current;
    const asked = nextQuestion(before);
    const lineNo = linesRef.current.length + 1;
    const heard = extractFromUtterance(clean);
    const found = { ...(asked ? interpretReply(asked, clean) : {}), ...heard };
    // The first free-form story becomes "what happened" if nothing else filled it
    if (!before.what_happened && clean.split(/\s+/).length >= 6 && !found.what_happened) found.what_happened = clean;
    const merged = { ...before, ...found };
    setLines((l) => [...l, { speaker: "customer", text: clean }]);
    setAnswers(() => merged);
    setHeardIn((h) => {
      const n = { ...h };
      for (const k of Object.keys(found) as AnswerKey[]) n[k] = lineNo;
      return n;
    });
    const nq = nextQuestion(merged);
    window.setTimeout(() => {
      if (nq) say(Object.keys(found).length ? `Thanks. ${nq.ask}` : `Sorry, I didn't catch that. ${nq.ask}`);
      else say("Thank you, that's everything I need. Please check your answers before you send them.");
    }, 350);
  };

  const start = () => {
    const r = getRecognition();
    if (!r) {
      setSupported(false);
      return;
    }
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e: any) => {
      if (speaking.current) return;
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) handleUtterance(res[0].transcript);
        else partial += res[0].transcript;
      }
      setInterim(partial);
    };
    r.onerror = (e: any) => {
      if (e.error === "not-allowed") {
        wantListening.current = false;
        setListening(false);
        setSupported(false);
      }
    };
    r.onend = () => {
      if (wantListening.current) {
        try {
          r.start();
        } catch {
          /* already started */
        }
      } else setListening(false);
    };
    rec.current = r;
    wantListening.current = true;
    r.start();
    setListening(true);
    if (linesRef.current.length <= 1) say("Go ahead, I'm listening.");
  };

  const stop = () => {
    wantListening.current = false;
    rec.current?.stop?.();
    setListening(false);
    setInterim("");
  };

  const sendTyped = () => {
    handleUtterance(typed);
    setTyped("");
  };

  return (
    <div className="card-quiet flex min-h-[560px] flex-col p-0">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <p className="section-title">Tell us by voice</p>
          <p className="text-[12.5px] text-text-2">Speak naturally. Every point we hear is ticked off on the right.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Language"
            value={lang}
            onChange={(e) => setLang(e.target.value as "en-GB" | "de-DE")}
            disabled={listening}
            className="h-8 rounded-[8px] border border-line bg-surface px-2 text-[12.5px]"
          >
            <option value="en-GB">English</option>
            <option value="de-DE">Deutsch</option>
          </select>
          <Button variant="ghost" size="icon" onClick={() => setSpeak((s) => !s)} title={speak ? "Assistant speaks questions aloud" : "Assistant is muted"} aria-label="Toggle spoken questions">
            {speak ? <Volume2 /> : <VolumeX />}
          </Button>
        </div>
      </div>

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-6 py-5" style={{ maxHeight: 420 }}>
        {lines.map((l, i) => (
          <div key={i} className={cn("flex", l.speaker === "customer" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[78%] rounded-[14px] px-4 py-2.5 text-[14px] leading-relaxed", l.speaker === "customer" ? "bg-link text-white" : "bg-surface-2 ring-1 ring-line")}>
              {l.text}
            </div>
          </div>
        ))}
        {interim && (
          <div className="flex justify-end">
            <div className="max-w-[78%] rounded-[14px] bg-link/15 px-4 py-2.5 text-[14px] italic text-text-2">{interim}…</div>
          </div>
        )}
      </div>

      <div className="border-t border-line px-6 py-5">
        {pending && (
          <p className="mb-3 text-[13px] text-text-2">
            <span className="label-mono mr-2">Still needed</span>
            {pending.label}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {supported ? (
            <Button onClick={listening ? stop : start} className={cn("h-11 rounded-full px-5", listening && "bg-action hover:bg-action/90")}>
              {listening ? <MicOff /> : <Mic />} {listening ? "Stop listening" : "Start talking"}
            </Button>
          ) : (
            <p className="text-[13px] text-text-2">Voice isn't available in this browser (try Chrome) or the microphone is blocked. You can type below instead.</p>
          )}
          {listening && (
            <span className="flex items-center gap-2 text-[12.5px] text-text-2">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-action-dot opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-action-dot" />
              </span>
              Listening…
            </span>
          )}
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendTyped();
          }}
        >
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type what you would say…" className="bg-surface" />
          <Button type="submit" variant="outline" disabled={!typed.trim()} aria-label="Send">
            <Send />
          </Button>
        </form>
        <div className="mt-5 flex items-center justify-between">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft /> Back
          </Button>
          <Button
            variant={pending ? "outline" : "default"}
            onClick={() => {
              stop();
              onDone();
            }}
          >
            Check my answers <ArrowRight />
          </Button>
        </div>
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

function Done({ result, name, email }: { result: ReportResult; name: string; email: string }) {
  const first = name.split(" ")[0] || "there";
  const missing = result.missing_fields.map((f) => CUSTOMER_MISSING[f] ?? f);
  const next =
    result.recommendation === "routine_processing"
      ? { title: "Your claim is complete", text: "Everything we need is there, so your claim goes straight into processing. This is not yet a payment approval; we'll confirm the next steps by email." }
      : result.recommendation === "request_information"
        ? { title: "We need a little more", text: `We've sent a request to ${email}. As soon as you send the missing items, your claim continues automatically.` }
        : { title: "A claims specialist will look at it", text: "Some points need a person to check them. A specialist will review your claim and get back to you." };

  return (
    <div className="mx-auto max-w-[680px] pt-10">
      <span className="flex size-12 items-center justify-center rounded-full bg-link text-white">
        <Check className="size-6" strokeWidth={2.5} />
      </span>
      <h1 className="mt-6 text-[32px] font-semibold tracking-[-0.02em]">Thank you, {first}. We've got your claim.</h1>
      <p className="mt-2 text-[15px] text-text-2">
        Your reference number is <span className="font-mono font-medium text-foreground">{result.case_id}</span>. Please keep it for any questions.
      </p>

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

      <div className="mt-6 rounded-[10px] border border-dashed border-line p-5">
        <p className="label-mono">Demo · inside Clearpath</p>
        <p className="mt-2 text-[14px]">
          Rules engine: <strong>{RECOMMENDATION_LABELS[result.recommendation]}</strong> · rule {result.rule_id.toUpperCase()} · policy {result.policy_version.toUpperCase()}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/claims/$caseId" params={{ caseId: result.case_id }}>
              Open in reviewer workspace <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <a href="/report">Report another claim</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
