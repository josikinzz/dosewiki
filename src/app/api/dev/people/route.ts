/**
 * GET /api/dev/people: the account roster plus the account-to-profile links,
 * for the People tab. Admin only, like the roster it extends: membership
 * emails are private on both sides.
 *
 * The link itself is written through `/api/dev/contributor-profile`, whose
 * admin path already owns the membership email field; this route only reads.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import type { MemberRosterResponse } from "../members/memberRoutes";

export const runtime = "nodejs";

export type PeopleResponse = MemberRosterResponse & {
  /** Every live profile that names a sign-in, by normalized key and email. */
  links: { key: string; membershipEmail: string }[];
};

export const GET = protectedRouteOperation({
  auth: "admin",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load people via Next route:",
  unexpectedErrorMessage: "Unable to load people right now.",
  operation: async ({ actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const actor = { apiKey: dataWrite.adminKey, actorEmail };
    const [members, links] = await Promise.all([
      dataWrite.client.query(api.memberships.listRoster, actor),
      dataWrite.client.query(api.contributorProfiles.listMembershipLinks, actor),
    ]);

    const body: PeopleResponse = { ok: true, self: actorEmail, members, links };
    return NextResponse.json(body);
  },
});
