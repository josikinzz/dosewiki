import { describe, expect, it, vi } from "vitest";

import { resolveReplicationUrls } from "../../convex/lib/replicationUrls";

describe("resolveReplicationUrls motion renditions", () => {
  it("resolves original, preview, and motion storage independently", async () => {
    const getUrl = vi.fn(async (storageId: string) => `https://cdn.test/${storageId}`);

    await expect(
      resolveReplicationUrls(
        { storage: { getUrl } },
        {
          storage_id: "originalstorage0001",
          preview_storage_id: "previewstorage00001",
          motion_storage_id: "motionstorage000001",
        },
      ),
    ).resolves.toEqual({
      url: "https://cdn.test/originalstorage0001",
      thumbnail_url: null,
      preview_url: "https://cdn.test/previewstorage00001",
      motion_url: "https://cdn.test/motionstorage000001",
      motion_poster_url: null,
    });
  });

  it("fails a broken motion rendition closed without changing the original", async () => {
    const getUrl = vi.fn(async (storageId: string) => {
      if (storageId === "motionstorage000001") throw new Error("missing");
      return `https://cdn.test/${storageId}`;
    });

    await expect(
      resolveReplicationUrls(
        { storage: { getUrl } },
        {
          storage_id: "originalstorage0001",
          motion_storage_id: "motionstorage000001",
          url: "https://fallback.test/original.gif",
        },
      ),
    ).resolves.toEqual({
      url: "https://cdn.test/originalstorage0001",
      thumbnail_url: null,
      preview_url: null,
      motion_url: null,
      motion_poster_url: null,
    });
  });

  it("never aliases a placeholder motion id to the original URL", async () => {
    const getUrl = vi.fn(async (storageId: string) => `https://cdn.test/${storageId}`);

    const resolved = await resolveReplicationUrls(
      { storage: { getUrl } },
      {
        storage_id: "originalstorage0001",
        motion_storage_id: "placeholder-motion",
      },
    );

    expect(resolved.motion_url).toBeNull();
    expect(getUrl).toHaveBeenCalledTimes(1);
  });
});
