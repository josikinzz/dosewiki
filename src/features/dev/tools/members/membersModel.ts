/**
 * Pure helpers and the HTTP client for the Members tab (`/api/dev/members`).
 */

import type { AppRole, ManagedRole } from "@/lib/auth/roles";

export type MemberRow = {
  email: string;
  username?: string;
  name?: string;
  role: AppRole;
  glossaryLocales?: string[];
  lastSeenAt?: string;
  bannedAt?: string;
  invitedBy?: string;
};

export type MemberRoster = {
  /** The signed-in admin's email; their own row takes no actions. */
  self: string;
  members: MemberRow[];
};

/**
 * Why a row shows no actions. `admin` rows are seeded and rotated from a
 * workstation; the actor's own row is off limits so an admin cannot lock
 * themselves out from the roster. Both are refused by Postgres as well.
 */
export type MemberRowLock = "admin" | "self" | null;

export function memberRowLock(row: MemberRow, self: string): MemberRowLock {
  if (row.role === "admin") {
    return "admin";
  }
  return row.email === self.trim().toLowerCase() ? "self" : null;
}

const ROLE_RANK: Record<AppRole, number> = { admin: 0, editor_translator: 1, editor: 2, translator: 3, contributor: 4, viewer: 5 };

/** Admins first, then by role, then by username (email when a row has none). */
export function sortRoster(rows: readonly MemberRow[]): MemberRow[] {
  return [...rows].sort(
    (a, b) =>
      ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
      (a.username ?? a.email).localeCompare(b.username ?? b.email),
  );
}

/** A short "when" for the roster: date only, the time never matters here. */
export function formatSeen(iso: string | undefined): string {
  if (!iso) {
    return "Never";
  }
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return "Unknown";
  }
  return new Date(time).toISOString().slice(0, 10);
}

const BASE_PATH = "/api/dev/members";

export async function fetchRoster(): Promise<MemberRoster> {
  const payload = await requestJson(BASE_PATH, undefined, {
    network: "Network error while loading members.",
    failure: "Unable to load members.",
  });
  return {
    self: typeof payload.self === "string" ? payload.self : "",
    members: Array.isArray(payload.members) ? (payload.members as MemberRow[]) : [],
  };
}

export async function setMemberRole(email: string, role: ManagedRole, glossaryLocales: string[]): Promise<void> {
  await postJson("role", { email, role, glossaryLocales }, "Unable to change that member's permissions.");
}

export async function banMember(email: string): Promise<void> {
  await postJson("ban", { email }, "Unable to ban that member.");
}

export async function unbanMember(email: string): Promise<void> {
  await postJson("unban", { email }, "Unable to unban that member.");
}

/** Returns the one-time reset path (`/reset-password?token=...`). */
export async function issueMemberReset(email: string): Promise<string> {
  const payload = await postJson("reset", { email }, "Unable to issue a password reset.");
  if (typeof payload.resetPath !== "string") {
    throw new Error("The reset route returned no link.");
  }
  return payload.resetPath;
}

async function postJson(
  action: string,
  body: Record<string, unknown>,
  failure: string,
): Promise<Record<string, unknown>> {
  return requestJson(
    `${BASE_PATH}/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { network: "Network error while updating the member.", failure },
  );
}

async function requestJson(
  url: string,
  init: RequestInit | undefined,
  messages: { network: string; failure: string },
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = init ? await fetch(url, init) : await fetch(url);
  } catch {
    throw new Error(messages.network);
  }

  const payload: Record<string, unknown> = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : messages.failure);
  }
  return payload;
}
