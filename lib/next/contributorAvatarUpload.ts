/**
 * Avatar bytes → Convex storage id, for the two Next routes that save a
 * contributor profile.
 *
 * The editor save (`/api/dev/contributor-profile`) accepts the image inline as base64 rather
 * than minting a browser upload URL: the size ceiling is small enough that one
 * round trip beats three, and it keeps the only writer of `avatarStorageId`
 * behind a session check. This used to live inside the self-serve route; it is
 * shared so the editor path cannot drift on the size or MIME ceilings, which
 * the Convex mutation does not re-check.
 */
import { Buffer } from "node:buffer";
import { api } from "../../convex/_generated/api";
import type { ServerConvexWriteCapability } from "@server/convex/serverWriteCapability";

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024
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
 * supplied but is unusable — "no avatar in this save" and "a broken avatar in
 * this save" are different answers and the caller must not conflate them.
 */
export function normalizeAvatarUpload(
  value: AvatarUploadInput | undefined | null,
): NormalizedAvatarUpload | null {
  if (!value || typeof value !== "object") {
    return null;
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

  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength === 0) {
    throw new Error("Avatar image data is empty.");
  }

  if (bytes.byteLength > MAX_AVATAR_SIZE_BYTES) {
    throw new Error("Avatar image must be 2 MB or smaller.");
  }

  return { mimeType, base64 };
}

export async function uploadAvatarToConvex(
  upload: NormalizedAvatarUpload,
  capability: ServerConvexWriteCapability,
  actorEmail: string,
): Promise<string> {
  const apiKey = capability.getAdminIntentToken?.("profileMediaWrite") ?? capability.adminKey;
  const uploadUrl = await capability.client.mutation(
    api.contributorProfiles.generateAvatarUploadUrl,
    {
      apiKey,
      actorEmail,
    },
  );

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": upload.mimeType,
    },
    body: Buffer.from(upload.base64, "base64"),
  });

  const uploadResult = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok) {
    throw new Error("Avatar upload failed.");
  }

  const storageId =
    typeof uploadResult.storageId === "string"
      ? uploadResult.storageId
      : typeof uploadResult.id === "string"
        ? uploadResult.id
        : null;

  if (!storageId) {
    throw new Error("Avatar upload did not return a storage id.");
  }

  return storageId;
}
