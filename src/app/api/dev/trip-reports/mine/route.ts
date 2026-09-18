/**
 * The signed-in member's own published trip reports, for My reports
 * (`/dev/my-reports`).
 *
 *   GET /api/dev/trip-reports/mine            → { reports }   (rows where owner_email is you)
 *   GET /api/dev/trip-reports/mine?scope=all  → { reports }   (admin: every report with an owner)
 *
 * Contributor floor. Rows carry identity and dates only; the body arrives from
 * `/api/dev/trip-reports/record?id=` when one is opened, the way the portal
 * splits its payload.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { canApprove } from "@/lib/auth/roles";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "contributor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load owned trip reports via Next route:",
  unexpectedErrorMessage: "Unable to load your trip reports right now.",
  operation: async ({ auth, actorEmail, dataWrite, request }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const scopeAll = new URL(request.url).searchParams.get("scope") === "all";
    if (scopeAll && !canApprove(auth.role)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const apiKey = dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;
    const storedReports = await dataWrite.client.query(api.tripReports.listOwned, {
      apiKey,
      actorEmail,
      ...(scopeAll ? { all: true } : {}),
    });
    const reports = storedReports.map(({ ownerEmail: _ownerEmail, ...report }) => report);

    return NextResponse.json({ ok: true, reports });
  },
});
