import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { Logo } from "@/components/triage/Logo";
import { NotificationsBell } from "@/components/triage/NotificationsBell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Download,
  LogOut,
  Play,
  Upload,
  ListTodo,
  Files,
  SlidersHorizontal,
  GitCompareArrows,
  History,
  ChartNoAxesCombined,
  ShieldCheck,
  Calculator,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  RoleContext,
  useRole,
  ROLE_HOME,
  ROLE_LABELS,
  ROLE_NAV,
  initials,
  type Me,
  type Role,
} from "@/lib/role";
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
const NAV_KEY = "triage.navExpanded";

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
        role: (r.data?.[0]?.role as Role) ?? "reviewer",
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

  // Sidebar: expanded with labels by default, collapsible to an icon rail (remembered per browser).
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    try {
      setExpanded(localStorage.getItem(NAV_KEY) !== "0");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggleNav = () =>
    setExpanded((v) => {
      try {
        localStorage.setItem(NAV_KEY, v ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !v;
    });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleNav();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!meQuery.data || !role) {
    return <div className="flex min-h-screen items-center justify-center label-mono">Loading</div>;
  }

  return (
    <RoleContext.Provider value={{ me: meQuery.data, role, setRole }}>
      <TooltipProvider delayDuration={150}>
        <div
          className={cn(
            "min-h-screen transition-[padding] duration-200 motion-reduce:transition-none",
            expanded ? "pl-56" : "pl-14",
          )}
        >
          <TopBar />
          <SideNav expanded={expanded} onToggle={toggleNav} />
          <div className="mx-auto max-w-[1440px] p-6">
            <main className="enterprise-content min-w-0">
              <Outlet />
            </main>
          </div>
        </div>
      </TooltipProvider>
    </RoleContext.Provider>
  );
}

function TopBar() {
  const { me, role, setRole } = useRole();
  const [profileOpen, setProfileOpen] = useState(false);
  const policy = useQuery(activePolicyQuery);
  const cases = useQuery(casesQuery);
  // Single reviewer: the dot means "there is something to review", not "assigned to you".
  const toReview = (cases.data ?? []).filter(
    (c) =>
      c.workflow &&
      c.claim.case_status?.toLowerCase() !== "closed" &&
      c.workflow.queue !== "done" &&
      (c.workflow.queue === "on_you" || c.workflow.qa_sample),
  ).length;
  const onMe = toReview > 0;
  const path = useRouterState({ select: (s) => s.location.pathname });
  const title = path.startsWith("/claims/")
    ? `Workstream › ${decodeURIComponent(path.split("/").pop() ?? "")}`
    : path === "/dashboard"
      ? "Workstream"
      : (Object.values(ROLE_NAV)
          .flat()
          .find((it) => it.to === path)?.label ??
        (path === "/import" ? "Import CSV" : "Clearpath"));
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 relative flex h-[52px] items-center justify-between gap-4 border-b border-line bg-surface px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-[13px] font-semibold">Clearpath</span>
        <span className="text-text-3">/</span>
        <span className="truncate text-[13px] text-text-2">{title}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div
          role="tablist"
          aria-label="Role"
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 rounded-md border border-line bg-surface-2 p-0.5"
        >
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <Button
              key={r}
              role="tab"
              aria-selected={r === role}
              variant="ghost"
              size="sm"
              onClick={() => setRole(r)}
              className={cn(
                "h-7 rounded px-2 text-[11px]",
                r === role ? "bg-surface text-foreground" : "text-text-2",
              )}
            >
              {ROLE_LABELS[r]}
            </Button>
          ))}
        </div>
        <span className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-text-2">
          Policy {policy.data?.version ?? "…"}
        </span>
        <NotificationsBell />
        <button
          type="button"
          title={me.name}
          aria-label="Profile"
          onClick={() => setProfileOpen(true)}
          className="flex size-7 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] ring-1 ring-line hover:ring-text-3"
        >
          {initials(me.name)}
        </button>
      </div>
      <AccountDialog title="Profile" open={profileOpen} onOpenChange={setProfileOpen} />
    </header>
  );
}

