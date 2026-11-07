import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ComponentType, ReactNode } from "react";
import {
  BatteryCharging,
  Car,
  CircleCheck,
  Copy,
  Euro,
  FileText,
  FileWarning,
  HeartPulse,
  Receipt,
  Scale,
  Search,
  ShieldOff,
  Wrench,
} from "lucide-react";
import { activePolicyQuery } from "@/lib/data";
import { Mono, PageHeader, fmtEur } from "@/components/triage/ui";
import { FIELD_LABELS, type Policy } from "@/lib/triage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/policy")({
  head: () => ({ meta: [{ title: "Policy — Triage" }, { name: "description", content: "The active triage policy." }] }),
  component: PolicyPage,
});

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;
type Item = { icon: Icon; text: ReactNode };
type Tone = "action" | "wait" | "ok";

// Plain-language wording for the fields the policy JSON refers to.
// Unknown keys fall back to a readable version of the key, so a new policy version never breaks this page.
const FLAG_TEXT: Record<string, { icon: Icon; text: string }> = {
  injury_reported: { icon: HeartPulse, text: "Someone was injured" },
  liability_disputed: { icon: Scale, text: "It is disputed who caused the accident" },
  duplicate_flag: { icon: Copy, text: "The claim may have been submitted twice" },
  evidence_conflict: { icon: FileWarning, text: "The evidence contradicts itself" },
};
const DOC_TEXT: Record<string, { icon: Icon; text: string }> = {
  incident_report_present: { icon: FileText, text: "Incident report" },
  itemized_quote_present: { icon: Receipt, text: "Itemized repair quote (line by line, not just a total)" },
};
const VALUE_TEXT: Record<string, string> = {
  motor_own_damage: "damage to the customer's own car",
  theft: "theft",
  ev_high_voltage_battery: "an electric car's high-voltage battery",
  standard: "a standard repair",
};

const human = (k: string) => VALUE_TEXT[k] ?? k.replace(/_/g, " ");
const list = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;
const fieldName = (f: string) => {
  const s = FIELD_LABELS[f] ?? f.replace(/_(present|flag|reported)$/, "").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function reviewTriggers(p: Policy): Item[] {
  const hr = p.human_review;
  const items: Item[] = [];
  if (hr.require_policy_active) items.push({ icon: ShieldOff, text: "The insurance policy was not active on the day of the incident" });
  if (hr.allowed_claim_types.length)
    items.push({ icon: Car, text: <>The claim is about something other than {list(hr.allowed_claim_types.map(human))}</> });
  for (const f of hr.flag_fields) items.push(FLAG_TEXT[f] ?? { icon: FileWarning, text: `${fieldName(f)} is flagged` });
  if (hr.quote_limit_eur !== null)
    items.push({
      icon: Euro,
      text: (
        <>
          The repair quote is above {fmtEur(hr.quote_limit_eur)}{" "}
          <span className="text-text-2">(exactly {fmtEur(hr.quote_limit_eur)} is still fine)</span>
        </>
      ),
    });
  if (hr.review_repair_types.length)
    items.push({
      icon: hr.review_repair_types.includes("ev_high_voltage_battery") ? BatteryCharging : Wrench,
      text: <>The repair involves {list(hr.review_repair_types.map(human))}</>,
    });
  return items;
}

function checkedFields(p: Policy): string[] {
  const hr = p.human_review;
  const f: string[] = [];
  if (hr.require_policy_active) f.push("policy_active_on_incident");
  if (hr.allowed_claim_types.length) f.push("claim_type");
  f.push(...hr.flag_fields);
  if (hr.quote_limit_eur !== null) f.push("quote_eur");
  if (hr.review_repair_types.length) f.push("repair_type");
  f.push(...p.required_documents);
  return f;
}

const TONE: Record<Tone, { pill: string; badge: string; label: string }> = {
  action: { pill: "pill-action", badge: "bg-gradient-to-br from-[oklch(0.75_0.14_38)] to-[oklch(0.6_0.18_30)]", label: "Human review" },
  wait: { pill: "pill-wait", badge: "bg-gradient-to-br from-[oklch(0.84_0.13_80)] to-[oklch(0.7_0.15_66)]", label: "Request info" },
  ok: {
    pill: "bg-[oklch(0.96_0.04_152)] text-ok shadow-[inset_0_0_0_1px_oklch(0.88_0.07_152)]",
    badge: "bg-gradient-to-br from-[oklch(0.78_0.13_155)] to-[oklch(0.6_0.14_152)]",
    label: "Routine processing",
  },
};

function Outcome({ tone, children }: { tone: Tone; children?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-medium", TONE[tone].pill)}>
      <span className="size-1.5 rounded-full bg-current opacity-80" />
      {children ?? TONE[tone].label}
    </span>
  );
}

function Step({
  n,
  ruleId,
  tone,
  title,
  lead,
  last,
  children,
}: {
  n: number;
  ruleId: string;
  tone: Tone;
  title: string;
  lead: ReactNode;
  last?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="relative flex gap-5">
      <div className="flex flex-col items-center">
        <span className={cn("z-10 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold text-white shadow-[var(--shadow-lift)] ring-4 ring-white/70", TONE[tone].badge)}>
          {n}
        </span>
        {!last && <span className="w-px flex-1 bg-gradient-to-b from-[oklch(0.8_0.03_258)] to-transparent" />}
      </div>
      <div className={cn("card-quiet mb-5 flex-1 p-6", last && "mb-0")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">{title}</h2>
          <div className="flex items-center gap-2">
            <Outcome tone={tone} />
            <Mono className="rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-text-3" >{ruleId}</Mono>
          </div>
        </div>
        <p className="mt-1.5 text-[14px] text-text-2">{lead}</p>
        {children && <div className="mt-4">{children}</div>}
      </div>
    </li>
  );
}

function Conditions({ items }: { items: Item[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3 rounded-[12px] bg-white/70 px-3.5 py-3 text-[13.5px] ring-1 ring-line/70">
          <it.icon className="mt-0.5 size-4 shrink-0 text-text-2" strokeWidth={1.6} />
          <span>{it.text}</span>
        </li>
      ))}
    </ul>
  );
}

