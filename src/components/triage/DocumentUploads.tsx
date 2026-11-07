import { useRef, useState } from "react";
<<<<<<< Updated upstream
import { Camera, Check, FileText, Loader2, Paperclip, Receipt, Sparkles, X } from "lucide-react";
import type { ReportAnswers } from "@/lib/report-intake";
=======
import { Camera, FileText, Paperclip, Receipt, ScanText, Sparkles, TriangleAlert, X } from "lucide-react";
import { answerLabel, EMPTY_ANSWERS, QUESTIONS, type AnswerKey, type ReportAnswers } from "@/lib/report-intake";
import { scanDocument, type ScanResponse } from "@/lib/document-scan.functions";
import { plateKey } from "@/lib/customers";
>>>>>>> Stashed changes
import { cn } from "@/lib/utils";

// Documents the customer adds while reporting: an incident/police report, the repair quote, damage photos.
// Each one can be the customer's own file or a synthetic demo file. Every added document is scanned: what it
// says fills the answers the customer hasn't given yet, so neither the form nor Mia has to ask for them.

export type UploadKind = "incident_report" | "quote" | "photos";
export interface PendingFile {
  kind: UploadKind;
  name: string;
  type: string;
  size: number;
  b64: string;
  demo: boolean;
  /** Reading the document with AI: what it found ("Repair quote: €980") */
  reading?: "reading" | "done" | "failed";
  found?: string[];
  summary?: string | null;
}

const MAX = 10 * 1024 * 1024;

export const UPLOAD_SLOTS: {
  kind: UploadKind;
  label: string;
  hint: string;
  icon: typeof FileText;
  demo: { file: string; name: string; answers: Partial<ReportAnswers> };
  /** What a customer's own file of this kind tells us for sure */
  answers: Partial<ReportAnswers>;
}[] = [
  {
    kind: "incident_report",
    label: "Incident or police report",
    hint: "PDF or photo",
    icon: FileText,
    demo: { file: "/demo/incident_report_sample.pdf", name: "incident_report_sample.pdf", answers: { incident_report: "yes" } },
    answers: { incident_report: "yes" },
  },
  {
    kind: "quote",
    label: "Repair quote",
    hint: "From your workshop",
    icon: Receipt,
    demo: { file: "/demo/repair_quote_itemized_sample.pdf", name: "repair_quote_itemized_sample.pdf", answers: { quote_amount: "980", quote_itemized: "yes", repair_kind: "standard" } },
    answers: {},
  },
  {
    kind: "photos",
    label: "Damage photos",
    hint: "Optional",
    icon: Camera,
    demo: { file: "/demo/damage_photos_sample.pdf", name: "damage_photos_sample.pdf", answers: {} },
    answers: {},
  },
];

