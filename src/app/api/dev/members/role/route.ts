/**
 * POST /api/dev/members/role  { email, role, glossaryLocales }
 *
 * Admin only. Postgres refuses admin targets, the actor's own row, and (by
 * validator) any attempt to grant admin: admins are seeded from a workstation.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { isManagedRole, parseGlossaryLocaleGrant, type ManagedRole } from "@/lib/auth/roles";
import { MEMBER_BODY_MAX_BYTES, parseMemberEmail, type MemberActionBody } from "../memberRoutes";

export const runtime = "nodejs";

type RoleBody = MemberActionBody & { role?: unknown; glossaryLocales?: unknown };
type ParsedRole = { email: string; role: ManagedRole; glossaryLocales: string[] };

function parseRoleBody(raw: RoleBody): ParsedRole {
  const { email } = parseMemberEmail(raw);
  if (!isManagedRole(raw.role)) {
    throw new JsonBodyError(400, "Choose Editor, Translator, both, or Contributor.");
  }
  try {
    return { email, role: raw.role, glossaryLocales: parseGlossaryLocaleGrant(raw.role, raw.glossaryLocales) };
  } catch (error) {
    throw new JsonBodyError(400, error instanceof Error ? error.message : "Invalid glossary language grant.");
  }
}

export const POST = protectedRouteOperation<RoleBody, ParsedRole>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: MEMBER_BODY_MAX_BYTES, parse: parseRoleBody },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to change a member role via Next route:",
  unexpectedErrorMessage: "Unable to change that member's role right now.",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    await dataWrite.client.mutation(api.memberships.setRole, {
      apiKey: dataWrite.adminKey,
      actorEmail,
      email: body.email,
      role: body.role,
      glossaryLocales: body.glossaryLocales,
    });

    return NextResponse.json({ ok: true, email: body.email, role: body.role });
  },
});
