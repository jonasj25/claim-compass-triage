import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/triage/Logo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Bell, Download, LogOut, Play, Upload, ListTodo, Files, SlidersHorizontal, GitCompareArrows, History, ChartNoAxesCombined, ShieldCheck, Calculator, Settings } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RoleContext, useRole, ROLE_HOME, ROLE_LABELS, ROLE_NAV, initials, type Me, type Role } from "@/lib/role";
import { activePolicyQuery, casesQuery } from "@/lib/data";
import { toCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/" });
    return { user: data.user };
  },
  component: AppShell,
});

const ROLE_KEY = "triage.demoRole";

function AppShell() {
  const { user } = Route.useRouteContext();
  const meQuery = useQuery({
    queryKey: ["me", user.id],
    queryFn: async (): Promise<Me> => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("name,email").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      return {
        id: user.id,
        name: p.data?.name || user.email || "User",
        email: p.data?.email || user.email || "",
        role: ((r.data?.[0]?.role as Role) ?? "reviewer"),
      };
    },
  });

  const [role, setRoleState] = useState<Role | null>(null);
  useEffect(() => {
    if (!meQuery.data) return;
    const stored = localStorage.getItem(ROLE_KEY) as Role | null;
    setRoleState(stored && stored in ROLE_LABELS ? stored : meQuery.data.role);
  }, [meQuery.data]);

  const navigate = useNavigate();
  const setRole = (r: Role) => {
    localStorage.setItem(ROLE_KEY, r);
    setRoleState(r);
    navigate({ to: ROLE_HOME[r] });
  };

  if (!meQuery.data || !role) {
    return <div className="flex min-h-screen items-center justify-center label-mono">Loading</div>;
  }

  return (
    <RoleContext.Provider value={{ me: meQuery.data, role, setRole }}>
      <TooltipProvider delayDuration={150}><div className="min-h-screen pl-14">
        <TopBar />
        <SideNav />
        <div className="mx-auto max-w-[1440px] p-6">
          <main className="enterprise-content min-w-0">
            <Outlet />
          </main>
        </div>
      </div></TooltipProvider>
    </RoleContext.Provider>
  );
}

function TopBar() {
  const { me, role, setRole } = useRole();
  const policy = useQuery(activePolicyQuery);
  const cases = useQuery(casesQuery);
  const onMe = (cases.data ?? []).some(
    (c) => c.workflow && (c.workflow.queue === "on_you" || c.workflow.qa_sample) && c.workflow.assignee === me.name,
  );
  const path = useRouterState({ select: (s) => s.location.pathname });
  const title = path.startsWith("/claims/") ? `Workstream › ${decodeURIComponent(path.split("/").pop() ?? "")}` : path === "/dashboard" ? "Workstream" : ROLE_NAV[role].find((it) => it.to === path)?.label ?? (path === "/import" ? "Import CSV" : "Clearpath");
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between gap-4 border-b border-line bg-surface px-6">
      <div className="flex min-w-0 items-center gap-3"><span className="text-[13px] font-semibold">Clearpath</span><span className="text-text-3">/</span><span className="truncate text-[13px] text-text-2">{title}</span></div>
      <div className="flex shrink-0 items-center gap-3">
        <div role="tablist" aria-label="Role" className="flex rounded-md border border-line bg-surface-2 p-0.5">
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <Button key={r} role="tab" aria-selected={r === role} variant="ghost" size="sm" onClick={() => setRole(r)} className={cn("h-7 rounded px-2 text-[11px]", r === role ? "bg-surface text-foreground" : "text-text-2")}>{ROLE_LABELS[r]}</Button>)}
        </div>
        <span className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-text-2">Policy {policy.data?.version ?? "…"}</span>
        <Button variant="ghost" size="icon" className="relative size-8" title="Notifications" aria-label="Notifications" onClick={() => { if (role === "reviewer") void navigate({ to: "/dashboard" }); toast(onMe ? "Your assigned cases are in the workstream" : "No new notifications"); }}><Bell className="size-4" />{onMe && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-action-dot" />}</Button>
        <span title={me.name} className="flex size-7 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] ring-1 ring-line">{initials(me.name)}</span>
      </div>
    </header>
  );
}

