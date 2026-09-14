/**
 * Shared pieces of the `/api/dev/members/*` routes: the body every action
 * takes (a target email) and the rows the roster returns.
 */
import { JsonBodyError } from "@/lib/http/readJsonBody";
import type { AppRole } from "@/lib/auth/roles";

export const MEMBER_BODY_MAX_BYTES = 4 * 1024;

const MAX_EMAIL_LENGTH = 320;

export type MemberActionBody = { email?: unknown };

export function parseMemberEmail(raw: MemberActionBody): { email: string } {
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  if (!email || email.length > MAX_EMAIL_LENGTH || !email.includes("@")) {
    throw new JsonBodyError(400, "A member email is required.");
  }
  return { email };
}

/** One roster row as the Members tab sees it. Mirrors `memberships.listRoster`. */
type MemberRosterRow = {
  email: string;
  username?: string;
  name?: string;
  role: AppRole;
  createdAt?: string;
  lastSeenAt?: string;
  bannedAt?: string;
  invitedBy?: string;
  inviteCodeId?: string;
};

export type MemberRosterResponse = {
  ok: true;
  /** The signed-in admin, so the tab can disable actions on their own row. */
  self: string;
  members: MemberRosterRow[];
};
