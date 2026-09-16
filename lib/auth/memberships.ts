import { getPostgresClient } from "../postgres/runtime/backend";
import type { PostgresClient } from "../postgres/runtime/client";
import { makeFunctionReference } from "../postgres/runtime/api";
import type { AppRole, ManagedRole } from "../../src/lib/auth/roles";
import { getServerDataAdminKey } from "../data/serverWriteHealth";
import { assertDataWritesNotFrozen } from "../runtime/dataWriteFreeze";

export type MembershipRecord = {
  email: string;
  role: AppRole;
  glossaryLocales?: string[];
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

export type RedeemedInvite = { email: string; role: ManagedRole };

const redeemInviteMutation = makeFunctionReference<
  "mutation",
  { apiKey: string } & RedeemInviteInput,
  RedeemedInvite
>("inviteCodes:redeem");

function getDataClient(): PostgresClient {
  return getPostgresClient();
}

function getDataAdminKeyOrThrow(): string {
  const adminKey = getServerDataAdminKey();

  if (!adminKey) {
    throw new Error(
      "DATA_ADMIN_KEY is not configured on the server; membership lookups require it."
    );
  }

  return adminKey;
}

export async function getCredentialsByUsername(username: string): Promise<MembershipCredentials | null> {
  return await getDataClient().query(getCredentialsByUsernameQuery, {
    apiKey: getDataAdminKeyOrThrow(),
    username,
  });
}

/**
 * These three writes bypass `ServerDataWriteClient` on purpose (the caller
 * has no session, so there is no actor to name), which means the cutover write
 * freeze has to be asserted here too or sign-in, password reset and invite
 * redemption would keep writing during the window.
 */
export async function touchSignIn(email: string): Promise<void> {
  assertDataWritesNotFrozen("memberships:touchSignIn");
  await getDataClient().mutation(touchSignInMutation, {
    apiKey: getDataAdminKeyOrThrow(),
    email,
  });
}

export async function getMembershipByEmail(email: string): Promise<MembershipRecord | null> {
  const membership = await getDataClient().query(getMembershipByEmailQuery, {
    apiKey: getDataAdminKeyOrThrow(),
    email,
  });

  if (!membership) {
    return null;
  }

  return {
    email: membership.email,
    role: membership.role,
    glossaryLocales: membership.glossaryLocales,
    name: membership.name,
    image: membership.image,
    bannedAt: membership.bannedAt,
  };
}

/**
 * Redeems a password reset link. Like sign-in, the caller has no session, so
 * this goes through the server-key client rather than the route write
 * capability (which insists on an actor). Throws the Postgres rejection for an
 * unknown or expired token.
 */
export async function consumePasswordReset(tokenHash: string, passwordHash: string): Promise<void> {
  assertDataWritesNotFrozen("memberships:consumePasswordReset");
  await getDataClient().mutation(consumePasswordResetMutation, {
    apiKey: getDataAdminKeyOrThrow(),
    tokenHash,
    passwordHash,
  });
}

/**
 * Accepts an invite: creates the membership and records the redemption. The
 * visitor has no session yet, so this is a server-key call with no actor.
 * Throws the Postgres rejection (`INVITE_*`, `USERNAME_TAKEN`, `EMAIL_TAKEN`)
 * for the route to map.
 */
export async function redeemInviteCode(input: RedeemInviteInput): Promise<RedeemedInvite> {
  assertDataWritesNotFrozen("inviteCodes:redeem");
  return await getDataClient().mutation(redeemInviteMutation, {
    apiKey: getDataAdminKeyOrThrow(),
    ...input,
  });
}
