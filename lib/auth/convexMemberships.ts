import { ConvexHttpClient } from "convex/browser";
import { getDataBackend, getPostgresConvexClient } from "../postgres/runtime/backend";
import type { PostgresConvexClient } from "../postgres/runtime/client";
import { makeFunctionReference } from "convex/server";
import type { AppRole } from "../../src/lib/auth/roles";
import { getAuthMembershipTarget, getServerConvexAdminKey } from "../convex/serverWriteHealth";
import { assertDataWritesNotFrozen } from "../runtime/dataWriteFreeze";

export type MembershipRecord = {
  email: string;
  role: AppRole;
  name?: string;
  image?: string;
  bannedAt?: string;
};

export type MembershipCredentials = {
  email: string;
  role: AppRole;
  name?: string;
  passwordHash?: string;
  bannedAt?: string;
};

const getMembershipByEmailQuery = makeFunctionReference<
  "query",
  { apiKey: string; email: string },
  MembershipRecord | null
>("memberships:getByEmail");

const getCredentialsByUsernameQuery = makeFunctionReference<
  "query",
  { apiKey: string; username: string },
  MembershipCredentials | null
>("memberships:getCredentialsByUsername");

const touchSignInMutation = makeFunctionReference<
  "mutation",
  { apiKey: string; email: string },
  null
>("memberships:touchSignIn");

const consumePasswordResetMutation = makeFunctionReference<
  "mutation",
  { apiKey: string; tokenHash: string; passwordHash: string },
  null
>("memberships:consumePasswordReset");

export type RedeemInviteInput = {
  codeHash: string;
  username: string;
  email?: string;
  name?: string;
  passwordHash: string;
};

export type RedeemedInvite = { email: string; role: "editor" | "contributor" };

const redeemInviteMutation = makeFunctionReference<
  "mutation",
  { apiKey: string } & RedeemInviteInput,
  RedeemedInvite
>("inviteCodes:redeem");

let cachedClient: ConvexHttpClient | null = null;
let cachedUrl: string | null = null;

function getConvexClient(): ConvexHttpClient | PostgresConvexClient {
  if (getDataBackend() === "postgres") return getPostgresConvexClient();
  const url = getAuthMembershipTarget().selectedUrl;

  if (!url) {
    throw new Error(
      "Convex URL is not configured. Set CONVEX_URL, VITE_CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL."
    );
  }

  if (!cachedClient || cachedUrl !== url) {
    cachedClient = new ConvexHttpClient(url);
    cachedUrl = url;
  }

  return cachedClient;
}

function getConvexAdminKeyOrThrow(): string {
  const adminKey = getServerConvexAdminKey();

  if (!adminKey) {
    throw new Error(
      "CONVEX_ADMIN_KEY is not configured on the server; membership lookups require it."
    );
  }

  return adminKey;
}

export async function getCredentialsByUsername(username: string): Promise<MembershipCredentials | null> {
  return await getConvexClient().query(getCredentialsByUsernameQuery, {
    apiKey: getConvexAdminKeyOrThrow(),
    username,
  });
}

/**
 * These three writes bypass `ServerConvexWriteClient` on purpose (the caller
 * has no session, so there is no actor to name), which means the cutover write
 * freeze has to be asserted here too or sign-in, password reset and invite
 * redemption would keep writing during the window.
 */
export async function touchSignIn(email: string): Promise<void> {
  assertDataWritesNotFrozen("memberships:touchSignIn");
  await getConvexClient().mutation(touchSignInMutation, {
    apiKey: getConvexAdminKeyOrThrow(),
    email,
  });
}

export async function getMembershipByEmail(email: string): Promise<MembershipRecord | null> {
  const membership = await getConvexClient().query(getMembershipByEmailQuery, {
    apiKey: getConvexAdminKeyOrThrow(),
    email,
  });

  if (!membership) {
    return null;
  }

  return {
    email: membership.email,
    role: membership.role,
    name: membership.name,
    image: membership.image,
    bannedAt: membership.bannedAt,
  };
}

/**
 * Redeems a password reset link. Like sign-in, the caller has no session, so
 * this goes through the server-key client rather than the route write
 * capability (which insists on an actor). Throws the Convex rejection for an
 * unknown or expired token.
 */
export async function consumePasswordReset(tokenHash: string, passwordHash: string): Promise<void> {
  assertDataWritesNotFrozen("memberships:consumePasswordReset");
  await getConvexClient().mutation(consumePasswordResetMutation, {
    apiKey: getConvexAdminKeyOrThrow(),
    tokenHash,
    passwordHash,
  });
}

/**
 * Accepts an invite: creates the membership and records the redemption. The
 * visitor has no session yet, so this is a server-key call with no actor.
 * Throws the Convex rejection (`INVITE_*`, `USERNAME_TAKEN`, `EMAIL_TAKEN`)
 * for the route to map.
 */
export async function redeemInviteCode(input: RedeemInviteInput): Promise<RedeemedInvite> {
  assertDataWritesNotFrozen("inviteCodes:redeem");
  return await getConvexClient().mutation(redeemInviteMutation, {
    apiKey: getConvexAdminKeyOrThrow(),
    ...input,
  });
}
