import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ComponentType, ReactNode } from "react";
import {
  BatteryCharging,
  Car,
  ChevronDown,
  Copy,
  Euro,
  FileText,
  FileWarning,
  HeartPulse,
  Receipt,
  Scale,
  ShieldOff,
  Wrench,
} from "lucide-react";
import { activePolicyQuery, policyVersionsQuery } from "@/lib/data";
import { NewPolicyDialog } from "@/components/triage/NewPolicyDialog";
import { DeleteDraftButton } from "@/components/triage/DeleteDraftButton";
import { PageHeader, StatusDot, fmtEur } from "@/components/triage/ui";
import { fieldsUsed } from "@/lib/policy-text";
import { FIELD_LABELS, type Policy, type Recommendation } from "@/lib/triage";

export const Route = createFileRoute("/_authenticated/policy")({
  head: () => ({
    meta: [
      { title: "Policy — Clearpath" },
      { name: "description", content: "The active triage policy." },
    ],
  }),
  component: PolicyPage,
});

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;
// short: what the chip says. full: the precise rule, shown on hover / to screen readers.
type Cond = { icon: Icon; short: string; full: string };

const FLAG: Record<string, Cond> = {
  injury_reported: { icon: HeartPulse, short: "Injury", full: "Someone reports an injury" },
  liability_disputed: {
    icon: Scale,
    short: "Fault disputed",
    full: "The drivers dispute who caused the accident",
  },
  duplicate_flag: {
    icon: Copy,
    short: "Possible duplicate",
    full: "The claim may have been submitted twice",
  },
  evidence_conflict: {
    icon: FileWarning,
    short: "Evidence conflict",
    full: "The evidence contradicts itself, e.g. photo date vs incident date",
  },
};
const DOC: Record<string, Cond> = {
  incident_report_present: {
    icon: FileText,
    short: "Incident report",
    full: "The incident report",
  },
  itemized_quote_present: {
    icon: Receipt,
    short: "Itemized quote",
    full: "A repair quote with line items, not just a total",
  },
};
const VALUE: Record<string, string> = {
  motor_own_damage: "own damage",
  theft: "theft",
  glass: "glass",
  ev_high_voltage_battery: "EV battery",
  standard: "standard repair",
};
const human = (k: string) => VALUE[k] ?? k.replace(/_/g, " ");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fieldName = (f: string) => cap(FIELD_LABELS[f] ?? f.replace(/_/g, " "));
const join = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;

function reviewConditions(p: Policy): Cond[] {
  const hr = p.human_review;
  const out: Cond[] = [];
  if (hr.require_policy_active)
    out.push({
      icon: ShieldOff,
      short: "Policy inactive",
      full: "The policy was not active on the incident date",
    });
  if (hr.allowed_claim_types.length)
    out.push({
      icon: Car,
      short: `Not ${join(hr.allowed_claim_types.map(human))}`,
      full: `The claim type is not ${join(hr.allowed_claim_types.map(human))}`,
    });
  for (const f of hr.flag_fields)
    out.push(
      FLAG[f] ?? { icon: FileWarning, short: fieldName(f), full: `${fieldName(f)} is true` },
    );
  if (hr.quote_limit_eur !== null)
    out.push({
      icon: Euro,
      short: `Quote over ${fmtEur(hr.quote_limit_eur)}`,
      full: `The repair quote is above ${fmtEur(hr.quote_limit_eur)}; exactly ${fmtEur(hr.quote_limit_eur)} is still routine`,
    });
  for (const t of hr.review_repair_types)
    out.push({
      icon: t === "ev_high_voltage_battery" ? BatteryCharging : Wrench,
      short: cap(human(t)),
      full: `The repair involves ${t === "ev_high_voltage_battery" ? "an electric car's high-voltage battery" : human(t)}`,
    });
  return out;
}

/** The whole policy in one plain sentence. Generated, so a new version reads correctly. */
function summary(p: Policy): string {
  const hr = p.human_review;
  const extra = [
    hr.quote_limit_eur !== null ? `the quote is over ${fmtEur(hr.quote_limit_eur)}` : null,
    hr.review_repair_types.length
      ? `it involves ${join(hr.review_repair_types.map(human))} work`
      : null,
  ].filter(Boolean) as string[];
  const person = ["there is a red flag", ...extra];
  const docs = p.required_documents.map((d) => (DOC[d]?.short ?? fieldName(d)).toLowerCase());
  return `A claim goes to a person if ${join(person)}. Otherwise we ask the customer for anything unknown or missing${
    docs.length ? `, like the ${join(docs)}` : ""
  }. Everything else is processed routinely.`;
}

