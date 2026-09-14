/**
 * Authentication utilities for Convex mutations.
 *
 * This module provides dual authentication:
 * 1. Convex identity authentication for browser clients when available
 * 2. API key authentication for batch scripts and automated processes
 *
 * SECURITY: This implements VULN-01 (unauthenticated mutations) and VULN-04
 * (localStorage passwords) remediation from the security audit.
 */

import { QueryCtx, MutationCtx } from "../_generated/server";
import {
  validateAdminIntentToken,
  type AdminIntent,
} from "./adminIntentTokens";

/**
 * Environment variable name for the admin API key.
 * Set this in the Convex dashboard under Settings > Environment Variables.
 */
const ADMIN_KEY_ENV_VAR = "CONVEX_ADMIN_KEY";

/**
 * Authenticated user information returned by requireAuth.
 */
export type AuthenticatedUser = {
  userId: string;
  email: string;
  name: string;
};

export type AuthorizedRole = "admin" | "editor" | "translator" | "contributor" | "viewer";

/**
 * Role floors, lowest to highest. `requireRole` admits an actor whose role
 * sits at or above the floor. `viewer` is a legacy stored value only: it is
 * never a floor and never passes one.
 */
export type RoleFloor = "admin" | "editor" | "translator" | "contributor";

const ROLE_RANK: Record<AuthorizedRole, number> = {
  viewer: 0,
  contributor: 1,
  translator: 2,
  editor: 3,
  admin: 4,
};

export function roleMeetsFloor(role: AuthorizedRole, floor: RoleFloor): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[floor];
}

export type AuthorizedActor = AuthenticatedUser & {
  role: AuthorizedRole;
  authMethod: "identity" | "apiKey";
  adminIntent?: AdminIntent;
};

/**
 * Error thrown when authentication fails.
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function requireAdminIntent(
  apiKey: string | undefined,
  intent: AdminIntent
): Promise<ReturnType<typeof validateAdminIntentToken> & { ok: true }> {
  if (!apiKey) {
    throw new AuthError("Authentication required: Please sign in or provide an API key");
  }

  const result = validateAdminIntentToken(apiKey, intent);
  if (result.ok === true) {
    return result;
  }

  if (result.reason === "missing") {
    console.warn(
      `[AUTH WARNING] ${ADMIN_KEY_ENV_VAR} environment variable not set and no scoped token configured for ${intent}. ` +
        "API key authentication is disabled."
    );
    throw new AuthError("API key authentication not configured");
  }

  throw new AuthError("Authentication failed: Invalid API key");
}

/**
 * Validates authentication using either JWT (frontend) or API key (batch scripts).
 * Returns user information on success, throws AuthError on failure.
 *
 * Authentication flow:
 * 1. If apiKey is provided, validate against CONVEX_ADMIN_KEY
 * 2. Otherwise, check for Convex identity via ctx.auth.getUserIdentity()
 * 3. Throw AuthError if neither authentication method succeeds
 *
 * @param ctx - Convex mutation context (provides access to auth and env vars)
 * @param apiKey - Optional API key for batch script authentication
 * @returns Authenticated user information
 * @throws AuthError if authentication fails
 */
