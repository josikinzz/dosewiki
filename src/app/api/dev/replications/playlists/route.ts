import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { roleMeetsFloor } from "@/lib/auth/roles";
import { isValidReplicationSlug } from "@/features/dev/tools/replication-studio/replicationStudioModel";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 32 * 1024;

const MAX_PLAYLIST_SLUGS = 250;

const PLAYLIST_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PlaylistBody = {
  key?: unknown;
  title?: unknown;
  slugs?: unknown;
  expectedUpdatedAt?: unknown;
  ownerEmail?: unknown;
};

export type ParsedPlaylist = {
  key: string;
  title: string;
  slugs: string[];
  expectedUpdatedAt: string | null | undefined;
  ownerEmail: string | undefined;
};

function parsePlaylistBody(raw: PlaylistBody): ParsedPlaylist {
  if (typeof raw?.key !== "string" || !PLAYLIST_KEY.test(raw.key)) {
    throw new JsonBodyError(400, "A playlist needs a kebab-case key.");
  }
  if (typeof raw?.title !== "string" || raw.title.trim().length === 0) {
    throw new JsonBodyError(400, "A playlist needs a name.");
  }
  if (raw.title.length > 120) {
    throw new JsonBodyError(400, "A playlist name may run to 120 characters.");
  }
  if (!Array.isArray(raw?.slugs)) {
    throw new JsonBodyError(400, "A playlist needs an array of slugs.");
  }
  if (raw.slugs.length > MAX_PLAYLIST_SLUGS) {
    throw new JsonBodyError(
      400,
      `This playlist holds ${raw.slugs.length} works; the limit is ${MAX_PLAYLIST_SLUGS}. Split it into two playlists.`,
    );
  }

  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw.slugs) {
    if (typeof entry !== "string" || !isValidReplicationSlug(entry)) {
      throw new JsonBodyError(400, "Every playlist entry must be a replication slug.");
    }
    if (seen.has(entry)) continue;
    seen.add(entry);
    slugs.push(entry);
  }

  let expectedUpdatedAt: string | null | undefined;
  if (raw.expectedUpdatedAt === null) {
    expectedUpdatedAt = null;
  } else if (typeof raw.expectedUpdatedAt === "string" && raw.expectedUpdatedAt.length > 0) {
    expectedUpdatedAt = raw.expectedUpdatedAt;
  } else if (raw.expectedUpdatedAt !== undefined) {
    throw new JsonBodyError(
      400,
      "expectedUpdatedAt must be the stored updated_at string, null, or omitted.",
    );
  }

  let ownerEmail: string | undefined;
  if (typeof raw.ownerEmail === "string" && raw.ownerEmail.trim().length > 0) {
    ownerEmail = raw.ownerEmail.trim();
  } else if (raw.ownerEmail !== undefined && raw.ownerEmail !== null && raw.ownerEmail !== "") {
    throw new JsonBodyError(400, "ownerEmail must be a member's email or omitted.");
  }

  return { key: raw.key, title: raw.title.trim(), slugs, expectedUpdatedAt, ownerEmail };
}

export const GET = protectedRouteOperation({
  auth: "contributor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load replication playlists via Next route:",
  unexpectedErrorMessage: "Unable to load the playlists right now.",
  operation: async ({ auth, actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("replicationMaintenance") ?? dataWrite.adminKey;
    const playlists = roleMeetsFloor(auth.role, "editor")
      ? await dataWrite.client.query(api.replicationPlaylists.list, { apiKey, actorEmail })
      : await dataWrite.client.query(api.replicationPlaylists.listOwned, { apiKey, actorEmail });

    return NextResponse.json({ ok: true, playlists });
  },
});

export const POST = protectedRouteOperation<PlaylistBody, ParsedPlaylist>({
  auth: "contributor",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: MAX_PAYLOAD_BYTES, parse: parsePlaylistBody },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save a replication playlist via Next route:",
  unexpectedErrorMessage: "Unable to save that playlist right now.",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const result = await dataWrite.client.mutation(api.replicationPlaylists.upsert, {
      apiKey,
      actorEmail,
      key: body.key,
      title: body.title,
      replication_slugs: body.slugs,
      updatedBy: actorEmail,
      expectedUpdatedAt: body.expectedUpdatedAt,
      owner_email: body.ownerEmail,
    });

    if (result.status === "conflict") {
      return NextResponse.json({ ok: false, conflict: result.server }, { status: 409 });
    }

    return NextResponse.json({ ok: true, playlist: result });
  },
});
