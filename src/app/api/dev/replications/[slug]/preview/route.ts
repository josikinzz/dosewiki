import { NextResponse } from "next/server";
import { makeFunctionReference } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";

export const runtime = "nodejs";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const getStudioPreview = makeFunctionReference<
  "query",
  { apiKey?: string; actorEmail?: string; slug: string },
  { slug: string; preview_url: string | null } | null
>("replications:getStudioPreview");

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load a replication preview via Next route:",
  unexpectedErrorMessage: "Unable to load that replication preview right now.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) throw new Error("Postgres write capability is required.");

    const segments = new URL(request.url).pathname.split("/").filter(Boolean);
    const slug = decodeURIComponent(segments[segments.length - 2] ?? "").trim();
    if (!SLUG_PATTERN.test(slug)) {
      throw new JsonBodyError(400, "A valid replication slug is required.");
    }

    const apiKey = dataWrite.getAdminIntentToken?.("replicationMaintenance") ?? dataWrite.adminKey;
    const preview = await dataWrite.client.query(getStudioPreview, { apiKey, actorEmail, slug });
    if (!preview) {
      return NextResponse.json({ ok: false, error: "Replication not found." }, { status: 404 });
    }
    if (!preview.preview_url) {
      return NextResponse.json({ ok: false, error: "No preview rendition is available." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, previewUrl: preview.preview_url });
  },
});
