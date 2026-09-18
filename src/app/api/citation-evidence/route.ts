import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { citationEvidenceRouteOperation } from "./_shared";

export const runtime = "nodejs";

export const GET = citationEvidenceRouteOperation({
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: "Failed to read citation evidence via Next route:",
  unexpectedErrorMessage: "Unable to load citation evidence right now.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
    if (!slug) {
      return NextResponse.json({ error: "Slug is required." }, { status: 400 });
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("citationEvidenceReview") ??
      dataWrite.adminKey;
    const rows = await dataWrite.client.query(api.citationEvidence.getBySlug, {
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
