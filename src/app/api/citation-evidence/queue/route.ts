import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { citationEvidenceRouteOperation } from "../_shared";

export const runtime = "nodejs";

export const GET = citationEvidenceRouteOperation({
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: "Failed to read citation review queue via Next route:",
  unexpectedErrorMessage: "Unable to load the citation review queue right now.",
  operation: async ({ actorEmail, convexWrite }) => {
    const apiKey =
      convexWrite.getAdminIntentToken?.("citationEvidenceReview") ??
      convexWrite.adminKey;
    const queue = await convexWrite.client.query(api.citationEvidence.getQueueSummary, {
      apiKey,
      actorEmail,
    });

    return NextResponse.json({
      ok: true,
      queue,
    });
  },
});
