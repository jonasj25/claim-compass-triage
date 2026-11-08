import { createServerFn } from "@tanstack/react-start";

// Fixed hackathon demo accounts. Only these can be created here.
export const DEMO_USERS = [
  { email: "mara@demo.com", name: "Mara Klein", role: "reviewer" },
  { email: "jonas@demo.com", name: "Jonas Weber", role: "reviewer" },
  { email: "lea@demo.com", name: "Lea Hoffmann", role: "reviewer" },
  { email: "ben@demo.com", name: "Ben Krause", role: "reviewer" },
  { email: "aylin@demo.com", name: "Aylin Demir", role: "reviewer" },
  { email: "noah@demo.com", name: "Noah Fischer", role: "reviewer" },
  { email: "clara@demo.com", name: "Clara Wolf", role: "reviewer" },
  { email: "tobias@demo.com", name: "Tobias Brandt", role: "policy_owner" },
  { email: "sofia@demo.com", name: "Sofia Lang", role: "ops_lead" },
] as const;
// The login page lists one account per role (Mara, Tobias, Sofia). The other reviewers still
// exist, so claims can be assigned to them and they can sign in with email + password.
export const LOGIN_USERS = DEMO_USERS.filter(
  (u, i) => DEMO_USERS.findIndex((x) => x.role === u.role) === i,
);
export const DEMO_PASSWORD = "demo1234";

export const ensureDemoUsers = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(error.message);
  let created = 0;
  for (const u of DEMO_USERS) {
    let user = list.users.find((x) => x.email === u.email);
    if (!user) {
      const res = await supabaseAdmin.auth.admin.createUser({
        email: u.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { name: u.name },
      });
      if (res.error) throw new Error(res.error.message);
      user = res.data.user;
      created++;
    }
    await supabaseAdmin.from("profiles").upsert({ id: user.id, name: u.name, email: u.email });
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: user.id, role: u.role }, { onConflict: "user_id,role" });
  }
  return { created };
});
