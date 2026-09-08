/**
 * POST /api/dev/members/role  { email, role: "editor" | "contributor" }
 *
 * Admin only. Convex refuses admin targets, the actor's own row, and (by
 * validator) any attempt to grant admin: admins are seeded from a workstation.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { MEMBER_BODY_MAX_BYTES, parseMemberEmail, type MemberActionBody } from "../memberRoutes";

export const runtime = "nodejs";

type RoleBody = MemberActionBody & { role?: unknown };
type ParsedRole = { email: string; role: "editor" | "contributor" };

function parseRoleBody(raw: RoleBody): ParsedRole {
  const { email } = parseMemberEmail(raw);
  if (raw.role !== "editor" && raw.role !== "contributor") {
    throw new JsonBodyError(400, "Role must be editor or contributor.");
  }
  return { email, role: raw.role };
}

export const POST = protectedRouteOperation<RoleBody, ParsedRole>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: MEMBER_BODY_MAX_BYTES, parse: parseRoleBody },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to change a member role via Next route:",
  unexpectedErrorMessage: "Unable to change that member's role right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    await convexWrite.client.mutation(api.memberships.setRole, {
      apiKey: convexWrite.adminKey,
      actorEmail,
      email: body.email,
      role: body.role,
    });

    return NextResponse.json({ ok: true, email: body.email, role: body.role });
  },
});
