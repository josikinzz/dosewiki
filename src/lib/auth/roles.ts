import { safeAuthReturnPath } from "./returnPath";
import translationLocaleNames from "../../i18n/translationLocaleNames.json";
const TRANSLATION_LOCALE_CODES = Object.keys(translationLocaleNames);

const APP_ROLES = ["admin", "editor_translator", "editor", "translator", "contributor", "viewer"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type RoleFloor = "admin" | "editor" | "translator" | "contributor";

const ROLE_CAPABILITIES: Record<AppRole, readonly RoleFloor[]> = {
  admin: ["admin", "editor", "translator", "contributor"],
  editor_translator: ["editor", "translator", "contributor"],
  editor: ["editor", "contributor"],
  translator: ["translator", "contributor"],
  contributor: ["contributor"],
  viewer: [],
};

export const MANAGED_ROLES = ["editor", "translator", "editor_translator", "contributor"] as const;

export type ManagedRole = (typeof MANAGED_ROLES)[number];

export function isManagedRole(value: unknown): value is ManagedRole {
  return typeof value === "string" && MANAGED_ROLES.includes(value as ManagedRole);
}

export function roleMeetsFloor(role: AppRole | null | undefined, floor: RoleFloor): boolean {
  return role != null && ROLE_CAPABILITIES[role]?.includes(floor) === true;
}

export function managedRoleFor(editor: boolean, translator: boolean): ManagedRole {
  return editor ? (translator ? "editor_translator" : "editor") : translator ? "translator" : "contributor";
}

export function approvedGlossaryLocales(input: { role?: unknown; glossaryLocales?: unknown }): string[] {
  const role = resolveSessionRole(input);
  if (role === "admin") return [...TRANSLATION_LOCALE_CODES];
  const locales = input.glossaryLocales;
  if (!roleMeetsFloor(role, "translator") || !Array.isArray(locales)) return [];
  return TRANSLATION_LOCALE_CODES.filter((locale) => locales.includes(locale));
}

export function canAccessGlossaryLocale(input: { role?: unknown; glossaryLocales?: unknown }, locale: string): boolean {
  if (!TRANSLATION_LOCALE_CODES.includes(locale)) return false;
  const role = resolveSessionRole(input);
  return role === "admin" || (roleMeetsFloor(role, "translator") && Array.isArray(input.glossaryLocales) && input.glossaryLocales.includes(locale));
}

export function parseGlossaryLocaleGrant(role: ManagedRole, raw: unknown): string[] {
  const locales = raw === undefined ? [] : raw;
  if (!Array.isArray(locales) || locales.some((locale) => typeof locale !== "string" || !TRANSLATION_LOCALE_CODES.includes(locale))) {
    throw new Error("Choose known translation glossary languages.");
  }
  if (!roleMeetsFloor(role, "translator")) {
    if (locales.length) throw new Error("Glossary languages require the Translator role.");
    return [];
  }
  if (!locales.length) throw new Error("Choose at least one approved glossary language for a Translator.");
  return TRANSLATION_LOCALE_CODES.filter((locale) => locales.includes(locale));
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

export function resolveSessionRole(input: { role?: unknown }): AppRole | null {
  return isAppRole(input.role) ? input.role : null;
}

export function canAccessDev(role: AppRole | null | undefined): boolean {
  return roleMeetsFloor(role, "contributor");
}

export function canUseSelfProfileRoute(input: { email: unknown }): boolean {
  return typeof input.email === "string" && input.email.trim().length > 0;
}

export type DevRouteDecision =
  | {
      type: "allow";
      access: Exclude<AppRole, "viewer">;
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
  if (role === "editor_translator") return "Editor + Translator";

  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function getRoleFloorLockReason(role: AppRole | null | undefined, floor: RoleFloor): string | null {
  if (roleMeetsFloor(role, floor)) {
    return null;
  }

  return role ? `${getRoleDisplayName(floor)} role required` : "Sign in required";
}