export async function requireAuth(
  ctx: MutationCtx | QueryCtx,
  apiKey?: string,
  adminIntent: AdminIntent = "legacyAdmin"
): Promise<AuthenticatedUser> {
  // API key authentication for batch scripts
  if (apiKey) {
    await requireAdminIntent(apiKey, adminIntent);

    return {
      userId: "api-key",
      email: "system@dosewiki.internal",
      name: "API Key",
    };
  }

  // Convex identity authentication for frontend users
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    // SECURITY: Always require authentication - no dev mode bypass
    throw new AuthError("Authentication required: Please sign in or provide an API key");
  }

  return {
    userId: identity.subject,
    email: identity.email ?? "unknown@dosewiki.internal",
    name: identity.name ?? identity.email ?? "Unknown User",
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function getMembership(ctx: MutationCtx | QueryCtx, email: string) {
  return await ctx.db
    .query("memberships")
    .withIndex("by_email", (query) => query.eq("email", normalizeEmail(email)))
    .unique();
}

/**
 * Resolves who a call acts as.
 *
 * - Identity calls (browser) act as the signed-in identity's membership.
 * - Server-key calls that name an `actorEmail` act as that member; the key
 *   only proves the caller is our server, the role comes from memberships.
 * - Server-key calls that name nobody are scripts running from a workstation
 *   or the Convex environment. They act as admin. The Next server must never
 *   take this path: every route passes the session's email (enforced by the
 *   server write capability), and there is no email pattern that shortcuts to
 *   admin any more.
 */
async function resolveActor(
  ctx: MutationCtx | QueryCtx,
  args: {
    apiKey?: string;
    actorEmail?: string;
    adminIntent?: AdminIntent;
  } = {}
): Promise<AuthorizedActor> {
  const adminIntent = args.adminIntent ?? "legacyAdmin";
  const authenticated = await requireAuth(ctx, args.apiKey, adminIntent);
  const authMethod = args.apiKey ? "apiKey" : "identity";
  const delegatedActorEmail = args.apiKey ? args.actorEmail?.trim() : undefined;
  const email = delegatedActorEmail
    ? normalizeEmail(delegatedActorEmail)
    : normalizeEmail(authenticated.email);

  if (authMethod === "apiKey" && !delegatedActorEmail) {
    return {
      ...authenticated,
      email,
      role: "admin",
      authMethod,
      adminIntent,
    };
  }

  const membership = await getMembership(ctx, email);
  if (membership?.bannedAt) {
    throw new AuthError("This account is banned");
  }
  const role = membership?.role ?? "viewer";

  return {
    userId: authenticated.userId,
    email,
    name: delegatedActorEmail ? email : authenticated.name,
    role,
    authMethod,
    adminIntent: authMethod === "apiKey" ? adminIntent : undefined,
  };
}

/**
 * The one authorization choke point for writes. Resolves the actor and then
 * checks a role floor: `admin` for destructive and publishing mutations,
 * `editor` for review metadata and proposals, `contributor` (plus an
 * ownership check at the call site) for owned records.
 */
export async function requireRole(
  ctx: MutationCtx | QueryCtx,
  args: {
    apiKey?: string;
    actorEmail?: string;
    adminIntent?: AdminIntent;
  },
  floor: RoleFloor
): Promise<AuthorizedActor> {
  const actor = await resolveActor(ctx, args);

  if (!roleMeetsFloor(actor.role, floor)) {
    throw new AuthError(`${floor.charAt(0).toUpperCase()}${floor.slice(1)} access required`);
  }

  return actor;
}

/**
 * Authorizes a server-token write while requiring the delegated audit identity
 * to exist in memberships at the editor floor or above.
 */
export async function requireRegisteredDelegatedEditorWrite(
  ctx: MutationCtx | QueryCtx,
  args: {
    apiKey?: string;
    actorEmail?: string;
    adminIntent: AdminIntent;
  },
): Promise<AuthorizedActor> {
  if (!args.actorEmail?.trim()) {
    throw new AuthError("A registered delegated editor actor is required");
  }

  const authenticated = await requireAuth(ctx, args.apiKey, args.adminIntent);
  const email = normalizeEmail(args.actorEmail);
  const membership = await getMembership(ctx, email);
  if (membership?.bannedAt) {
    throw new AuthError("This account is banned");
  }
  const role = membership?.role ?? "viewer";
  if (!roleMeetsFloor(role, "editor")) {
    throw new AuthError("Registered editor access required");
  }

  return {
    userId: authenticated.userId,
    email,
    name: email,
    role,
    authMethod: "apiKey",
    adminIntent: args.adminIntent,
  };
}

/**
 * Optional authentication - returns user info if authenticated, null otherwise.
 * Does not throw on authentication failure.
 *
 * @param ctx - Convex mutation context
 * @param apiKey - Optional API key
 * @returns Authenticated user info or null
 */
export async function optionalAuth(
  ctx: MutationCtx | QueryCtx,
  apiKey?: string,
  adminIntent?: AdminIntent
): Promise<AuthenticatedUser | null> {
  try {
    return await requireAuth(ctx, apiKey, adminIntent);
  } catch (error) {
    if (error instanceof AuthError) {
      return null;
    }
    throw error;
  }
}

/**
 * Check if the current user is authenticated without throwing.
 *
 * @param ctx - Convex context
 * @param apiKey - Optional API key
 * @returns true if authenticated, false otherwise
 */
export async function isAuthenticated(
  ctx: MutationCtx | QueryCtx,
  apiKey?: string,
  adminIntent?: AdminIntent
): Promise<boolean> {
  const user = await optionalAuth(ctx, apiKey, adminIntent);
  return user !== null;
}
