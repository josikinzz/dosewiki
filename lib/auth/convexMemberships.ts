import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { AppRole } from "../../src/lib/auth/roles";

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
  { email: string },
  MembershipRecord | null
>("memberships:getByEmail");

const upsertMembershipFromAuthMutation = makeFunctionReference<
  "mutation",
  {
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
  const url =
    process.env.CONVEX_URL ??
    process.env.VITE_CONVEX_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL;

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

function getAdminEmails(): string[] {
  const rawValue = process.env.AUTH_ADMIN_EMAILS ?? "";

  return rawValue
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

export async function syncMembershipFromAuth(input: SyncMembershipInput): Promise<AppRole> {
  const result = await getConvexClient().mutation(upsertMembershipFromAuthMutation, {
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
  const membership = await getConvexClient().query(getMembershipByEmailQuery, { email });

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
