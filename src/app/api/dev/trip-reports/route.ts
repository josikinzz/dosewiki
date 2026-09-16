/**
 * Corpus read for the Trip Report Portal (`/dev` → Trip reports).
 *
 * The portal indexes the whole published `tripReports` table, which no public
 * projection returns in the shape an editor needs: it carries the editable
 * field slice verbatim, plus the attribution and licence facts that decide what
 * the byline control is allowed to do. The intake queue is fetched separately
 * from `/api/trip-report-submissions/queue`, which already exists and already
 * owns the submission shape.
 *
 *   GET /api/dev/trip-reports → { reports, contributors }
 */
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
      // The byline picker offers contributor display names alongside existing
      // bylines, because assigning one is the case that needs a profile key.
      contributors: profiles.map((profile) => ({
        key: profile.key,
        displayName: profile.displayName,
      })),
    });
  },
});
