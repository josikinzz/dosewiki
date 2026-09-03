/**
 * Invite code admin routes (the /dev Members tab).
 *
 *   GET  /api/dev/invites  → { ok, invites }
 *   POST /api/dev/invites  → { ok, code, invite }   mints one code
 *
 * The plaintext code exists only in the POST response: the route generates
 * it, stores its sha256 and hands it back once. Both directions are admin
 * only and delegated through the server key plus the session's email, like
 * every other /dev write.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { generateInviteCode, hashInviteCode, normalizeInviteCode } from "@server/auth/inviteCodes";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import type { InviteCodeRole, MintInviteInput } from "@/features/dev/tools/members/inviteCodeRequests";

export const runtime = "nodejs";

const MAX_NOTE_LENGTH = 200;
const DEFAULT_EXPIRES_IN_DAYS = 7;
const DEFAULT_MAX_USES = 1;

type MintBody = {
  role?: unknown;
  note?: unknown;
  expiresInDays?: unknown;
  maxUses?: unknown;
};

function parsePositiveInteger(raw: unknown, fallback: number, label: string): number {
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const value = typeof raw === "string" ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new JsonBodyError(400, `${label} must be a whole number of at least 1.`);
  }
  return value;
}

function parseMintBody(raw: MintBody): MintInviteInput {
  if (raw?.role !== "editor" && raw?.role !== "contributor") {
    throw new JsonBodyError(400, "Role must be editor or contributor.");
  }
  const role: InviteCodeRole = raw.role;

  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (note.length > MAX_NOTE_LENGTH) {
    throw new JsonBodyError(400, `Notes are limited to ${MAX_NOTE_LENGTH} characters.`);
  }

  return {
    role,
    ...(note ? { note } : {}),
    expiresInDays: parsePositiveInteger(raw.expiresInDays, DEFAULT_EXPIRES_IN_DAYS, "Expiry"),
    maxUses: parsePositiveInteger(raw.maxUses, DEFAULT_MAX_USES, "Uses"),
  };
}

export const GET = protectedRouteOperation({
  auth: "admin",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to list invite codes via Next route:",
  unexpectedErrorMessage: "Unable to load invite codes right now.",
  operation: async ({ actorEmail, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const invites = await convexWrite.client.query(api.inviteCodes.list, {
      apiKey: convexWrite.adminKey,
      actorEmail,
    });

    return NextResponse.json({ ok: true, invites });
  },
});

export const POST = protectedRouteOperation<MintBody, MintInviteInput>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 4 * 1024,
    parse: parseMintBody,
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to mint an invite code via Next route:",
  unexpectedErrorMessage: "Unable to mint an invite code right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const code = generateInviteCode();
    const codeHash = hashInviteCode(normalizeInviteCode(code));

    const invite = await convexWrite.client.mutation(api.inviteCodes.mint, {
      apiKey: convexWrite.adminKey,
      actorEmail,
      role: body.role,
      codeHash,
      note: body.note,
      expiresInDays: body.expiresInDays,
      maxUses: body.maxUses,
    });

    return NextResponse.json({ ok: true, code, invite });
  },
});
