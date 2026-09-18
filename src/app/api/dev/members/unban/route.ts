/**
 * POST /api/dev/members/unban  { email }
 *
 * Admin only. Clears `bannedAt`; Postgres refuses admin targets and the
 * actor's own row.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { MEMBER_BODY_MAX_BYTES, parseMemberEmail, type MemberActionBody } from "../memberRoutes";

export const runtime = "nodejs";

export const POST = protectedRouteOperation<MemberActionBody, { email: string }>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: MEMBER_BODY_MAX_BYTES, parse: parseMemberEmail },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to unban a member via Next route:",
  unexpectedErrorMessage: "Unable to unban that member right now.",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    await dataWrite.client.mutation(api.memberships.unban, {
      apiKey: dataWrite.adminKey,
      actorEmail,
      email: body.email,
    });

    return NextResponse.json({ ok: true, email: body.email });
  },
});
