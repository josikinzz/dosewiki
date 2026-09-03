import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { AppRole } from "../../src/lib/auth/roles";
import { getAuthMembershipTarget, getServerConvexAdminKey } from "../convex/serverWriteHealth";

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

let cachedClient: ConvexHttpClient | null = null;
let cachedUrl: string | null = null;

function getConvexClient(): ConvexHttpClient {
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

export async function touchSignIn(email: string): Promise<void> {
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
