export const APP_ROLES = ["admin", "editor", "viewer"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const DEV_ACCESS_ROLES: readonly AppRole[] = ["admin", "editor"];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function canAccessDev(role: AppRole | null | undefined): boolean {
  return role === "admin" || role === "editor";
}

export function getRoleDisplayName(role: AppRole | null | undefined): string {
  if (!role) {
    return "No role";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}