function SideNav() {
  const { role, me } = useRole();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => { await qc.cancelQueries(); qc.clear(); localStorage.removeItem(ROLE_KEY); await supabase.auth.signOut(); void navigate({ to: "/", replace: true }); };
  const path = useRouterState({ select: (s) => s.location.pathname });
  const cases = useQuery(casesQuery);
  const items = useMemo(() => ROLE_NAV[role], [role]);

  const exportCsv = () => {
    const rows = (cases.data ?? []).map((c) => ({
      case_id: c.claim.case_id,
      case_status: c.claim.case_status ?? "open",
      recommendation: c.decision?.recommendation,
      rule_id: c.decision?.rule_id,
      policy_version: c.decision?.policy_version,
      missing_fields: c.decision?.missing_fields,
      explanation: c.decision?.explanation,
      queue: c.workflow?.queue,
      assignee: c.workflow?.assignee,
    }));
    const csv = toCsv(rows, ["case_id", "case_status", "recommendation", "rule_id", "policy_version", "missing_fields", "explanation", "queue", "assignee"]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `triage-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} cases`);
  };

  const icons: Record<string, typeof ListTodo> = { "/dashboard": ListTodo, "/claims": Files, "/policy": SlidersHorizontal, "/impact": GitCompareArrows, "/versions": History, "/overview": ChartNoAxesCombined, "/quality": ShieldCheck, "/business-case": Calculator };
  const railClass = (active: boolean) => cn("flex size-9 items-center justify-center rounded-md", active ? "bg-link/10 text-link" : "text-text-2 hover:bg-surface-2");
  const railLink = (to: string, label: string, Icon: typeof ListTodo) => <Tooltip key={to}><TooltipTrigger asChild><Button asChild variant="ghost" className={railClass(path === to || (to === "/dashboard" && path.startsWith("/claims/")))}><Link to={to} aria-label={label}><Icon className="size-4" strokeWidth={1.5} /></Link></Button></TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>;
  return (
    <><nav aria-label="Main" className="fixed inset-y-0 left-0 z-40 flex w-14 flex-col items-center gap-2 border-r border-line bg-surface py-3">
      <Link to={ROLE_HOME[role]} aria-label="Clearpath home" className="mb-4"><Logo className="size-7" /></Link>
      {items.map((it) => railLink(it.to, it.to === "/dashboard" ? "Workstream" : it.label, icons[it.to] ?? Files))}
      <div className="my-2 w-7 border-t border-line" />
      {railLink("/import", "Import CSV", Upload)}
      <Tooltip><TooltipTrigger asChild><Button variant="ghost" className={railClass(false)} onClick={exportCsv} aria-label="Export results CSV"><Download className="size-4" /></Button></TooltipTrigger><TooltipContent side="right">Export results CSV</TooltipContent></Tooltip>
      {railLink("/batch", "Batch run (judges)", Play)}
      <div className="mt-auto" />
      <Tooltip><TooltipTrigger asChild><Button variant="ghost" className={railClass(false)} onClick={() => setSettingsOpen(true)} aria-label="Settings"><Settings className="size-4" /></Button></TooltipTrigger><TooltipContent side="right">Settings</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger asChild><Button variant="ghost" className={railClass(false)} onClick={signOut} aria-label="Sign out"><LogOut className="size-4" /></Button></TooltipTrigger><TooltipContent side="right">Sign out</TooltipContent></Tooltip>
    </nav>
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent><DialogHeader><DialogTitle>Account settings</DialogTitle></DialogHeader><dl className="space-y-3"><div><dt className="text-text-2">Name</dt><dd>{me.name}</dd></div><div><dt className="text-text-2">Email</dt><dd>{me.email}</dd></div></dl><Button variant="outline" onClick={signOut}><LogOut className="size-4" />Sign out</Button></DialogContent></Dialog>
    </>
  );
}
