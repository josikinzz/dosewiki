import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { requireCitationEvidenceRouteContext } from "../_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await requireCitationEvidenceRouteContext(request);
  if (context.ok === false) {
    return context.response;
  }

  try {
    const apiKey =
      context.convexWrite.getAdminIntentToken?.("citationEvidenceReview") ??
      context.convexWrite.adminKey;
    const queue = await context.convexWrite.client.query(api.citationEvidence.getQueueSummary, {
      apiKey,
      actorEmail: context.auth.session.user.email,
    });

    return NextResponse.json({
      ok: true,
      queue,
    });
  } catch (error) {
    console.error("Failed to read citation review queue via Next route:", error);
    return NextResponse.json(
      { error: "Unable to load the citation review queue right now." },
      { status: 500 },
    );
  }
}
