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

export interface NavItem {
  to: string;
  label: string;
}

export const ROLE_NAV: Record<Role, NavItem[]> = {
  reviewer: [
    { to: "/dashboard", label: "To review" },
    { to: "/claims", label: "All claims" },
  ],
  policy_owner: [
    { to: "/policy", label: "Policy" },
    { to: "/impact", label: "Change impact" },
    { to: "/tests", label: "Quality" },
    { to: "/advisor", label: "Policy advisor" },
    { to: "/versions", label: "Versions" },
  ],
  ops_lead: [
    { to: "/overview", label: "Workload & flow" },
    { to: "/pitch", label: "Value & ROI" },
    { to: "/business-case", label: "Business case" },
  ],
};

// Access follows a hierarchy: the ops lead sees every section, the policy owner sees the
// policy owner and reviewer sections, a reviewer only the reviewer section.
export const ROLE_RANK: Record<Role, number> = { reviewer: 0, policy_owner: 1, ops_lead: 2 };
const ROLES = Object.keys(ROLE_RANK) as Role[];

export const canAccess = (userRole: Role, section: Role) =>
  ROLE_RANK[userRole] >= ROLE_RANK[section];

/** Roles whose section this user may open, lowest first. */
export const accessibleRoles = (userRole: Role) => ROLES.filter((r) => canAccess(userRole, r));

/** Roles allowed to open a section, lowest first (e.g. policy owner pages: policy owner, ops lead). */
export const rolesWithAccess = (section: Role) => ROLES.filter((r) => canAccess(r, section));

/** "a Policy owner or an Ops lead" */
export const accessWho = (section: Role) =>
  rolesWithAccess(section)
    .map((r) => `${/^[aeiou]/i.test(ROLE_LABELS[r]) ? "an" : "a"} ${ROLE_LABELS[r]}`)
    .join(" or ");

/** The highest role among the user's role rows (a user can hold more than one). */
export const highestRole = (roles: (string | null | undefined)[]): Role =>
  roles
    .filter((r): r is Role => !!r && r in ROLE_RANK)
    .reduce<Role>((best, r) => (ROLE_RANK[r] > ROLE_RANK[best] ? r : best), "reviewer");

// Signed-in pages outside the role menus. Pages not listed anywhere (Import CSV) are open to every role.
const EXTRA_SECTION: [string, Role][] = [
  ["/claims/", "reviewer"],
  ["/quality", "ops_lead"],
];

/** Which role's section a path belongs to, or null if every signed-in role may open it. */
export function sectionOf(path: string): Role | null {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  for (const r of ROLES) if (ROLE_NAV[r].some((it) => it.to === p)) return r;
  const extra = EXTRA_SECTION.find(([prefix]) => p === prefix || p.startsWith(prefix));
  return extra ? extra[1] : null;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
}

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