function Chip({ c }: { c: Cond }) {
  return (
    <li
      title={c.full}
      className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[12.5px] ring-1 ring-line/70"
    >
      <c.icon className="size-3.5 shrink-0 text-text-2" strokeWidth={1.7} />
      <span>{c.short}</span>
      <span className="sr-only">: {c.full}</span>
    </li>
  );
}

function Row({
  n,
  title,
  outcome,
  rule,
  children,
}: {
  n: number;
  title: string;
  outcome: Recommendation;
  rule: string;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[28px_1fr] gap-x-4 px-5 py-4 sm:px-6">
      <span className="num mt-px flex size-7 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold text-text-2 ring-1 ring-line">
        {n}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 className="text-[15px] font-medium">{title}</h2>
          <span className="flex items-center gap-2">
            <StatusDot rec={outcome} />
            <span
              className="font-mono text-[11px] text-text-3"
              title="Rule ID stored with every decision"
            >
              {rule}
            </span>
          </span>
        </div>
        <div className="mt-2.5">{children}</div>
      </div>
    </li>
  );
}

function PolicyPage() {
  const { data: p } = useQuery(activePolicyQuery);
  const { data: versions = [] } = useQuery(policyVersionsQuery);
  if (!p) return <p className="label-mono">Loading</p>;
  const v = p.version;
  const review = reviewConditions(p);
  const fields = fieldsUsed(p);
  const docs = p.required_documents.map(
    (d) => DOC[d] ?? { icon: FileText, short: fieldName(d), full: fieldName(d) },
  );
  const drafts = versions.filter((x) => x.status === "draft");

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader
        eyebrow={`Policy ${v} · active`}
        title="How a claim is decided"
        right={<NewPolicyDialog base={p} existingIds={versions.map((x) => x.id)} />}
      />

      <p className="mb-6 max-w-[64ch] text-[17px] leading-relaxed text-text-2">{summary(p)}</p>

      <ol className="card-quiet divide-y divide-line p-0">
        <Row n={1} title="Needs a person?" outcome="human_review" rule={`${v}.R1`}>
          <p className="mb-2 text-[13px] text-text-2">Any one of these is enough:</p>
          <ul className="flex flex-wrap gap-1.5">
            {review.map((c) => (
              <Chip key={c.short} c={c} />
            ))}
          </ul>
        </Row>

        <Row n={2} title="Anything unknown?" outcome="request_information" rule={`${v}.BLANK`}>
          <details className="group text-[13px]">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-text-2 hover:text-foreground [&::-webkit-details-marker]:hidden">
              A field we need is blank or unreadable. We never guess.
              <span className="inline-flex items-center gap-0.5 text-link">
                Show {fields.length} fields
                <ChevronDown
                  className="size-3.5 transition-transform group-open:rotate-180"
                  strokeWidth={1.8}
                />
              </span>
            </summary>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {fields.map((f) => (
                <li
                  key={f}
                  className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] text-text-2"
                >
                  {fieldName(f)}
                </li>
              ))}
            </ul>
          </details>
        </Row>

        <Row n={3} title="Documents missing?" outcome="request_information" rule={`${v}.R2`}>
          <ul className="flex flex-wrap gap-1.5">
            {docs.map((c) => (
              <Chip key={c.short} c={c} />
            ))}
          </ul>
        </Row>

        <Row n={4} title="All clear" outcome="routine_processing" rule={`${v}.R3`}>
          <p className="text-[13px] text-text-2">
            Goes into the normal claims process. This is not a payment approval.
          </p>
        </Row>
      </ol>

      <p className="mt-4 text-[12.5px] text-text-3">
        Checked from top to bottom; the first match decides. A red flag always wins over missing
        information.
      </p>

      {drafts.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2 text-[13px] font-medium text-text-2">Drafts waiting for review</h2>
          <ul className="card-quiet divide-y divide-line p-0 text-[13px]">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0 truncate">
                  <span className="font-mono">{d.id}</span>
                  {d.description && <span className="ml-2 text-text-2">{d.description}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-4">
                  <Link to="/impact" search={{ v: d.id }} className="text-link hover:underline">
                    See impact
                  </Link>
                  <DeleteDraftButton version={d} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
