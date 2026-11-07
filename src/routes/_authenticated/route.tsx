import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/triage/Logo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Bell, Download, LogOut, Play, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RoleContext, useRole, ROLE_HOME, ROLE_LABELS, ROLE_NAV, initials, type Me, type Role } from "@/lib/role";
import { activePolicyQuery, casesQuery } from "@/lib/data";
import { toCsv } from "@/lib/csv";
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
      <div className="min-h-screen">
        <TopBar />
        <div className="mx-auto flex max-w-[1360px] gap-8 px-8 py-8">
          <SideNav />
          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>
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
  const qc = useQueryClient();
  const navigate = useNavigate();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    localStorage.removeItem(ROLE_KEY);
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <header className="topbar-glass sticky top-0 z-30 border-b border-white/70">
      <div className="mx-auto grid h-14 max-w-[1360px] grid-cols-[1fr_auto_1fr] items-center px-8">
        <Link to={ROLE_HOME[role]} className="flex items-center gap-2.5">
          <Logo />
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight">Clearpath</span>
            <span className="label-mono mt-1 text-[9.5px]">Motor claims</span>
          </span>
        </Link>

        <div role="tablist" aria-label="Role" className="flex rounded-full border border-white/80 bg-[oklch(0.93_0.015_258/0.6)] p-0.5 backdrop-blur">
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={r === role}
              onClick={() => setRole(r)}
              className={cn(
                "rounded-full px-3.5 py-1 text-[13px] font-medium transition-shadow",
                r === role ? "pill-active" : "text-text-2 hover:text-foreground",
              )}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-4">
          <span className="rounded-full border border-white/90 bg-surface/70 px-2.5 py-0.5 shadow-[var(--shadow-lift)] font-mono text-[11px] uppercase tracking-[0.06em] text-text-2">
            Policy {policy.data?.version ?? "…"}
          </span>
          <button aria-label={onMe ? "Something needs you" : "Notifications"} className="relative text-text-2 hover:text-foreground">
            <Bell className="size-4" strokeWidth={1.5} />
            {onMe && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-action-dot ring-2 ring-background" />}
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.95_0.03_245)] to-[oklch(0.86_0.07_258)] font-mono text-[10px] font-medium text-[oklch(0.38_0.1_262)] ring-2 ring-white">
              {initials(me.name)}
            </span>
            <div className="hidden leading-tight lg:block">
              <div className="text-[13px] font-medium">{me.name}</div>
              <div className="text-[11px] text-text-2">{ROLE_LABELS[role]}</div>
            </div>
          </div>
          <button onClick={signOut} aria-label="Sign out" className="text-text-2 hover:text-foreground">
            <LogOut className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </header>
  );
}

function SideNav() {
  const { role } = useRole();
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

  const linkCls = (active: boolean) =>
    cn(
      "flex h-9 items-center gap-2 rounded-[10px] px-3 text-[13px]",
      active ? "pill-active font-medium" : "text-text-2 hover:bg-white/50 hover:text-foreground",
    );

  return (
    <nav aria-label="Main" className="glass-panel sticky top-22 hidden h-fit w-52 shrink-0 p-3 md:block">
      <p className="label-mono mb-2 px-3">{ROLE_LABELS[role]}</p>
      <div className="flex flex-col gap-0.5">
        {items.map((it) => (
          <Link key={it.to} to={it.to} className={linkCls(path === it.to || (it.to === "/dashboard" && path.startsWith("/claims/")))}>
            {it.label}
          </Link>
        ))}
      </div>
      <p className="label-mono mb-2 mt-8 px-3">Data</p>
      <div className="flex flex-col gap-0.5">
        <Link to="/import" className={linkCls(path === "/import")}>
          <Upload className="size-4" strokeWidth={1.5} /> Import CSV
        </Link>
        <button onClick={exportCsv} className={linkCls(false)}>
          <Download className="size-4" strokeWidth={1.5} /> Export results CSV
        </button>
        <Link to="/batch" className={linkCls(false)}>
          <Play className="size-4" strokeWidth={1.5} /> Batch run (judges)
        </Link>
      </div>
    </nav>
  );
}