function SideNav({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const { role, me } = useRole();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    localStorage.removeItem(ROLE_KEY);
    await supabase.auth.signOut();
    void navigate({ to: "/", replace: true });
  };
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
    const csv = toCsv(rows, [
      "case_id",
      "case_status",
      "recommendation",
      "rule_id",
      "policy_version",
      "missing_fields",
      "explanation",
      "queue",
      "assignee",
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `triage-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} cases`);
  };

  const icons: Record<string, typeof ListTodo> = {
    "/dashboard": ListTodo,
    "/claims": Files,
    "/policy": SlidersHorizontal,
    "/impact": GitCompareArrows,
    "/advisor": Sparkles,
    "/versions": History,
    "/overview": ChartNoAxesCombined,
    "/quality": ShieldCheck,
    "/business-case": Calculator,
    "/import": Upload,
    "/batch": Play,
  };
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  // One entry in the sidebar: icon only with a hover label when collapsed, icon + label when expanded.
  const item = (
    key: string,
    label: string,
    Icon: typeof ListTodo,
    opts: { to?: string; onClick?: () => void; active?: boolean; hint?: string },
  ) => {
    const cls = cn(
      "flex h-9 items-center rounded-md text-[13px] transition-colors",
      expanded ? "w-full justify-start gap-2.5 px-2.5" : "size-9 justify-center",
      opts.active
        ? "bg-link/10 font-medium text-link"
        : "text-text-2 hover:bg-surface-2 hover:text-foreground",
    );
    const inner: ReactNode = (
      <>
        <Icon className="size-4 shrink-0" strokeWidth={1.5} />
        {expanded && <span className="truncate">{label}</span>}
        {expanded && opts.hint && (
          <span className="ml-auto font-mono text-[10px] text-text-3">{opts.hint}</span>
        )}
      </>
    );
    const el = opts.to ? (
      <Link key={key} to={opts.to} aria-label={label} className={cls}>
        {inner}
      </Link>
    ) : (
      <button key={key} type="button" onClick={opts.onClick} aria-label={label} className={cls}>
        {inner}
      </button>
    );
    if (expanded) return el;
    return (
      <Tooltip key={key}>
        <TooltipTrigger asChild>{el}</TooltipTrigger>
        <TooltipContent side="right">
          {label}
          {opts.hint ? ` (${opts.hint})` : ""}
        </TooltipContent>
      </Tooltip>
    );
  };
  const section = (label: string) =>
    expanded ? (
      <p className="label-mono mb-1 mt-3 w-full px-2.5 text-[10px]">{label}</p>
    ) : (
      <div className="my-2 w-7 border-t border-line" />
    );
  const navItem = (to: string, label: string) =>
    item(to, label, icons[to] ?? Files, {
      to,
      active: path === to || (to === "/dashboard" && path.startsWith("/claims/")),
    });
  return (
    <>
      <nav
        aria-label="Main"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col gap-1 overflow-hidden border-r border-line bg-surface py-3 transition-[width] duration-200 motion-reduce:transition-none",
          expanded ? "w-56 items-stretch px-3" : "w-14 items-center",
        )}
      >
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Clearpath: sign out and go to the login page"
          title="Back to the login page (signs you out)"
          className={cn(
            "mb-3 flex items-center gap-2.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-link",
            expanded && "px-1",
          )}
        >
          <Logo className="size-7 shrink-0" />
          {expanded && <span className="text-[14px] font-semibold">Clearpath</span>}
        </button>
        {expanded && (
          <p className="label-mono mb-1 w-full px-2.5 text-[10px]">{ROLE_LABELS[role]}</p>
        )}
        {items.map((it) => navItem(it.to, it.to === "/dashboard" ? "Workstream" : it.label))}
        {section("Data")}
        {navItem("/import", "Import CSV")}
        {item("export", "Export results CSV", Download, { onClick: exportCsv })}
        {navItem("/batch", "Batch run (judges)")}
        <div className="mt-auto" />
        {item(
          "toggle",
          expanded ? "Collapse sidebar" : "Expand sidebar",
          expanded ? PanelLeftClose : PanelLeftOpen,
          {
            onClick: onToggle,
          },
        )}
        {item("settings", "Settings", Settings, { onClick: () => setSettingsOpen(true) })}
        {item("signout", "Sign out", LogOut, { onClick: signOut })}
      </nav>
      <AccountDialog title="Account settings" open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

/** Name, email and sign out. Opened from Settings in the sidebar and from the avatar in the top bar. */
function AccountDialog({
  title,
  open,
  onOpenChange,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { me } = useRole();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    localStorage.removeItem(ROLE_KEY);
    await supabase.auth.signOut();
    void navigate({ to: "/", replace: true });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <dl className="space-y-3">
          <div>
            <dt className="text-text-2">Name</dt>
            <dd>{me.name}</dd>
          </div>
          <div>
            <dt className="text-text-2">Email</dt>
            <dd>{me.email}</dd>
          </div>
        </dl>
        <Button variant="outline" onClick={signOut}>
          <LogOut className="size-4" />
          Sign out
        </Button>
      </DialogContent>
    </Dialog>
  );
}