const toB64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export function DocumentUploads({
  files,
  onAdd,
  onRemove,
  compact,
  answers,
}: {
  files: PendingFile[];
  onAdd: (f: PendingFile, answers: Partial<ReportAnswers>) => void;
  onRemove: (kind: UploadKind) => void;
  compact?: boolean;
  /** The customer's current answers, to flag where a document says something different */
  answers?: ReportAnswers;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<UploadKind | null>(null);
  const [scans, setScans] = useState<Partial<Record<UploadKind, ScanResponse>>>({});
  const inputs = useRef<Partial<Record<UploadKind, HTMLInputElement | null>>>({});

  /** Scan the whole document, then hand over the file with everything it told us */
  const scanAndAdd = async (slot: (typeof UPLOAD_SLOTS)[number], f: PendingFile) => {
    const scan = await scanDocument({ data: { name: f.name, type: f.type, b64: f.b64, kind: slot.kind } }).catch(() => null);
    const found = (scan?.answers ?? {}) as Partial<ReportAnswers>;
    const fallback = Object.keys(found).length ? {} : f.demo ? slot.demo.answers : {};
    setScans((s) => ({ ...s, [slot.kind]: scan ?? { answers: {}, findings: {}, seen: {}, looksLike: "other", method: "none", note: "The document could not be scanned just now." } }));
    onAdd(f, { ...slot.answers, ...fallback, ...found });
  };
  const remove = (kind: UploadKind) => {
    setScans((s) => ({ ...s, [kind]: undefined }));
    onRemove(kind);
  };

  const addOwn = async (slot: (typeof UPLOAD_SLOTS)[number], file?: File) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX) return setError("Files can be at most 10 MB.");
    setLoading(slot.kind);
    try {
      const b64 = toB64(await file.arrayBuffer());
      await scanAndAdd(slot, { kind: slot.kind, name: file.name, type: file.type || "application/pdf", size: file.size, b64, demo: false });
    } finally {
      setLoading(null);
    }
  };

  const addDemo = async (slot: (typeof UPLOAD_SLOTS)[number]) => {
    setError(null);
    setLoading(slot.kind);
    try {
      const res = await fetch(slot.demo.file);
      const buf = await res.arrayBuffer();
      await scanAndAdd(slot, { kind: slot.kind, name: slot.demo.name, type: "application/pdf", size: buf.byteLength, b64: toB64(buf), demo: true });
    } catch {
      setError("The demo file could not be loaded.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={cn("card-quiet", compact ? "p-4" : "p-5")}>
      <div className="flex items-baseline justify-between">
        <p className="section-title">Documents</p>
        <span className="label-mono">{files.length} / 3</span>
      </div>
<<<<<<< Updated upstream
      <p className="mt-1 text-[12.5px] text-text-2">Add them and we read them for you: what's in them doesn't need to be asked.</p>
=======
      <p className="mt-1 text-[12.5px] text-text-2">We read each document and fill in what it tells us, so we won't need to ask.</p>
>>>>>>> Stashed changes
      <ul className="mt-3 space-y-2">
        {UPLOAD_SLOTS.map((slot) => {
          const f = files.find((x) => x.kind === slot.kind);
          const Icon = slot.icon;
          return (
            <li key={slot.kind} className={cn("rounded-[10px] px-3 py-2.5 ring-1", f ? "bg-link/5 ring-link/30" : "bg-surface ring-line")}>
              <div className="flex items-center gap-2.5">
                <Icon className={cn("size-4 shrink-0", f ? "text-link" : "text-text-3")} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium leading-tight">{slot.label}</p>
                  <p className="truncate text-[11.5px] text-text-3">
                    {f ? `${f.name}${f.demo ? " · demo file" : ""}` : loading === slot.kind ? "Reading the document…" : slot.hint}
                  </p>
                </div>
                {f ? (
                  <button onClick={() => remove(slot.kind)} aria-label={`Remove ${slot.label}`} className="rounded-full p-1 text-text-3 hover:bg-surface-2 hover:text-foreground">
                    <X className="size-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => inputs.current[slot.kind]?.click()}
                    className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium ring-1 ring-line hover:ring-link/40"
                  >
                    <Paperclip className="size-3" /> Upload
                  </button>
                )}
                <input
                  ref={(el) => {
                    inputs.current[slot.kind] = el;
                  }}
                  type="file"
                  accept=".pdf,image/*"
                  className="sr-only"
                  onChange={(e) => {
                    void addOwn(slot, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
<<<<<<< Updated upstream
              {f?.reading === "reading" && (
                <p className="ml-[26px] mt-1 flex items-center gap-1.5 text-[11.5px] text-text-2">
                  <Loader2 className="size-3 animate-spin" /> Reading the document…
                </p>
              )}
              {f?.reading === "done" && (f.found?.length ?? 0) > 0 && (
                <ul className="ml-[26px] mt-1 space-y-0.5">
                  {f.found!.map((x) => (
                    <li key={x} className="flex items-start gap-1.5 text-[11.5px] text-text-2">
                      <Check className="mt-0.5 size-3 shrink-0 text-link" /> {x}
                    </li>
                  ))}
                </ul>
              )}
              {f?.reading === "done" && !(f.found?.length ?? 0) && (
                <p className="ml-[26px] mt-1 text-[11.5px] text-text-3">Read, nothing new for your claim in it.</p>
              )}
              {f?.reading === "failed" && <p className="ml-[26px] mt-1 text-[11.5px] text-text-3">Attached. We couldn't read it automatically.</p>}
=======
              {f && scans[slot.kind] && <ScanSummary scan={scans[slot.kind]!} answers={answers} />}
>>>>>>> Stashed changes
              {!f && (
                <button onClick={() => void addDemo(slot)} className="ml-[26px] mt-1 inline-flex items-center gap-1 text-[11.5px] text-link hover:underline">
                  <Sparkles className="size-3" /> Use demo file
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-[12px] text-action">{error}</p>}
    </div>
  );
}

/** What was read from one document, each answer with the text it came from */
function ScanSummary({ scan, answers }: { scan: ScanResponse; answers?: ReportAnswers }) {
  const items = Object.entries(scan.findings) as [AnswerKey, NonNullable<ScanResponse["findings"][keyof ScanResponse["findings"]]>][];
  const plateDiffers = !!scan.seen.plate && !!answers?.plate && plateKey(scan.seen.plate) !== plateKey(answers.plate);
  if (!items.length)
    return scan.note ? <p className="ml-[26px] mt-1.5 text-[11.5px] text-text-3">{scan.note}</p> : null;
  return (
    <div className="ml-[26px] mt-2">
      <p className="label-mono flex items-center gap-1 text-[9.5px]">
        <ScanText className="size-3" /> Read from the document
      </p>
      <ul className="mt-1 space-y-0.5">
        {items.map(([k, f]) => {
          const q = QUESTIONS.find((x) => x.key === k);
          const shown = q ? answerLabel(q, { ...EMPTY_ANSWERS, [k]: f.value }) : f.value;
          const mine = String(answers?.[k] ?? "").trim();
          const differs = !!mine && mine !== "unsure" && mine !== f.value;
          return (
            <li key={k} title={`From: "${f.evidence}"`} className="flex items-baseline gap-1.5 text-[11.5px] leading-snug">
              <span className="shrink-0 text-text-3">{q?.label ?? k}</span>
              <span className="min-w-0 truncate font-medium">{shown}</span>
              {f.source === "ai" && <span className="label-mono shrink-0 text-[9px] text-text-3">AI</span>}
              {differs && <span className="shrink-0 text-[11px] text-action">· you said otherwise</span>}
            </li>
          );
        })}
      </ul>
      {plateDiffers && (
        <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-action">
          <TriangleAlert className="size-3" /> The plate on this document ({scan.seen.plate}) is not the one you gave.
        </p>
      )}
    </div>
  );
}
