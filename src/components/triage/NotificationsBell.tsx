// Bell in the top bar: what happened on claims since you last looked.
// Customer replies and uploads, Mia's calls, claims assigned to you and policy changes.
// Read state is a per-browser convenience (localStorage), nothing is written to the database.
import { useMemo, useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, FileUp, MessageSquareReply, PhoneOff, RefreshCw, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { casesQuery } from "@/lib/data";
import { useRole } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtTime } from "./ui";
import { cn } from "@/lib/utils";

type Ev = { id: string; case_id: string; type: string; actor: string | null; created_at: string; payload: Record<string, unknown> | null };
type Note = {
  key: string;
  at: string;
  title: string;
  sub: string;
  caseId: string | null;
  Icon: typeof Bell;
  tone: "action" | "wait" | "info";
};

const TYPES = ["message_received", "documents_received", "file_uploaded", "call_ended", "assigned", "policy_change"];
const DAYS = 7;

const notificationsQuery = queryOptions({
    queryKey: ["notifications"],
    queryFn: async (): Promise<Ev[]> => {
      const since = new Date(Date.now() - DAYS * 864e5).toISOString();
      const { data, error } = await supabase
        .from("case_events")
        .select("id,case_id,type,actor,created_at,payload")
        .in("type", TYPES)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Ev[];
    },
    refetchInterval: 30_000,
});

const seenKey = (user: string) => `triage.notificationsSeen.${user}`;
const readSeen = (user: string) => {
  try {
    return Number(localStorage.getItem(seenKey(user)) ?? 0) || 0;
  } catch {
    return 0;
  }
};

export function NotificationsBell() {
  const { me } = useRole();
  const navigate = useNavigate();
  const events = useQuery(notificationsQuery);
  const cases = useQuery(casesQuery);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => readSeen(me.id));

  const toReview = (cases.data ?? []).filter(
    (c) =>
      c.workflow &&
      c.claim.case_status?.toLowerCase() !== "closed" &&
      c.workflow.queue !== "done" &&
      (c.workflow.queue === "on_you" || c.workflow.qa_sample),
  );
  const mine = toReview.filter((c) => c.workflow?.assignee === me.name).length;

  const notes = useMemo(() => {
    const name = new Map((cases.data ?? []).map((c) => [c.claim.case_id, c.intake?.customer_name ?? null]));
    const out: Note[] = [];
    const policyDone = new Set<string>();
    for (const e of events.data ?? []) {
      const p = e.payload ?? {};
      const who = name.get(e.case_id) ?? "The customer";
      if (e.type === "message_received" || e.type === "documents_received" || e.type === "file_uploaded")
        out.push({
          key: e.id,
          at: e.created_at,
          title: e.type === "message_received" ? `${who} replied` : `${who} sent documents`,
          sub: `${e.case_id} · checked again automatically`,
          caseId: e.case_id,
          Icon: e.type === "message_received" ? MessageSquareReply : FileUp,
          tone: "info",
        });
      else if (e.type === "call_ended")
        out.push({
          key: e.id,
          at: e.created_at,
          title: p.outcome === "declined" ? `${who} declined Mia's call` : `Mia's call with ${who} ended`,
          sub: e.case_id,
          caseId: e.case_id,
          Icon: PhoneOff,
          tone: p.outcome === "declined" ? "wait" : "info",
        });
      else if (e.type === "assigned" && p.assignee === me.name && e.actor !== me.name) {
        // all assignments to you in one line (distributing can assign many at once)
        if (out.some((n) => n.key === "assigned")) continue;
        const mineEv = (events.data ?? []).filter(
          (x) => x.type === "assigned" && x.payload?.assignee === me.name && x.actor !== me.name,
        );
        out.push({
          key: "assigned",
          at: e.created_at,
          title: mineEv.length === 1 ? "A claim was assigned to you" : `${mineEv.length} claims assigned to you`,
          sub: `latest ${e.case_id}${e.actor ? ` · by ${e.actor}` : ""}`,
          caseId: mineEv.length === 1 ? e.case_id : null,
          Icon: UserPlus,
          tone: "action",
        });
      }
      else if (e.type === "policy_change") {
        // one line per policy switch, not one per claim
        const to = String(p.to_version ?? "");
        if (!to || policyDone.has(to)) continue;
        policyDone.add(to);
        const n = (events.data ?? []).filter((x) => x.type === "policy_change" && x.payload?.to_version === to).length;
        out.push({
          key: `policy-${to}`,
          at: e.created_at,
          title: `Policy ${to} activated`,
          sub: `${n} claim${n === 1 ? "" : "s"} changed – see “Policy change” in the workstream`,
          caseId: null,
          Icon: RefreshCw,
          tone: "info",
        });
      }
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);
  }, [events.data, cases.data, me.name]);

  const unread = notes.filter((n) => Date.parse(n.at) > seen).length;

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) {
      const now = Date.now();
      try {
        localStorage.setItem(seenKey(me.id), String(now));
      } catch {
        // storage unavailable: unread state just resets on reload
      }
      // keep the "new" marks visible while the panel is open; clear them on close
    } else setSeen(Date.now());
  };

  const go = (caseId: string | null) => {
    setOpen(false);
    setSeen(Date.now());
    if (caseId) void navigate({ to: "/claims/$caseId", params: { caseId } });
    else void navigate({ to: "/dashboard" });
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8" aria-label="Notifications" title="Notifications">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-action-dot px-1 text-[9px] font-semibold leading-none text-white">
              {unread > 5 ? "5+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
          <p className="text-[13px] font-semibold">Notifications</p>
          <p className="text-[11px] text-text-3">last {DAYS} days</p>
        </div>
        <button
          type="button"
          onClick={() => go(null)}
          className="flex w-full items-center justify-between gap-3 border-b border-line bg-surface-2/60 px-4 py-2.5 text-left text-[12px] hover:bg-surface-2"
        >
          <span>
            <span className="font-medium">{toReview.length} to review</span>
            <span className="text-text-2"> · {mine} assigned to you</span>
          </span>
          <span className="text-link">Open workstream →</span>
        </button>
        <ul className="max-h-[360px] overflow-y-auto">
          {notes.length === 0 && (
            <li className="px-4 py-8 text-center text-[12px] text-text-2">
              No new activity. Customer replies, Mia's calls and new assignments show up here.
            </li>
          )}
          {notes.map((n) => {
            const isNew = Date.parse(n.at) > seen;
            return (
              <li key={n.key}>
                <button
                  type="button"
                  onClick={() => go(n.caseId)}
                  className="flex w-full items-start gap-3 border-b border-line/70 px-4 py-2.5 text-left last:border-0 hover:bg-surface-2"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                      n.tone === "action" ? "bg-action-tint text-action" : n.tone === "wait" ? "bg-wait-tint text-wait" : "bg-link/10 text-link",
                    )}
                  >
                    <n.Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[12.5px]", isNew && "font-semibold")}>{n.title}</span>
                    <span className="block truncate text-[11.5px] text-text-2">{n.sub}</span>
                  </span>
                  <span className="shrink-0 text-[10.5px] text-text-3">{fmtTime(n.at)}</span>
                  {isNew && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-link" aria-label="new" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
