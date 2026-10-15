import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { diagnoseDataAdminCredential } from "@/lib/http/dataAdminIntentError";
import { probeServerDataAdminCredential } from "@server/data/serverWriteCapability";
import { readR2MediaUploadReceipt, verifyMediaForPublication } from "@server/runtime/r2MediaStorage";
import { assertDataWritesNotFrozen } from "@server/runtime/dataWriteFreeze";
import {
  STUDIO_RIGHTS_STATUSES,
  isValidReplicationSlug,
  type StudioMediaType,
  type StudioRightsStatus,
  type StudioRole,
} from "@/features/dev/tools/replication-studio/replicationStudioModel";
import { isReplicationSourceUrl } from "@/types/replications";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 16 * 1024;
const MEDIA_TYPES = new Set<StudioMediaType>(["image", "video", "audio"]);
const ROLES = new Set<StudioRole>(["replication", "figure"]);
const RIGHTS_STATUSES = new Set<StudioRightsStatus>(STUDIO_RIGHTS_STATUSES);

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
  sourceUrl?: unknown;
  rightsStatus?: unknown;
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
  sourceUrl?: string;
  rightsStatus: StudioRightsStatus;
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

  let sourceUrl: string | undefined;
  if (body.sourceUrl !== undefined && body.sourceUrl !== null && body.sourceUrl !== "") {
    if (typeof body.sourceUrl !== "string" || body.sourceUrl.length > 2000 || !isReplicationSourceUrl(body.sourceUrl)) {
      throw new JsonBodyError(400, "sourceUrl must be an HTTP or HTTPS address.");
    }
    sourceUrl = body.sourceUrl.trim();
  }

  let rightsStatus: StudioRightsStatus = "unknown";
  if (body.rightsStatus !== undefined && body.rightsStatus !== null && body.rightsStatus !== "") {
    if (!RIGHTS_STATUSES.has(body.rightsStatus as StudioRightsStatus)) {
      throw new JsonBodyError(400, "rightsStatus is not a known rights status.");
    }
    rightsStatus = body.rightsStatus as StudioRightsStatus;
  }

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
    sourceUrl,
    rightsStatus,
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
      rights_status: body.rightsStatus,
      credit_line: body.creditLine,
      source_url: body.sourceUrl,
      publication_state: "unpublished",
    });

    return NextResponse.json({ ok: true, slug: result.slug, id: result.id, published: false });
  },
});