function PolicyPage() {
  const { data: p } = useQuery(activePolicyQuery);
  if (!p) return <p className="label-mono">Loading</p>;
  const v = p.version.toUpperCase();
  const triggers = reviewTriggers(p);
  const fields = checkedFields(p);
  const docs: Item[] = p.required_documents.map((d) => DOC_TEXT[d] ?? { icon: FileText, text: fieldName(d) });

  return (
    <div className="mx-auto max-w-[880px]">
      <PageHeader
        eyebrow={`Policy ${p.version} · active`}
        title="How a claim is decided"
        sub="Every claim goes through these four checks from top to bottom. The first check that applies decides the next step. Rules decide, people confirm."
      />

      <div className="card-quiet mb-8 flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
        <span className="label-mono">Possible outcomes</span>
        <span className="flex items-center gap-2 text-[13px] text-text-2"><Outcome tone="action" /> a person looks at it</span>
        <span className="flex items-center gap-2 text-[13px] text-text-2"><Outcome tone="wait" /> we ask the customer</span>
        <span className="flex items-center gap-2 text-[13px] text-text-2"><Outcome tone="ok">Routine</Outcome> normal process</span>
      </div>

      <ol>
        <Step
          n={1}
          ruleId={`${v}.R1`}
          tone="action"
          title="Does a person need to look at it?"
          lead="If any one of these is true, the claim goes straight to a reviewer."
        >
          <Conditions items={triggers} />
        </Step>

        <Step
          n={2}
          ruleId={`${v}.BLANK`}
          tone="wait"
          title="Is any information blank or unreadable?"
          lead="If a field we need is empty or can't be read, we ask the customer. We never guess and never treat a blank as “no”."
        >
          <div className="flex flex-wrap gap-1.5">
            {fields.map((f) => (
              <span key={f} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[12.5px] text-text-2 ring-1 ring-line/70">
                <Search className="size-3" strokeWidth={1.8} />
                {fieldName(f)}
              </span>
            ))}
          </div>
        </Step>

        <Step
          n={3}
          ruleId={`${v}.R2`}
          tone="wait"
          title="Are documents missing?"
          lead="We request anything from this list that the customer hasn't sent yet. Once it arrives, the claim is checked again."
        >
          <Conditions items={docs} />
        </Step>

        <Step
          n={4}
          ruleId={`${v}.R3`}
          tone="ok"
          title="Everything is in order"
          lead="The claim goes into the normal claims process automatically."
          last
        >
          <div className="flex items-start gap-3 rounded-[12px] bg-white/70 px-3.5 py-3 text-[13.5px] ring-1 ring-line/70">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={1.6} />
            <span>
              Routine means the claim continues as normal. <span className="text-text-2">It is not a payment approval.</span>
            </span>
          </div>
        </Step>
      </ol>

      <p className="mt-8 text-center text-[12.5px] text-text-2">
        Every recommendation stores the policy version and the check that produced it, for example{" "}
        <span className="font-mono text-[11.5px]">{v}.R1</span>.
      </p>
    </div>
  );
}
