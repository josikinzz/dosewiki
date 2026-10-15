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
  passwordUpdatedAt?: string;
};

export type MembershipCredentials = {
  email: string;
  role: AppRole;
  name?: string;
  passwordHash?: string;
  bannedAt?: string;
  passwordUpdatedAt?: string;
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
    passwordUpdatedAt: membership.passwordUpdatedAt,
  };
}

export async function consumePasswordReset(tokenHash: string, passwordHash: string): Promise<void> {
  assertDataWritesNotFrozen("memberships:consumePasswordReset");
  await getDataClient().mutation(consumePasswordResetMutation, {
    apiKey: getDataAdminKeyOrThrow(),
    tokenHash,
    passwordHash,
  });
}

export async function redeemInviteCode(input: RedeemInviteInput): Promise<RedeemedInvite> {
  assertDataWritesNotFrozen("inviteCodes:redeem");
  return await getDataClient().mutation(redeemInviteMutation, {
    apiKey: getDataAdminKeyOrThrow(),
    ...input,
  });
}
