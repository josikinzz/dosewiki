/**
 * POST /api/dev/members/ban  { email }
 *
 * Admin only. A banned member is refused at sign-in and at every Convex
 * floor; Convex refuses admin targets and the actor's own row.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { MEMBER_BODY_MAX_BYTES, parseMemberEmail, type MemberActionBody } from "../memberRoutes";

export const runtime = "nodejs";

export const POST = protectedRouteOperation<MemberActionBody, { email: string }>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: MEMBER_BODY_MAX_BYTES, parse: parseMemberEmail },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to ban a member via Next route:",
  unexpectedErrorMessage: "Unable to ban that member right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    await convexWrite.client.mutation(api.memberships.ban, {
      apiKey: convexWrite.adminKey,
      actorEmail,
      email: body.email,
    });

    return NextResponse.json({ ok: true, email: body.email });
  },
});
