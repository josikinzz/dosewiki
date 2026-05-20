import { NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import { requireCitationEvidenceRouteContext } from "./_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await requireCitationEvidenceRouteContext(request);
  if (context.ok === false) {
    return context.response;
  }

  const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
  if (!slug) {
    return NextResponse.json({ error: "Slug is required." }, { status: 400 });
  }

  try {
    const apiKey =
      context.convexWrite.getAdminIntentToken?.("citationEvidenceReview") ??
      context.convexWrite.adminKey;
    const rows = await context.convexWrite.client.query(api.citationEvidence.getBySlug, {
      apiKey,
      actorEmail: context.auth.session.user.email,
      slug,
    });

    return NextResponse.json({
      ok: true,
      slug,
      rows,
    });
  } catch (error) {
    console.error("Failed to read citation evidence via Next route:", error);
    return NextResponse.json(
      { error: "Unable to load citation evidence right now." },
      { status: 500 },
    );
  }
}
