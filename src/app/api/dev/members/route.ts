/**
 * GET /api/dev/members: the account roster for the Members tab. Admin only;
 * the Postgres projection never includes password hashes or reset tokens.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import type { MemberRosterResponse } from "./memberRoutes";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "admin",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load the member roster via Next route:",
  unexpectedErrorMessage: "Unable to load the member roster right now.",
  operation: async ({ actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const members = await dataWrite.client.query(api.memberships.listRoster, {
      apiKey: dataWrite.adminKey,
      actorEmail,
    });

    const body: MemberRosterResponse = { ok: true, self: actorEmail, members };
    return NextResponse.json(body);
  },
});
