import type { ManagedRole } from "@/lib/auth/roles";
import { devFetch } from "@/features/dev/tools/devFetch";

export type InviteCodeRole = ManagedRole;
export type InviteCodeStatus = "active" | "expired" | "exhausted" | "revoked";

export type InviteCodeSummary = {
  id: string;
  role: InviteCodeRole;
  glossaryLocales?: string[];
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number;
  redemptions: { email: string; at: string }[];
  revokedAt?: string;
  note?: string;
  status: InviteCodeStatus;
};

export type MintInviteInput = {
  role: InviteCodeRole;
  glossaryLocales?: string[];
  note?: string;
  expiresInDays: number;
  maxUses: number;
};

export type MintedInvite = {
  code: string;
  invite: InviteCodeSummary;
};

const BASE_PATH = "/api/dev/invites";

export type InviteCodePage = {
  invites: InviteCodeSummary[];
  continuationCursor: string | null;
};

export async function fetchInviteCodes(cursor?: string): Promise<InviteCodePage> {
  const url = cursor ? `${BASE_PATH}?cursor=${encodeURIComponent(cursor)}` : BASE_PATH;
  const payload = await requestJson(url, undefined, {
    network: "Network error while loading invite codes.",
    failure: "Unable to load invite codes.",
  });
  return {
    invites: Array.isArray(payload.invites) ? (payload.invites as InviteCodeSummary[]) : [],
    continuationCursor:
      typeof payload.continuationCursor === "string" ? payload.continuationCursor : null,
  };
}

export async function mintInviteCode(input: MintInviteInput): Promise<MintedInvite> {
  const payload = await requestJson(
    BASE_PATH,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    {
      network: "Network error while minting the invite code.",
      failure: "Unable to mint an invite code.",
    },
  );
  if (typeof payload.code !== "string" || typeof payload.invite !== "object" || payload.invite === null) {
    throw new Error("The invite route returned an unexpected response.");
  }
  return { code: payload.code, invite: payload.invite as InviteCodeSummary };
}

export async function revokeInviteCode(id: string): Promise<void> {
  await requestJson(
    `${BASE_PATH}/${encodeURIComponent(id)}/revoke`,
    { method: "POST" },
    {
      network: "Network error while revoking the invite code.",
      failure: "Unable to revoke the invite code.",
    },
  );
}

function requestJson(
  url: string,
  init: RequestInit | undefined,
  messages: { network: string; failure: string },
) {
  return devFetch(url, { ...init, messages, emptyBodyOk: true });
}
