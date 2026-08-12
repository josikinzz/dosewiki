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
 *   GET /api/dev/trip-reports → { reports, authors, contributors }
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to load the trip report corpus via Next route:",
  unexpectedErrorMessage: "Unable to load the trip report corpus right now.",
  operation: async ({ actorEmail, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey = convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;
    const [reports, authors, profiles] = await Promise.all([
      convexWrite.client.query(api.tripReports.getPortalRows, { apiKey, actorEmail }),
      convexWrite.client.query(api.tripReports.getAuthorNames, {}),
      convexWrite.client.query(api.contributorProfiles.getAll, {}),
    ]);

    return NextResponse.json({
      ok: true,
      reports,
      authors,
      // The byline picker offers contributor display names alongside existing
      // bylines, because assigning one is the case that needs a profile key.
      contributors: profiles.map((profile) => ({
        key: profile.key,
        displayName: profile.displayName,
      })),
    });
  },
});
