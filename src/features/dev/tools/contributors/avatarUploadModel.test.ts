import { describe, expect, it, vi } from "vitest";

import {
  createAvatarPreviewSession,
  createAvatarUploadPayload,
  inferAvatarMimeType,
  validateAvatarFile,
  type AvatarBrowserFileAdapter,
  type AvatarFileLike,
} from "./avatarUploadModel";
import { MAX_AVATAR_BYTES } from "./contributorsModel";

describe("avatarUploadModel", () => {
  it("validates supported avatar MIME types from content type or extension", () => {
    expect(inferAvatarMimeType({ name: "avatar.jpeg", size: 1 })).toBe("image/jpeg");
    expect(validateAvatarFile({ name: "avatar.webp", size: 1 })).toEqual({
      ok: true,
      mimeType: "image/webp",
    });
    expect(validateAvatarFile({ name: "avatar.gif", size: 1, type: "image/gif" })).toEqual({
      ok: false,
      message: "Avatar must be a PNG, JPG, or WebP image.",
    });
  });

  it("preserves the 2 MiB avatar size rule", () => {
    expect(validateAvatarFile({ name: "large.png", size: MAX_AVATAR_BYTES + 1 })).toEqual({
      ok: false,
      message: "Avatar image exceeds 2.0 MB limit. Select a smaller file.",
    });
  });

  it("creates upload payloads behind a file-reader adapter", async () => {
    const file = { name: "avatar.png", size: 12, type: "image/png" };
    const adapter: AvatarBrowserFileAdapter<AvatarFileLike> = {
      inferMimeType: vi.fn(() => "image/png"),
      readAsBase64: vi.fn(async () => "abc123"),
      createObjectUrl: vi.fn(),
      revokeObjectUrl: vi.fn(),
    };

    await expect(createAvatarUploadPayload(file, adapter)).resolves.toEqual({
      filename: "avatar.png",
      mimeType: "image/png",
      base64: "abc123",
    });
    expect(adapter.readAsBase64).toHaveBeenCalledWith(file);
  });

  it("owns preview object URL cleanup through an object-url adapter", () => {
    const file = { name: "avatar.png", size: 12, type: "image/png" };
    const adapter: AvatarBrowserFileAdapter<AvatarFileLike> = {
      inferMimeType: vi.fn(),
      readAsBase64: vi.fn(),
      createObjectUrl: vi.fn(() => "blob:avatar"),
      revokeObjectUrl: vi.fn(),
    };

    const preview = createAvatarPreviewSession(file, adapter);

    expect(preview.source).toBe("blob:avatar");
    preview.dispose();
    expect(adapter.revokeObjectUrl).toHaveBeenCalledWith("blob:avatar");
  });
});
