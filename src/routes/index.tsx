import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureDemoUsers, DEMO_USERS, DEMO_PASSWORD } from "@/lib/demo-users.functions";
import { ROLE_HOME, ROLE_LABELS, type Role } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — Triage" },
      { name: "description", content: "Sign in to Triage, deterministic next-step recommendations for motor claims." },
      { property: "og:title", content: "Sign in — Triage" },
      { property: "og:description", content: "Deterministic next-step recommendations for motor claims." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignIn,
});

async function homeFor(userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const role = (data?.[0]?.role as Role) ?? "reviewer";
  localStorage.setItem("triage.demoRole", role);
  return ROLE_HOME[role];
}

function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) navigate({ to: await homeFor(data.user.id) });
    });
  }, [navigate]);

  const signIn = async (e: string, p: string) => {
    setBusy(true);
    setError(null);
    let res = await supabase.auth.signInWithPassword({ email: e, password: p });
    if (res.error && DEMO_USERS.some((u) => u.email === e) && p === DEMO_PASSWORD) {
      try {
        await ensureDemoUsers();
      } catch (err) {
        setError((err as Error).message);
        setBusy(false);
        return;
      }
      res = await supabase.auth.signInWithPassword({ email: e, password: p });
    }
    if (res.error || !res.data.user) {
      setError(res.error?.message ?? "Sign in failed");
      setBusy(false);
      return;
    }
    navigate({ to: await homeFor(res.data.user.id) });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex items-center gap-2.5">
          <span className="logo-mark size-5 rounded-[6px]" />
          <span className="text-[15px] font-semibold tracking-tight">Triage</span>
          <span className="label-mono">Motor claims</span>
        </div>
        <h1 className="page-title">Sign in</h1>
        <p className="mt-2 text-text-2">One next step per claim. Rules decide, people confirm.</p>

        <form
          className="mt-8 space-y-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            signIn(email, password);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-surface" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-surface" />
          </div>
          {error && <p className="text-[13px] text-action">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-10">
          <p className="label-mono mb-3">Demo accounts · password demo1234</p>
          <div className="card-quiet divide-y divide-line overflow-hidden">
            {DEMO_USERS.map((u) => (
              <button
                key={u.email}
                disabled={busy}
                onClick={() => signIn(u.email, DEMO_PASSWORD)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface-2"
              >
                <span>
                  <span className="block text-[14px] font-medium">{u.name}</span>
                  <span className="block text-[12px] text-text-2">{u.email}</span>
                </span>
                <span className="label-mono">{ROLE_LABELS[u.role as Role]}</span>
              </button>
            ))}
          </div>
        </div>

        <Link
          to="/batch"
          className="card-quiet mt-6 flex items-center justify-between px-4 py-3 hover:bg-surface-2"
        >
          <span>
            <span className="block text-[14px] font-medium">
              Judges: batch run without signing in
            </span>
            <span className="block text-[12px] text-text-2">
              Upload a claims CSV, download the results CSV
            </span>
          </span>
          <span className="label-mono">→</span>
        </Link>
      </div>
    </div>
  );
}
