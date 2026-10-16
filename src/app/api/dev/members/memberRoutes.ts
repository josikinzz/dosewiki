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
  self: string;
  members: MemberRosterRow[];
};
