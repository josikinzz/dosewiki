/**
 * The signed-in member's own trip report submissions, for the Submissions
 * list in My reports (`/dev/my-reports`).
 *
 *   GET /api/dev/trip-reports/mine/submissions → { submissions }
 *
 * Contributor floor. The member is the session's actor, never a query
 * parameter; Postgres matches it against each submission's contact email.
 * Each row is re-projected here as well, so only the status word, dates, the
 * public reason and the published address can leave: never the private review
 * note, the reviewer, the decision log or other intake metadata.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

const MEMBER_FIELDS = ["id", "title", "status", "submitted_at", "decided_at", "public_reason", "report_slug"] as const;

export const GET = protectedRouteOperation({
  auth: "contributor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load the member's trip report submissions via Next route:",
  unexpectedErrorMessage: "Unable to load your submissions right now.",
  operation: async ({ actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey = dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;
    const stored = await dataWrite.client.query(api.tripReportSubmissions.listMine, { apiKey, actorEmail });
    const submissions = stored.map((row) => {
      const projected: Record<string, unknown> = {};
      for (const field of MEMBER_FIELDS) {
        if (row[field] !== undefined) projected[field] = row[field];
      }
      return projected;
    });

    return NextResponse.json({ ok: true, submissions });
  },
});
