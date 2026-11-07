import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Clock, FileQuestion, Lock, Search, X } from "lucide-react";
import { Logo } from "@/components/triage/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getClaimStatus, type StatusResult } from "@/lib/claim-status.functions";
import {
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_STATUS_TEXT,
  type CustomerStatus,
} from "@/lib/customer-status";
import { cn } from "@/lib/utils";

// Public page: customers check the status of their claim with the claim number and number plate.
export const Route = createFileRoute("/status")({
  validateSearch: (s: Record<string, unknown>): { case?: string } =>
    typeof s.case === "string" ? { case: s.case } : {},
  head: () => ({
    meta: [
      { title: "Check your claim — Clearpath" },
      {
        name: "description",
        content:
          "See where your motor claim stands: in review, information needed, accepted or rejected.",
      },
    ],
  }),
  component: StatusPage,
});

const TONE: Record<CustomerStatus, { pill: string; icon: typeof Check }> = {
  in_review: { pill: "bg-link/10 text-link", icon: Clock },
  information_needed: { pill: "pill-wait", icon: FileQuestion },
  accepted: { pill: "bg-[oklch(0.95_0.05_152)] text-ok", icon: Check },
  rejected: { pill: "pill-action", icon: X },
};

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

function StatusPage() {
  const search = Route.useSearch();
  const [caseId, setCaseId] = useState(search.case ?? "");
  const [plate, setPlate] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (search.case) setCaseId(search.case);
  }, [search.case]);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await getClaimStatus({ data: { case_id: caseId, plate } }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-5">
        <Link to="/report" className="flex items-center gap-2.5">
          <Logo />
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight">Clearpath</span>
            <span className="label-mono mt-1 text-[9.5px]">Motor claims</span>
          </span>
        </Link>
        <Link to="/report" className="text-[13px] text-text-2 hover:text-foreground">
          Report a new claim
        </Link>
      </header>

      <main className="mx-auto max-w-[620px] px-6 pb-16 pt-6">
        <h1 className="text-[32px] font-semibold tracking-[-0.02em]">Check your claim</h1>
        <p className="mt-2 text-[15px] text-text-2">
          Enter your reference number and your car's number plate.
        </p>

        <form
          onSubmit={check}
          className="card-quiet mt-6 grid gap-4 p-6 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <div className="space-y-1.5">
            <Label htmlFor="case">Reference number</Label>
            <Input
              id="case"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder="e.g. WEB-123456"
              required
              className="bg-white font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plate">Number plate</Label>
            <Input
              id="plate"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="e.g. M-AK 1000"
              required
              className="bg-white font-mono uppercase"
            />
          </div>
          <Button type="submit" disabled={busy}>
            <Search /> {busy ? "Checking…" : "Check"}
          </Button>
        </form>
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-text-3">
          <Lock className="size-3" /> We only show a claim when the number plate matches.
        </p>

        {error && <p className="mt-6 text-[14px] text-action">{error}</p>}
        {result && !result.found && (
          <p className="card-quiet mt-6 p-5 text-[14px] text-text-2">
            We couldn't find a claim with these details. Please check the reference number from your
            confirmation email and the number plate.
          </p>
        )}
        {result?.found && result.status && <StatusCard r={result as Required<StatusResult>} />}
      </main>
    </div>
  );
}

function StatusCard({ r }: { r: Required<StatusResult> }) {
  const t = TONE[r.status];
  const Icon = t.icon;
  const decided = r.status === "accepted" || r.status === "rejected";
  const steps = [
    { label: "Received", done: true },
    {
      label: r.status === "information_needed" ? "Information needed" : "Checking",
      done: decided,
      current: !decided,
    },
    {
      label: decided ? CUSTOMER_STATUS_LABEL[r.status] : "Decision",
      done: decided,
      current: decided,
    },
  ];
  return (
    <section className="card-quiet mt-6 p-6" aria-live="polite">
      <p className="text-[13px] text-text-2">
        {r.first_name ? `Hello ${r.first_name}, here` : "Here"} is claim{" "}
        <span className="font-mono text-foreground">{r.case_id}</span>
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[16px] font-semibold",
            t.pill,
          )}
        >
          <Icon className="size-4" strokeWidth={2.2} /> {CUSTOMER_STATUS_LABEL[r.status]}
        </span>
      </div>
      <p className="mt-3 text-[14.5px] leading-relaxed">{CUSTOMER_STATUS_TEXT[r.status]}</p>

      {r.missing.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {r.missing.map((m) => (
            <li key={m} className="flex items-start gap-2 text-[14px]">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-wait-dot" /> {m}
            </li>
          ))}
        </ul>
      )}

      <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={i} className="text-center">
            <div
              className={cn(
                "h-1.5 rounded-full",
                s.done
                  ? "bg-foreground/70"
                  : s.current
                    ? "bg-link"
                    : "bg-surface-2 ring-1 ring-line",
              )}
            />
            <p
              className={cn(
                "mt-2 text-[12px]",
                s.current ? "font-medium text-foreground" : "text-text-2",
              )}
            >
              {s.label}
            </p>
          </li>
        ))}
      </ol>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px]">
        <div>
          <dt className="text-text-2">Received</dt>
          <dd>{fmtDate(r.received_at)}</dd>
        </div>
        <div>
          <dt className="text-text-2">Last update</dt>
          <dd>{fmtDate(r.updated_at)}</dd>
        </div>
      </dl>
    </section>
  );
}
