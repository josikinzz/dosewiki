/**
 * Invite code admin routes (the /dev Members tab).
 *
 *   GET  /api/dev/invites  → { ok, invites, continuationCursor }
 *   POST /api/dev/invites  → { ok, code, invite }   mints one code
 *
 * The plaintext code exists only in the POST response: the route generates
 * it, stores its sha256 and hands it back once. Both directions are admin
 * only and delegated through the server key plus the session's email, like
 * every other /dev write.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { generateInviteCode, hashInviteCode, normalizeInviteCode } from "@server/auth/inviteCodes";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { isManagedRole, parseGlossaryLocaleGrant } from "@/lib/auth/roles";
import type { MintInviteInput } from "@/features/dev/tools/members/inviteCodeRequests";

export const runtime = "nodejs";

const MAX_NOTE_LENGTH = 200;
const DEFAULT_EXPIRES_IN_DAYS = 7;
const DEFAULT_MAX_USES = 1;

type MintBody = {
  role?: unknown;
  glossaryLocales?: unknown;
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
  if (!isManagedRole(raw?.role)) {
    throw new JsonBodyError(400, "Choose Editor, Translator, both, or Contributor.");
  }
  const role = raw.role;
  let glossaryLocales: string[];
  try {
    glossaryLocales = parseGlossaryLocaleGrant(role, raw.glossaryLocales);
  } catch (error) {
    throw new JsonBodyError(400, error instanceof Error ? error.message : "Invalid glossary language grant.");
  }

  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (note.length > MAX_NOTE_LENGTH) {
    throw new JsonBodyError(400, `Notes are limited to ${MAX_NOTE_LENGTH} characters.`);
  }

  return {
    role,
    glossaryLocales,
    ...(note ? { note } : {}),
    expiresInDays: parsePositiveInteger(raw.expiresInDays, DEFAULT_EXPIRES_IN_DAYS, "Expiry"),
    maxUses: parsePositiveInteger(raw.maxUses, DEFAULT_MAX_USES, "Uses"),
  };
}

export const GET = protectedRouteOperation({
  auth: "admin",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to list invite codes via Next route:",
  unexpectedErrorMessage: "Unable to load invite codes right now.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const cursor = new URL(request.url).searchParams.get("cursor")?.trim() || undefined;
    const page = await dataWrite.client.query(api.inviteCodes.list, {
      apiKey: dataWrite.adminKey,
      actorEmail,
      ...(cursor ? { cursor } : {}),
    });

    return NextResponse.json({ ok: true, ...page });
  },
});

export const POST = protectedRouteOperation<MintBody, MintInviteInput>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 4 * 1024,
    parse: parseMintBody,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to mint an invite code via Next route:",
  unexpectedErrorMessage: "Unable to mint an invite code right now.",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const code = generateInviteCode();
    const codeHash = hashInviteCode(normalizeInviteCode(code));

    const invite = await dataWrite.client.mutation(api.inviteCodes.mint, {
      apiKey: dataWrite.adminKey,
      actorEmail,
      role: body.role,
      glossaryLocales: body.glossaryLocales,
      codeHash,
      note: body.note,
      expiresInDays: body.expiresInDays,
      maxUses: body.maxUses,
    });

    return NextResponse.json({ ok: true, code, invite });
  },
});
