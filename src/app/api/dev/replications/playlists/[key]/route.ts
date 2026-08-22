/**
 * One reusable replication playlist.
 *
 *   GET    /api/dev/replications/playlists/<key> → the playlist, or 404
 *   DELETE /api/dev/replications/playlists/<key> → drop it
 *
 * Updates go through the collection route's POST, which is already an upsert
 * keyed by `key`; there is no second write shape to maintain here.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../../../convex/_generated/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

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

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to load a replication playlist via Next route:",
  unexpectedErrorMessage: "Unable to load that playlist right now.",
  operation: async ({ request, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const playlist = await convexWrite.client.query(api.replicationPlaylists.get, {
      apiKey: convexWrite.getAdminIntentToken?.("replicationMaintenance") ?? convexWrite.adminKey,
      key: playlistKeyOf(request),
    });

    if (!playlist) {
      return NextResponse.json({ ok: false, error: "No playlist with that key." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, playlist });
  },
});

export const DELETE = protectedRouteOperation({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to delete a replication playlist via Next route:",
  unexpectedErrorMessage: "Unable to delete that playlist right now.",
  operation: async ({ request, actorEmail, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    const result = await convexWrite.client.mutation(api.replicationPlaylists.remove, {
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
