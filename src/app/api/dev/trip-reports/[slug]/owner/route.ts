/**
 * Hand a published trip report to a member.
 *
 *   POST /api/dev/trip-reports/<slug>/owner  { email } -> { ok, slug, ownerEmail }
 *
 * Admin only: ownership lets a contributor rewrite a published page from
 * My reports, so it is granted by the role that publishes. The email must
 * belong to an existing membership; Postgres refuses `MEMBER_NOT_FOUND` and
 * `REPORT_NOT_FOUND` otherwise.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

type OwnerBody = { email?: unknown };

type ParsedOwnerBody = { email: string };

function parseOwnerBody(raw: OwnerBody): ParsedOwnerBody {
  const email = typeof raw.email === "string" ? raw.email.trim() : "";
  if (email.length === 0 || email.length > 320) {
    throw new JsonBodyError(400, "A member email is required.");
  }
  return { email };
}

/** The `<slug>` segment of `/api/dev/trip-reports/<slug>/owner`. */
function slugOf(request: Request): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const slug = decodeURIComponent(segments[segments.indexOf("trip-reports") + 1] ?? "").trim();
  if (slug.length === 0 || slug === "owner") {
    throw new JsonBodyError(404, "No trip report found for that address.");
  }
  return slug;
}

export const POST = protectedRouteOperation<OwnerBody, ParsedOwnerBody>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: 4 * 1024, parse: parseOwnerBody },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to assign a trip report owner via Next route:",
  unexpectedErrorMessage: "Unable to assign that owner right now.",
  operation: async ({ request, actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const result = await dataWrite.client.mutation(api.tripReports.assignOwner, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail,
      slug: slugOf(request),
      email: body.email,
    });

    return NextResponse.json({ ok: true, ...result });
  },
});
