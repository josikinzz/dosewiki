import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load the trip report corpus via Next route:",
  unexpectedErrorMessage: "Unable to load the trip report corpus right now.",
  operation: async ({ actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey = dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;
    const [reports, profiles] = await Promise.all([
      dataWrite.client.query(api.tripReports.getPortalRows, { apiKey, actorEmail }),
      dataWrite.client.query(api.contributorProfiles.getAll, {}),
    ]);

    return NextResponse.json({
      ok: true,
      reports,
      contributors: profiles.map((profile) => ({
        key: profile.key,
        displayName: profile.displayName,
      })),
    });
  },
});
