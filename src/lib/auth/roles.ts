export const APP_ROLES = ["admin", "editor", "viewer"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const DEV_ACCESS_ROLES: readonly AppRole[] = ["admin", "editor"];
export const CREDENTIAL_PROVIDER_ROLE: AppRole = "admin";

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function resolveSessionRole(input: {
  role?: unknown;
  isCredentialProviderUser?: boolean;
  isDevelopmentCredentialUser?: boolean;
  nodeEnv?: string;
}): AppRole | null {
  if (input.isCredentialProviderUser || input.isDevelopmentCredentialUser) {
    return CREDENTIAL_PROVIDER_ROLE;
  }

  return isAppRole(input.role) ? input.role : null;
}

export function canAccessDev(role: AppRole | null | undefined): boolean {
  return canAccessDevShell({ role });
}

export function canAccessDevShell(input: { role: unknown }): boolean {
  const role = resolveSessionRole({ role: input.role });
  return role === "admin" || role === "editor";
}

export function canUseEditorWriteRoute(input: { role: unknown }): boolean {
  return canAccessDevShell(input);
}

export function canUseSelfProfileRoute(input: { email: unknown }): boolean {
  return typeof input.email === "string" && input.email.trim().length > 0;
}

export function isDevSelfProfilePath(pathname: string): boolean {
  return (
    pathname === "/dev/profile" ||
    pathname.startsWith("/dev/profile/") ||
    pathname === "/dev/profiles" ||
    pathname.startsWith("/dev/profiles/")
  );
}

export type DevRouteDecision =
  | {
      type: "allow";
      role: AppRole | null;
      access: "public" | "profile" | "editor";
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

export function getDevRouteDecision(input: {
  pathname: string;
  search?: string;
  email?: unknown;
  role?: unknown;
}): DevRouteDecision {
  const callbackUrl = `${input.pathname}${input.search ?? ""}`;

  if (!canUseSelfProfileRoute({ email: input.email })) {
    return {
      type: "sign-in",
      callbackUrl,
    };
  }

  const role = resolveSessionRole({ role: input.role });

  if (isDevSelfProfilePath(input.pathname) || canAccessDevShell({ role })) {
    return {
      type: "allow",
      role,
      access: isDevSelfProfilePath(input.pathname) ? "profile" : "editor",
    };
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
