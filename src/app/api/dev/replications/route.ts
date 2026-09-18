/**
 * Read + create endpoint for the Replication Studio (`/dev` → Replications).
 *
 * Both verbs use the authenticated Postgres write target, so an editor reads
 * the same corpus they edit. The studio includes figures and effect-less rows
 * that no public projection returns. Creation verifies an R2 upload receipt
 * and the stored bytes before inserting a durable media reference.
 *
 *   GET  /api/dev/replications                       → { rows, effects }
 *   POST /api/dev/replications  { …asset fields }    → create one row
 */
import { NextResponse } from "next/server";
import type { PublicationTarget } from "@server/next/publicationWire";
import { publishReplicationRecord } from "./publishReplicationRecord";
import { api } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { diagnoseDataAdminCredential } from "@/lib/http/dataAdminIntentError";
import { probeServerDataAdminCredential } from "@server/data/serverWriteCapability";
import { readR2MediaUploadReceipt, verifyMediaForPublication } from "@server/runtime/r2MediaStorage";
import { assertDataWritesNotFrozen } from "@server/runtime/dataWriteFreeze";
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
  uploadToken?: unknown;
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
  uploadToken: string;
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
    uploadToken: requireString(body.uploadToken, "uploadToken", 4096),
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
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load the replication corpus via Next route:",
  unexpectedErrorMessage: "Unable to load the replication corpus right now.",
  operation: async ({ actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey = dataWrite.getAdminIntentToken?.("replicationMaintenance") ?? dataWrite.adminKey;
    try {
      const corpus = await dataWrite.client.query(api.replications.getStudioRows, { apiKey, actorEmail });
      return NextResponse.json({ ok: true, ...corpus });
    } catch (error) {
      // A stale admin token is a configuration fact, not an outage — but Postgres
      // sends the same opaque error either way, so ask the deployment which it is.
      const diagnosis = await diagnoseDataAdminCredential({
        intent: "replicationMaintenance",
        probe: () => probeServerDataAdminCredential(actorEmail, apiKey),
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
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to create a replication via Next route:",
  unexpectedErrorMessage: "Unable to create that replication right now.",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey = dataWrite.getAdminIntentToken?.("replicationMaintenance") ?? dataWrite.adminKey;
    assertDataWritesNotFrozen("replication-studio.upload-finish");
    let uploaded;
    try {
      uploaded = readR2MediaUploadReceipt(body.uploadToken, actorEmail);
    } catch {
      throw new JsonBodyError(400, "Invalid or expired upload receipt. Start the upload again.");
    }
    if (uploaded.fileSize !== body.fileSize || uploaded.mimeType.split("/")[0] !== body.type
      || uploaded.r2Key.slice(uploaded.r2Key.lastIndexOf(".") + 1) !== body.format) {
      throw new JsonBodyError(400, "Media metadata does not match the authorized upload.");
    }
    const authorization = await dataWrite.client.query(api.replications.authorizeMediaUpload, { apiKey, actorEmail });
    const verified = await verifyMediaForPublication(uploaded.r2Key, {
      purpose: "replication-import",
      subject: body.slug,
      actorEmail: authorization.actorEmail,
      targetIdentity: authorization.targetIdentity,
    }, uploaded);
    assertDataWritesNotFrozen("replication-studio.create");
    const result = await dataWrite.client.mutation(api.replications.insertMediaAsset, {
      apiKey,
      actorEmail,
      expected_absent: true,
      slug: body.slug,
      title: body.title,
      artist: body.artist,
      role: body.role,
      type: body.type,
      r2_key: uploaded.r2Key,
      mediaReceipts: { r2_key: verified.token },
      effect_slug: body.effectSlug,
      effect_tags: body.effectTags.length > 0 ? body.effectTags : undefined,
      format: body.format,
      file_size: uploaded.fileSize,
      rights_status: "unknown",
      credit_line: body.creditLine,
    });

    // A new asset changes its effect's gallery, so the owning page is stale,
    // and it joins every replication collection the showcase feeds; its own
    // permalink and locale mirror publish with it.
    const targets: PublicationTarget[] = [{ kind: "replication-collections" }];
    if (body.effectSlug) targets.push({ kind: "effect", slug: body.effectSlug });
    await publishReplicationRecord(result.slug, targets);

    return NextResponse.json({ ok: true, slug: result.slug, id: result.id });
  },
});
