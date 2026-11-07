import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Bot, Check, ChevronRight, Clock, FileQuestion, Mail, Phone, Plus, Search, User, X } from "lucide-react";
import { Logo } from "@/components/triage/Logo";
import { MiaCall } from "@/components/triage/MiaCall";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { findMyClaims, getMyClaim, type MyClaimDetail, type MyClaimSummary, type PortalEvent } from "@/lib/claim-status.functions";
import { CUSTOMER_STATUS_LABEL, type CustomerStatus } from "@/lib/customer-status";
import { cn } from "@/lib/utils";

// Public customer portal: enter the number plate, see all your claims, open one for its phase,
// what happens next, what you told us and a customer-safe history. Demo: no further identity check.
type Search = { plate?: string; case?: string };

export const Route = createFileRoute("/status")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s.plate === "string" && s.plate ? { plate: s.plate } : {}),
    ...(typeof s.case === "string" && s.case ? { case: s.case } : {}),
  }),
  head: () => ({
    meta: [
      { title: "My claims — Clearpath" },
      { name: "description", content: "See all your motor claims, where each one stands and what happens next." },
    ],
  }),
  component: StatusPage,
});

const TONE: Record<CustomerStatus, { pill: string; icon: typeof Check }> = {
  in_review: { pill: "pill-wait", icon: Clock },
  information_needed: { pill: "pill-wait", icon: FileQuestion },
  accepted: { pill: "bg-[oklch(0.95_0.05_152)] text-ok", icon: Check },
  rejected: { pill: "pill-action", icon: X },
};

const NEXT: Record<CustomerStatus, { title: string; text: string }> = {
  information_needed: {
    title: "We need something from you",
    text: "As soon as we have the items below, your claim is checked again automatically. The quickest way: talk to Mia for a minute.",
  },
  in_review: {
    title: "A claims specialist is looking at your claim",
    text: "There's nothing you need to do. We'll email you once a decision is made, usually within two working days.",
  },
  accepted: {
    title: "Your claim is accepted",
    text: "We'll confirm the settlement and the next steps with your repair shop by email.",
  },
  rejected: {
    title: "We can't accept this claim",
    text: "We've emailed you the reason. If something is wrong, reply to that email and we'll look again.",
  },
};

const fmt = (iso: string | null | undefined, time = false) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) })
    : "";

function StatusPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/status" });
  const [plate, setPlate] = useState(search.plate ?? "");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<MyClaimSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: string, quiet = false) => {
    if (!quiet) {
      setBusy(true);
      setError(null);
    }
    try {
      setList(await findMyClaims({ data: { plate: p } }));
    } catch (e) {
      if (!quiet) setError((e as Error).message);
    } finally {
      if (!quiet) setBusy(false);
    }
  }, []);

  // Auto-lookup when the plate comes in the link; keep refreshing so an incoming call shows up in the list
  useEffect(() => {
    if (!search.plate) {
      setList(null);
      return;
    }
    setPlate(search.plate);
    void load(search.plate);
    if (search.case) return;
    const p = search.plate;
    const t = window.setInterval(() => void load(p, true), 3000);
    return () => window.clearInterval(t);
  }, [search.plate, search.case, load]);

  const calling = !search.case ? list?.find((c) => c.incoming_call) : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!plate.trim()) return;
    const c = ref.trim().toUpperCase();
    void navigate({ search: { plate: plate.trim(), ...(c ? { case: c } : {}) } });
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-[860px] items-center justify-between px-5 py-5">
        <Link to="/report" aria-label="Clearpath home">
          <Logo />
        </Link>
        <Button asChild className="h-10 rounded-full bg-link px-5 text-white hover:bg-link/90">
          <Link to="/report">
            <Plus /> Report new damage
          </Link>
        </Button>
      </header>

      <main className="mx-auto max-w-[860px] px-5 pb-20">
        {search.plate && search.case ? (
          <ClaimDetail plate={search.plate} caseId={search.case} onBack={() => void navigate({ search: { plate: search.plate } })} />
        ) : (
          <>
            <h1 className="mt-6 text-[34px] font-semibold tracking-tight">My claims</h1>
            <p className="mt-2 text-[15px] text-text-2">Enter your number plate to see every claim for your car and where it stands.</p>

            <form onSubmit={submit} className="card-quiet mt-6 grid gap-4 p-6 sm:grid-cols-[1.2fr_1fr_auto] sm:items-end">
              <div>
                <Label htmlFor="plate">Number plate</Label>
                <Input id="plate" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="e.g. KS AB 1234" className="mt-1.5 h-11 font-mono uppercase" required />
              </div>
              <div>
                <Label htmlFor="ref">Claim reference <span className="text-text-3">(optional)</span></Label>
                <Input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="WEB-123456" className="mt-1.5 h-11 font-mono uppercase" />
              </div>
              <Button type="submit" disabled={busy} className="h-11 rounded-full bg-link px-6 text-white hover:bg-link/90">
                <Search /> {busy ? "Looking…" : "Check status"}
              </Button>
            </form>

            {error && <p className="mt-4 text-[14px] text-action">{error}</p>}

            {calling && (
              <button
                onClick={() => void navigate({ search: { plate: search.plate, case: calling.case_id } })}
                className="mt-6 flex w-full animate-pulse items-center gap-3 rounded-[14px] bg-ok px-5 py-4 text-left text-white shadow-lg"
              >
                <Phone className="size-5" />
                <span className="flex-1 text-[15px] font-semibold">Clearpath is calling you about {calling.case_id}</span>
                <span className="rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-ok">Answer</span>
              </button>
            )}

            {list && (
              <section className="mt-8">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-[18px] font-semibold">
                    {list.length ? `${list.length} claim${list.length > 1 ? "s" : ""} for ${search.plate?.toUpperCase()}` : "No claims found"}
                  </h2>
                </div>
                {list.length === 0 ? (
                  <p className="card-quiet mt-4 p-5 text-[14px] text-text-2">
                    We couldn't find a claim for this plate. Check the spelling, or{" "}
                    <Link to="/report" className="text-link underline-offset-2 hover:underline">report new damage</Link>.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {list.map((c) => (
                      <li key={c.case_id}>
                        <button
                          onClick={() => void navigate({ search: { plate: search.plate, case: c.case_id } })}
                          className="card-quiet flex w-full items-center gap-4 p-5 text-left transition hover:ring-2 hover:ring-link/30"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusPill s={c.status} />
                              {c.incoming_call && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-ok px-2.5 py-1 text-[12px] font-semibold text-white">
                                  <Phone className="size-3" /> Mia is calling
                                </span>
                              )}
                              <span className="font-mono text-[12.5px] text-text-3">{c.case_id}</span>
                            </div>
                            <p className="mt-2 truncate text-[14.5px]">{c.summary ?? "Motor claim"}</p>
                            <p className="mt-1 text-[12.5px] text-text-3">
                              Reported {fmt(c.received_at)} · last update {fmt(c.updated_at, true)}
                            </p>
                          </div>
                          <ChevronRight className="size-5 shrink-0 text-text-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function StatusPill({ s, big }: { s: CustomerStatus; big?: boolean }) {
  const t = TONE[s];
  const Icon = t.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full font-semibold", t.pill, big ? "px-3.5 py-1.5 text-[15px]" : "px-2.5 py-1 text-[12.5px]")}>
      <Icon className={big ? "size-4" : "size-3.5"} strokeWidth={2.2} /> {CUSTOMER_STATUS_LABEL[s]}
    </span>
  );
}

function Phases({ s }: { s: CustomerStatus }) {
  const decided = s === "accepted" || s === "rejected";
  const steps = [
    { label: "Received", done: true, current: false, color: "var(--link)" },
    { label: "Checked", done: true, current: false, color: "var(--link)" },
    {
      label: s === "information_needed" ? "Info needed from you" : "With a specialist",
      done: decided || s === "in_review" || s === "information_needed",
      current: !decided,
      color: "var(--wait-dot)",
    },
    { label: decided ? CUSTOMER_STATUS_LABEL[s] : "Decision", done: decided, current: decided, color: s === "rejected" ? "var(--action-dot)" : "var(--ok-dot)" },
  ];
  return (
    <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Progress">
      {steps.map((st, i) => (
        <li key={i} className="text-center" aria-current={st.current ? "step" : undefined}>
          <div
            className={cn("rounded-full", st.current ? "h-2.5" : "mt-0.5 h-1.5", !st.done && "bg-surface-2 ring-1 ring-line")}
            style={
              st.done
                ? {
                    background: st.current ? st.color : `color-mix(in oklch, ${st.color} 40%, var(--surface))`,
                    boxShadow: st.current ? `0 0 0 4px color-mix(in oklch, ${st.color} 18%, transparent)` : undefined,
                  }
                : undefined
            }
          />
          <p className={cn("mt-2.5 text-[12.5px]", st.current ? "font-semibold text-foreground" : st.done ? "text-text-2" : "text-text-3")}>{st.label}</p>
        </li>
      ))}
    </ol>
  );
}

const EVENT_ICON: Record<PortalEvent["kind"], typeof Check> = { system: Bot, customer: User, us: Mail, call: Phone };

function ClaimDetail({ plate, caseId, onBack }: { plate: string; caseId: string; onBack: () => void }) {
  const [d, setD] = useState<MyClaimDetail | null | undefined>(undefined);
  const [selfCall, setSelfCall] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await getMyClaim({ data: { plate, case_id: caseId } }));
    } catch {
      setD(null);
    }
  }, [plate, caseId]);

  // Poll so an incoming call from the reviewer shows up while the page is open
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(t);
  }, [load]);

  const back = (
    <button onClick={onBack} className="mt-4 inline-flex items-center gap-1.5 text-[14px] text-link hover:underline">
      <ArrowLeft className="size-4" /> All my claims
    </button>
  );

  if (d === undefined) return <>{back}<p className="mt-8 text-[14px] text-text-2">Loading…</p></>;
  if (d === null)
    return (
      <>
        {back}
        <p className="card-quiet mt-6 p-5 text-[14px] text-text-2">We couldn't find this claim for plate {plate.toUpperCase()}.</p>
      </>
    );

  const call = d.call ?? (selfCall ? { requested_at: selfCall, missing_items: d.missing_fields } : null);
  const next = NEXT[d.status];

  return (
    <>
      {back}
      <section className="card-quiet mt-4 p-6" aria-live="polite">
        <p className="text-[13px] text-text-2">
          {d.first_name ? `Hello ${d.first_name}, this` : "This"} is claim <span className="font-mono text-foreground">{d.case_id}</span>
          {d.plate && <> · <span className="font-mono">{d.plate}</span></>}
        </p>
        <div className="mt-3"><StatusPill s={d.status} big /></div>
        {d.summary && <p className="mt-3 text-[15px]">{d.summary}</p>}
        <Phases s={d.status} />
      </section>

      {notice && <p className="mt-4 rounded-[12px] bg-surface-2 px-4 py-3 text-[14px] ring-1 ring-line">{notice}</p>}

      {call ? (
        <MiaCall
          caseId={d.case_id}
          firstName={d.first_name}
          items={call.missing_items.length ? call.missing_items : d.missing_fields}
          requestedAt={call.requested_at}
          who={{ plate }}
          onFinished={(msg) => {
            setSelfCall(null);
            setNotice(msg);
            void load();
          }}
        />
      ) : (
        <section className="card-quiet mt-6 p-6">
          <p className="label-mono">What happens next</p>
          <h2 className="mt-2 text-[18px] font-semibold">{next.title}</h2>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-text-2">{next.text}</p>
          {d.missing.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {d.missing.map((m) => (
                <li key={m} className="flex items-start gap-2 text-[14px]">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-wait-dot" /> {m}
                </li>
              ))}
            </ul>
          )}
          {d.status === "information_needed" && d.can_call && (
            <Button onClick={() => setSelfCall(new Date().toISOString())} className="mt-5 h-11 rounded-full bg-link px-6 text-white hover:bg-link/90">
              <Phone /> Talk to Mia now
            </Button>
          )}
        </section>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="card-quiet p-6">
          <p className="label-mono">What you told us</p>
          <dl className="mt-3 space-y-2.5">
            {d.facts.map((f) => (
              <div key={f.label} className="flex justify-between gap-4 text-[14px]">
                <dt className="text-text-2">{f.label}</dt>
                <dd className={cn("text-right", !f.value && "text-text-3")}>{f.value ?? "Not given yet"}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="card-quiet p-6">
          <p className="label-mono">History</p>
          <ol className="mt-3 space-y-3">
            {[...d.events].reverse().map((e, i) => {
              const Icon = EVENT_ICON[e.kind];
              return (
                <li key={i} className="flex gap-3 text-[14px]">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 ring-1 ring-line">
                    <Icon className="size-3.5 text-text-2" />
                  </span>
                  <div>
                    <p>{e.text}</p>
                    <p className="text-[12px] text-text-3">{fmt(e.at, true)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={onBack} variant="outline" className="h-11 rounded-full px-5">
          <ArrowLeft /> All my claims
        </Button>
        <Button asChild className="h-11 rounded-full bg-link px-5 text-white hover:bg-link/90">
          <Link to="/report"><Plus /> Report new damage</Link>
        </Button>
      </div>
    </>
  );
}
