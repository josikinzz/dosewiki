import { safeAuthReturnPath } from "./returnPath";

const APP_ROLES = ["admin", "editor", "translator", "contributor", "viewer"] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Lowest role a route or mutation admits. `viewer` is never a floor. */
export type RoleFloor = "admin" | "editor" | "translator" | "contributor";

const ROLE_RANK: Record<AppRole, number> = { viewer: 0, contributor: 1, translator: 2, editor: 3, admin: 4 };

/**
 * The roles an admin can hand out, by invite or from the roster. `admin` is
 * seeded from a workstation and `viewer` is a legacy value nobody grants.
 */
export const MANAGED_ROLES = ["editor", "translator", "contributor"] as const;

export type ManagedRole = (typeof MANAGED_ROLES)[number];

export function isManagedRole(value: unknown): value is ManagedRole {
  return typeof value === "string" && MANAGED_ROLES.includes(value as ManagedRole);
}

export function roleMeetsFloor(role: AppRole | null | undefined, floor: RoleFloor): boolean {
  return role != null && ROLE_RANK[role] >= ROLE_RANK[floor];
}

export function canApprove(role: AppRole | null | undefined): boolean {
  return roleMeetsFloor(role, "admin");
}

export function canDraft(role: AppRole | null | undefined): boolean {
  return roleMeetsFloor(role, "editor");
}

function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

/** The stored membership role, or null when the token carries nothing usable. */
export function resolveSessionRole(input: { role?: unknown }): AppRole | null {
  return isAppRole(input.role) ? input.role : null;
}

/** Any role that may open the dev shell at all: `viewer` is the only stored role that cannot. */
export function canAccessDev(role: AppRole | null | undefined): boolean {
  return roleMeetsFloor(role, "contributor");
}

export function canUseSelfProfileRoute(input: { email: unknown }): boolean {
  return typeof input.email === "string" && input.email.trim().length > 0;
}

export type DevRouteDecision =
  | {
      type: "allow";
      /** The member's own role; the shell disables every tab above it. */
      access: RoleFloor;
    }
  | {
      type: "sign-in";
      callbackUrl: string;
    }
  | {
      type: "unauthorized";
      from: string;
      role: AppRole | null;
    };

/**
 * Server decision for a protected editor address. `floor` is the lowest role
 * the surface admits; the `/dev` shell leaves it at `contributor` because a
 * tab above the member's role still loads, rendered disabled with a reason,
 * while full-page surfaces such as `/review` pass their descriptor's role.
 */
export function getDevRouteDecision(input: {
  pathname: string;
  search?: string;
  email?: unknown;
  role?: unknown;
  floor?: RoleFloor;
}): DevRouteDecision {
  const callbackUrl = safeAuthReturnPath(`${input.pathname}${input.search ?? ""}`);

  if (!canUseSelfProfileRoute({ email: input.email })) {
    return {
      type: "sign-in",
      callbackUrl,
    };
  }

  const role = resolveSessionRole({ role: input.role });

  if (role && role !== "viewer" && roleMeetsFloor(role, input.floor ?? "contributor")) {
    return { type: "allow", access: role };
  }

  return {
    type: "unauthorized",
    role,
    from: callbackUrl,
  };
}

export function getRoleDisplayName(role: AppRole | null | undefined): string {
  if (!role) {
    return "No role";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Why a surface at `floor` is closed to `role`, or null when it is open. The
 * shell shows it as the disabled tab's title and the locked tool's heading.
 */
export function getRoleFloorLockReason(role: AppRole | null | undefined, floor: RoleFloor): string | null {
  if (roleMeetsFloor(role, floor)) {
    return null;
  }

  return role ? `${getRoleDisplayName(floor)} role required` : "Sign in required";
}
