import { NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import { citationEvidenceRouteOperation } from "./_shared";

export const runtime = "nodejs";

export const GET = citationEvidenceRouteOperation({
  unexpectedErrorLabel: "Failed to read citation evidence via Next route:",
  unexpectedErrorMessage: "Unable to load citation evidence right now.",
  operation: async ({ request, actorEmail, convexWrite }) => {
    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
    if (!slug) {
      return NextResponse.json({ error: "Slug is required." }, { status: 400 });
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("citationEvidenceReview") ??
      convexWrite.adminKey;
    const rows = await convexWrite.client.query(api.citationEvidence.getBySlug, {
      apiKey,
      actorEmail,
      slug,
    });

    return NextResponse.json({
      ok: true,
      slug,
      rows,
    });
  },
});
