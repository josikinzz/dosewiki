/**
 * GET /api/dev/members: the account roster for the Members tab. Admin only;
 * the Convex projection never includes password hashes or reset tokens.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import type { MemberRosterResponse } from "./memberRoutes";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "admin",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to load the member roster via Next route:",
  unexpectedErrorMessage: "Unable to load the member roster right now.",
  operation: async ({ actorEmail, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const members = await convexWrite.client.query(api.memberships.listRoster, {
      apiKey: convexWrite.adminKey,
      actorEmail,
    });

    const body: MemberRosterResponse = { ok: true, self: actorEmail, members };
    return NextResponse.json(body);
  },
});
