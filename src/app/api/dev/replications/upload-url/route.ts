/** Starts an immutable R2 PUT. Creating the Postgres row separately verifies the uploaded bytes. */
import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { assertR2MediaNotWithdrawn, r2MediaObject, startR2MediaUpload } from "@server/runtime/r2MediaStorage";
import { assertDataWritesNotFrozen } from "@server/runtime/dataWriteFreeze";
import { api } from "@server/postgres/runtime/api";

export const runtime = "nodejs";

const MIME_BY_FORMAT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/mp4",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", flac: "audio/flac", m4a: "audio/mp4",
};
const MAX_MEDIA_BYTES = 512 * 1024 * 1024;

type UploadBody = { sha256?: unknown; format?: unknown; type?: unknown; fileSize?: unknown };

export const POST = protectedRouteOperation<UploadBody>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: 2048 },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to start a replication R2 upload:",
  unexpectedErrorMessage: "Unable to start that upload right now.",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) throw new Error("Data write capability is required.");
    const apiKey = dataWrite.getAdminIntentToken?.("replicationMaintenance") ?? dataWrite.adminKey;
    assertDataWritesNotFrozen("replication-studio.upload-start");
    if (!body || typeof body !== "object") throw new JsonBodyError(400, "Upload metadata is required.");
    const format = typeof body.format === "string" ? body.format.toLowerCase() : "";
    const mimeType = Object.prototype.hasOwnProperty.call(MIME_BY_FORMAT, format) ? MIME_BY_FORMAT[format] : undefined;
    if (!mimeType || body.type !== mimeType.split("/")[0]) {
      throw new JsonBodyError(400, "Unsupported media format or mismatched media type.");
    }
    if (typeof body.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(body.sha256)) {
      throw new JsonBodyError(400, "A SHA-256 digest is required.");
    }
    if (typeof body.fileSize !== "number" || !Number.isSafeInteger(body.fileSize) || body.fileSize <= 0 || body.fileSize > MAX_MEDIA_BYTES) {
      throw new JsonBodyError(400, "Media must be non-empty and no larger than 512 MiB.");
    }
    const object = r2MediaObject(body.sha256, body.fileSize, mimeType, format);
    await dataWrite.client.query(api.replications.authorizeMediaUpload, { apiKey, actorEmail });
    await assertR2MediaNotWithdrawn(object.r2Key);
    return NextResponse.json({ ok: true, ...startR2MediaUpload(object, actorEmail) });
  },
});
