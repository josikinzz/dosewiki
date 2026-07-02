import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { AppRole } from "../../src/lib/auth/roles";
import { getAuthMembershipTarget, getServerConvexAdminKey } from "../convex/serverWriteHealth";

type SyncMembershipInput = {
  email: string;
  name?: string | null;
  image?: string | null;
  provider?: string | null;
  providerAccountId?: string | null;
};

type MembershipRecord = {
  email: string;
  role: AppRole;
  name?: string;
  image?: string;
};

const getMembershipByEmailQuery = makeFunctionReference<
  "query",
  { apiKey: string; email: string },
  MembershipRecord | null
>("memberships:getByEmail");

const upsertMembershipFromAuthMutation = makeFunctionReference<
  "mutation",
  {
    apiKey: string;
    email: string;
    name?: string;
    image?: string;
    provider?: string;
    providerAccountId?: string;
    adminEmails?: string[];
  },
  { membershipId: string; role: AppRole }
>("memberships:upsertFromAuth");

let cachedClient: ConvexHttpClient | null = null;
let cachedUrl: string | null = null;

function getServerConvexUrl(): string {
  const url = getAuthMembershipTarget().selectedUrl;

  if (!url) {
    throw new Error(
      "Convex URL is not configured. Set CONVEX_URL, VITE_CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL."
    );
  }

  return url;
}

function getConvexClient(): ConvexHttpClient {
  const url = getServerConvexUrl();

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
      "CONVEX_ADMIN_KEY is not configured on the server; membership sync requires it."
    );
  }

  return adminKey;
}

function getAdminEmails(): string[] {
  const rawValue = process.env.AUTH_ADMIN_EMAILS ?? "";

  return rawValue
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

export async function syncMembershipFromAuth(input: SyncMembershipInput): Promise<AppRole> {
  const result = await getConvexClient().mutation(upsertMembershipFromAuthMutation, {
    apiKey: getConvexAdminKeyOrThrow(),
    email: input.email,
    name: input.name ?? undefined,
    image: input.image ?? undefined,
    provider: input.provider ?? undefined,
    providerAccountId: input.providerAccountId ?? undefined,
    adminEmails: getAdminEmails(),
  });

  return result.role;
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
  };
}
