/**
 * Read + create endpoint for the Replication Studio (`/dev` → Replications).
 *
 * Both verbs go through the authenticated Convex write target rather than the
 * browser's public read deployment, for the same reason the molecule editor's
 * GET does: an editor must see and edit the same deployment, and the studio's
 * read includes figures and effect-less rows that no public projection returns.
 *
 *   GET  /api/dev/replications                       → { rows, effects }
 *   POST /api/dev/replications  { …asset fields }    → create one row
 */
import { NextResponse } from "next/server";
import type { PublicationTarget } from "@server/next/publicationWire";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { api } from "../../../../../convex/_generated/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { diagnoseConvexAdminCredential } from "@/lib/http/convexAdminIntentError";
import { probeServerConvexAdminCredential } from "@server/convex/serverWriteCapability";
import {
  isValidReplicationSlug,
  type StudioMediaType,
  type StudioRole,
} from "@/features/dev/tools/replication-studio/replicationStudioModel";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 16 * 1024;
const MEDIA_TYPES = new Set<StudioMediaType>(["image", "video", "audio"]);
const ROLES = new Set<StudioRole>(["replication", "figure"]);

type CreateAssetBody = {
  slug?: unknown;
  title?: unknown;
  artist?: unknown;
  role?: unknown;
  type?: unknown;
  storageId?: unknown;
  effectSlug?: unknown;
  effectTags?: unknown;
  format?: unknown;
  fileSize?: unknown;
  creditLine?: unknown;
};

type ParsedCreateAsset = {
  slug: string;
  title: string;
  artist: string;
  role: StudioRole;
  type: StudioMediaType;
  storageId: string;
  effectSlug?: string;
  effectTags: string[];
  format: string;
  fileSize?: number;
  creditLine?: string;
};

function requireString(value: unknown, field: string, maxLength = 400): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new JsonBodyError(400, `${field} is required.`);
  }
  return value.trim();
}

function parseCreateBody(body: CreateAssetBody): ParsedCreateAsset {
  const slug = requireString(body.slug, "slug", 120);
  if (!isValidReplicationSlug(slug)) {
    throw new JsonBodyError(400, "slug must be kebab-case.");
  }

  const type = requireString(body.type, "type", 16) as StudioMediaType;
  if (!MEDIA_TYPES.has(type)) {
    throw new JsonBodyError(400, "type must be image, video, or audio.");
  }

  const role = (typeof body.role === "string" ? body.role : "replication") as StudioRole;
  if (!ROLES.has(role)) {
    throw new JsonBodyError(400, "role must be replication or figure.");
  }

  const format = requireString(body.format, "format", 16).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!format) {
    throw new JsonBodyError(400, "format is required.");
  }

  let effectSlug: string | undefined;
  if (body.effectSlug !== undefined && body.effectSlug !== null && body.effectSlug !== "") {
    effectSlug = requireString(body.effectSlug, "effectSlug", 120);
    if (!isValidReplicationSlug(effectSlug)) {
      throw new JsonBodyError(400, "effectSlug must be kebab-case.");
    }
  }

  let effectTags: string[] = [];
  if (body.effectTags !== undefined) {
    if (!Array.isArray(body.effectTags) || body.effectTags.some((tag) => typeof tag !== "string")) {
      throw new JsonBodyError(400, "effectTags must be a list of effect slugs.");
    }
    effectTags = (body.effectTags as string[]).map((tag) => tag.trim()).filter(Boolean);
    if (effectTags.some((tag) => !isValidReplicationSlug(tag))) {
      throw new JsonBodyError(400, "effectTags must be kebab-case effect slugs.");
    }
  }

  let fileSize: number | undefined;
  if (body.fileSize !== undefined && body.fileSize !== null) {
    if (typeof body.fileSize !== "number" || !Number.isFinite(body.fileSize) || body.fileSize <= 0) {
      throw new JsonBodyError(400, "fileSize must be a positive number of bytes.");
    }
    fileSize = Math.round(body.fileSize);
  }

  const creditLine = typeof body.creditLine === "string" && body.creditLine.trim().length > 0
    ? body.creditLine.trim().slice(0, 2000)
    : undefined;

  return {
    slug,
    title: requireString(body.title, "title", 400),
    artist: requireString(body.artist, "artist", 200),
    role,
    type,
    storageId: requireString(body.storageId, "storageId", 200),
    effectSlug,
    effectTags,
    format,
    fileSize,
    creditLine,
  };
}

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to load the replication corpus via Next route:",
  unexpectedErrorMessage: "Unable to load the replication corpus right now.",
  operation: async ({ actorEmail, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey = convexWrite.getAdminIntentToken?.("replicationMaintenance") ?? convexWrite.adminKey;
    try {
      const corpus = await convexWrite.client.query(api.replications.getStudioRows, { apiKey, actorEmail });
      return NextResponse.json({ ok: true, ...corpus });
    } catch (error) {
      // A stale admin token is a configuration fact, not an outage — but Convex
      // sends the same opaque error either way, so ask the deployment which it is.
      const diagnosis = await diagnoseConvexAdminCredential({
        intent: "replicationMaintenance",
        probe: () => probeServerConvexAdminCredential(actorEmail, apiKey),
      });
      if (!diagnosis) throw error;
      return NextResponse.json({ ok: false, error: diagnosis }, { status: 503 });
    }
  },
});

export const POST = protectedRouteOperation<CreateAssetBody, ParsedCreateAsset>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: MAX_PAYLOAD_BYTES, parse: parseCreateBody },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to create a replication via Next route:",
  unexpectedErrorMessage: "Unable to create that replication right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey = convexWrite.getAdminIntentToken?.("replicationMaintenance") ?? convexWrite.adminKey;
    const result = await convexWrite.client.mutation(api.replications.insertMediaAsset, {
      apiKey,
      actorEmail,
      expected_absent: true,
      slug: body.slug,
      title: body.title,
      artist: body.artist,
      role: body.role,
      type: body.type,
      storage_id: body.storageId,
      effect_slug: body.effectSlug,
      effect_tags: body.effectTags.length > 0 ? body.effectTags : undefined,
      format: body.format,
      file_size: body.fileSize,
      rights_status: "unknown",
      credit_line: body.creditLine,
    });

    // A new asset changes its effect's gallery, so the owning page is stale,
    // and it joins every replication collection the showcase feeds.
    const targets: PublicationTarget[] = [{ kind: "replication-collections" }];
    if (body.effectSlug) targets.push({ kind: "effect", slug: body.effectSlug });
    await publishPublicCache({ targets, source: "manual" });

    return NextResponse.json({ ok: true, slug: result.slug, id: result.id });
  },
});
