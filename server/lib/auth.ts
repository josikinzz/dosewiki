import { QueryCtx, MutationCtx } from "../../lib/postgres/runtime/server"
import { roleMeetsFloor, type AppRole, type RoleFloor } from "../../src/lib/auth/roles";
export { roleMeetsFloor, type RoleFloor } from "../../src/lib/auth/roles";
import {
  validateAdminIntentToken,
  type AdminIntent,
} from "./adminIntentTokens";

const ADMIN_KEY_ENV_VAR = "DATA_ADMIN_KEY";

export type AuthenticatedUser = {
  userId: string;
  email: string;
  name: string;
};

export type AuthorizedRole = AppRole;

export type AuthorizedActor = AuthenticatedUser & {
  role: AuthorizedRole;
  authMethod: "identity" | "apiKey";
  adminIntent?: AdminIntent;
};

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

export async function requireAuth(
  ctx: MutationCtx | QueryCtx,
  apiKey?: string,
  adminIntent: AdminIntent = "legacyAdmin"
): Promise<AuthenticatedUser> {
  if (apiKey) {
    await requireAdminIntent(apiKey, adminIntent);

    return {
      userId: "api-key",
      email: "system@dosewiki.internal",
      name: "API Key",
    };
  }

  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
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
