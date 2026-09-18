/**
 * Inline contributor avatar bytes are validated before authorization and stored
 * immutably in R2 before a profile mutation can publish their identity.
 */
import { Buffer } from "node:buffer";
import { api } from "../postgres/runtime/api";
import type { ServerDataWriteCapability } from "@server/data/serverWriteCapability";
import { uploadR2Media, verifyProfileAvatarForImport } from "../runtime/r2MediaStorage";

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const ALLOWED_AVATAR_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type AvatarUploadInput = {
  filename?: unknown;
  mimeType?: unknown;
  base64?: unknown;
};

export type NormalizedAvatarUpload = {
  mimeType: string;
  base64: string;
};

/**
 * Returns `null` when no upload was supplied at all, and throws when one was
 * supplied but is unusable. A missing image and a broken image are different
 * answers and the caller must not conflate them.
 */
export function normalizeAvatarUpload(
  value: AvatarUploadInput | undefined | null,
): NormalizedAvatarUpload | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Avatar upload must be an image object.");
  }

  const mimeType = typeof value.mimeType === "string" ? value.mimeType.trim().toLowerCase() : "";
  const base64 =
    typeof value.base64 === "string" ? value.base64.trim().replace(/^data:[^;]+;base64,/, "") : "";

  if (!mimeType || !ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
    throw new Error("Avatar must be a PNG, JPG, or WebP image.");
  }

  if (!base64) {
    throw new Error("Avatar image data is required.");
  }

  if (base64.length > Math.ceil(MAX_AVATAR_SIZE_BYTES / 3) * 4) {
    throw new Error("Avatar image must be 2 MB or smaller.");
  }
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error("Avatar image data must be valid base64.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength === 0) {
    throw new Error("Avatar image data is empty.");
  }

  if (bytes.byteLength > MAX_AVATAR_SIZE_BYTES) {
    throw new Error("Avatar image must be 2 MB or smaller.");
  }

  const detectedMimeType =
    bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)
      && bytes.toString("ascii", 12, 16) === "IHDR" ? "image/png"
    : bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg"
    : bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF"
      && bytes.toString("ascii", 8, 12) === "WEBP"
      && ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16)) ? "image/webp"
    : null;
  if (detectedMimeType !== mimeType) {
    throw new Error("Avatar bytes must match the declared PNG, JPG, or WebP format.");
  }

  return { mimeType, base64 };
}

export async function uploadAvatarToR2(
  upload: NormalizedAvatarUpload,
  capability: ServerDataWriteCapability,
  actorEmail: string,
  target: {
    key: string;
    expectedUpdatedAt: string | null;
    selfServe: boolean;
    patch: Record<string, unknown>;
  },
): Promise<{ r2Key: string; receipt: string }> {
  const apiKey = capability.getAdminIntentToken?.("profileMediaWrite") ?? capability.adminKey;
  // Storage cannot roll back with the database. Resolve the database-backed
  // role, ownership, editor field restrictions and revision before any PUT.
  const authorized = await capability.client.query(api.contributorProfiles.authorizeAvatarUpload, {
    apiKey,
    actorEmail,
    ...target,
  });
  const extension = upload.mimeType === "image/jpeg" ? "jpg" : upload.mimeType === "image/png" ? "png" : "webp";
  const stored = await uploadR2Media(Buffer.from(upload.base64, "base64"), upload.mimeType, extension);
  const receipt = await verifyProfileAvatarForImport(stored.r2Key, authorized.key, authorized.actorEmail, authorized.targetIdentity);
  return { r2Key: stored.r2Key, receipt };
}
