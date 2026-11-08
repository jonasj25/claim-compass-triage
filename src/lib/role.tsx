import { createContext, useContext } from "react";

export type Role = "reviewer" | "policy_owner" | "ops_lead";

export const ROLE_LABELS: Record<Role, string> = {
  reviewer: "Reviewer",
  policy_owner: "Policy owner",
  ops_lead: "Ops lead",
};

export const ROLE_HOME: Record<Role, string> = {
  reviewer: "/dashboard",
  policy_owner: "/policy",
  ops_lead: "/overview",
};

export interface NavItem { to: string; label: string }

export const ROLE_NAV: Record<Role, NavItem[]> = {
  reviewer: [
    { to: "/dashboard", label: "To review" },
    { to: "/claims", label: "All claims" },
  ],
  policy_owner: [
    { to: "/policy", label: "Policy" },
    { to: "/impact", label: "Change impact" },
    { to: "/advisor", label: "Policy advisor" },
    { to: "/versions", label: "Versions" },
  ],
  ops_lead: [
    { to: "/overview", label: "Workload & flow" },
    { to: "/pitch", label: "Value & ROI" },
    { to: "/business-case", label: "Business case" },
  ],
};

export interface Me { id: string; name: string; email: string; role: Role }

export interface RoleCtx {
  me: Me;
  role: Role;
  setRole: (r: Role) => void;
}

export const RoleContext = createContext<RoleCtx | null>(null);

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole outside RoleContext");
  return ctx;
}

export const initials = (name: string | null | undefined) =>
  (name ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
