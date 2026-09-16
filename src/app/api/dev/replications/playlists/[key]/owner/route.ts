/**
 * POST /api/dev/replications/playlists/<key>/owner  { ownerEmail: string | null }
 *
 * Admin only. Hands a playlist to a member so they can edit it at the
 * contributor floor, or (`null`) takes it back to the unowned, admin-only
 * state. Postgres refuses an address with no membership (`MEMBER_NOT_FOUND`).
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

const PLAYLIST_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The `<key>` segment before `/owner`, or a 404 refusal for a shape no playlist has. */
function playlistKeyOf(request: Request): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const key = decodeURIComponent(segments[segments.length - 2] ?? "").trim().toLowerCase();
  if (!PLAYLIST_KEY.test(key)) {
    throw new JsonBodyError(404, "No playlist found for that address.");
  }
  return key;
}

type OwnerBody = { ownerEmail?: unknown };
type ParsedOwner = { ownerEmail: string | null };

function parseOwnerBody(raw: OwnerBody): ParsedOwner {
  if (raw?.ownerEmail === null || raw?.ownerEmail === "") {
    return { ownerEmail: null };
  }
  if (typeof raw?.ownerEmail !== "string") {
    throw new JsonBodyError(400, "ownerEmail must be a member's email, or null to leave the playlist unowned.");
  }
  const ownerEmail = raw.ownerEmail.trim().toLowerCase();
  if (ownerEmail.length > 254 || !ownerEmail.includes("@")) {
    throw new JsonBodyError(400, "ownerEmail must be a member's email.");
  }
  return { ownerEmail };
}

export const POST = protectedRouteOperation<OwnerBody, ParsedOwner>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: 4 * 1024, parse: parseOwnerBody },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to assign a playlist owner via Next route:",
  unexpectedErrorMessage: "Unable to change that playlist's owner right now.",
  operation: async ({ request, actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const result = await dataWrite.client.mutation(api.replicationPlaylists.assignOwner, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail,
      key: playlistKeyOf(request),
      ownerEmail: body.ownerEmail,
    });

    if (result.status === "missing") {
      return NextResponse.json({ ok: false, error: "No playlist with that key." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      key: result.key,
      owner_email: result.owner_email,
      updated_at: result.updated_at,
      updated_by: result.updated_by,
    });
  },
});
