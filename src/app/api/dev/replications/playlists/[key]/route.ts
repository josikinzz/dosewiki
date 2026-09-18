/**
 * One reusable replication playlist.
 *
 *   GET    /api/dev/replications/playlists/<key> → the playlist, or 404
 *   PATCH  /api/dev/replications/playlists/<key> → add/remove one work
 *   DELETE /api/dev/replications/playlists/<key> → drop it
 * Updates go through the collection route's POST, which is already an upsert
 * keyed by `key`; there is no second write shape to maintain here. Both writes
 * sit at the contributor floor: Postgres admits the playlist's owner or an admin
 * and answers `NOT_OWNER` (a 403 here) to anyone else, so an unowned playlist
 * stays admin-only. `<key>/owner` hands a playlist to a member (admin).
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { isValidReplicationSlug } from "@/features/dev/tools/replication-studio/replicationStudioModel";
import { replicationViewerEditorRoute } from "@server/next/replicationViewerEditorPolicy";

export const runtime = "nodejs";

const PLAYLIST_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The `<key>` path segment, or a 404 refusal for a shape no playlist has. */
function playlistKeyOf(request: Request): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const key = decodeURIComponent(segments[segments.length - 1] ?? "").trim().toLowerCase();
  if (!PLAYLIST_KEY.test(key)) {
    throw new JsonBodyError(404, "No playlist found for that address.");
  }
  return key;
}

type MembershipBody = { slug?: unknown; included?: unknown };

function parseMembershipBody(raw: MembershipBody): {
  slug: string;
  included: boolean;
} {
  if (typeof raw.slug !== "string" || !isValidReplicationSlug(raw.slug)) {
    throw new JsonBodyError(400, "A valid replication slug is required.");
  }
  if (typeof raw.included !== "boolean") {
    throw new JsonBodyError(400, "included must be true or false.");
  }
  return { slug: raw.slug, included: raw.included };
}

export const GET = protectedRouteOperation({
  auth: "contributor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load a replication playlist via Next route:",
  unexpectedErrorMessage: "Unable to load that playlist right now.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    // Postgres applies ownership: a contributor reads only their own playlist,
    // so the actor must travel with the call.
    const playlist = await dataWrite.client.query(api.replicationPlaylists.get, {
      apiKey: dataWrite.getAdminIntentToken?.("replicationMaintenance") ?? dataWrite.adminKey,
      actorEmail,
      key: playlistKeyOf(request),
    });

    if (!playlist) {
      return NextResponse.json({ ok: false, error: "No playlist with that key." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, playlist });
  },
});

export const PATCH = replicationViewerEditorRoute(protectedRouteOperation<
  MembershipBody,
  ReturnType<typeof parseMembershipBody>
>({
  auth: "contributor",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: 4 * 1024, parse: parseMembershipBody },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to update playlist membership via Next route:",
  unexpectedErrorMessage: "Unable to update that playlist right now.",
  operation: async ({ request, actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }
    const result = await dataWrite.client.mutation(
      api.replicationPlaylists.setMembership,
      {
        apiKey:
          dataWrite.getAdminIntentToken?.("editorArticleWrite") ??
          dataWrite.adminKey,
        actorEmail,
        key: playlistKeyOf(request),
        replicationSlug: body.slug,
        included: body.included,
      },
    );
    return NextResponse.json({ ok: true, playlist: result });
  },
}));

export const DELETE = protectedRouteOperation({
  auth: "contributor",
  rateLimit: "editorSmallWrite",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to delete a replication playlist via Next route:",
  unexpectedErrorMessage: "Unable to delete that playlist right now.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const result = await dataWrite.client.mutation(api.replicationPlaylists.remove, {
      apiKey,
      actorEmail,
      key: playlistKeyOf(request),
    });

    if (result.status === "missing") {
      return NextResponse.json({ ok: false, error: "No playlist with that key." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, key: result.key });
  },
});
