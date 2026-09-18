import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isValidR2Key,
  replicationMediaBaseUrl,
  resolveReplicationUrls,
} from "../../server/lib/replicationUrls";

const SHA_A = "ab".padEnd(64, "0");
const SHA_B = "cd".padEnd(64, "1");
const KEY_A = `media/sha256/ab/${SHA_A}.mp4`;
const KEY_B = `media/sha256/cd/${SHA_B}.webp`;
const BASE = "https://media.example.test";

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

describe("isValidR2Key", () => {
  it("accepts only canonical media/sha256/ keys", () => {
    expect(isValidR2Key(KEY_A)).toBe(true);
    expect(isValidR2Key(`media/sha256/ab/${SHA_A}.jpeg`)).toBe(true);
  });

  it("rejects traversal, foreign prefixes, shard mismatches, and bad hex", () => {
    expect(isValidR2Key(undefined)).toBe(false);
    expect(isValidR2Key("")).toBe(false);
    expect(isValidR2Key(`media/sha256/../${SHA_A}.mp4`)).toBe(false);
    expect(isValidR2Key(`other/sha256/ab/${SHA_A}.mp4`)).toBe(false);
    // Shard directory must repeat the digest's first two characters.
    expect(isValidR2Key(`media/sha256/cd/${SHA_A}.mp4`)).toBe(false);
    expect(isValidR2Key(`media/sha256/AB/${SHA_A.toUpperCase()}.mp4`)).toBe(false);
    expect(isValidR2Key(`media/sha256/ab/${SHA_A}`)).toBe(false);
    expect(isValidR2Key(`media/sha256/ab/${SHA_A}.mp4/extra`)).toBe(false);
    expect(isValidR2Key(`https://evil.test/media/sha256/ab/${SHA_A}.mp4`)).toBe(false);
  });
});

describe("replicationMediaBaseUrl", () => {
  it("normalizes trailing slashes and requires https", () => {
    expect(replicationMediaBaseUrl({ REPLICATION_MEDIA_BASE_URL: `${BASE}/` })).toBe(BASE);
    expect(replicationMediaBaseUrl({ REPLICATION_MEDIA_BASE_URL: BASE })).toBe(BASE);
    expect(replicationMediaBaseUrl({})).toBeNull();
    expect(replicationMediaBaseUrl({ REPLICATION_MEDIA_BASE_URL: "" })).toBeNull();
    expect(replicationMediaBaseUrl({ REPLICATION_MEDIA_BASE_URL: "http://insecure.test" })).toBeNull();
    expect(replicationMediaBaseUrl({ REPLICATION_MEDIA_BASE_URL: "https:// spaced.test" })).toBeNull();
  });
});

describe("resolveReplicationUrls R2-first precedence", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers a valid R2 key over Postgres storage for every variant", async () => {
    vi.stubEnv("REPLICATION_MEDIA_BASE_URL", BASE);
    const getUrl = vi.fn(async (storageId: string) => `https://cdn.test/${storageId}`);

    await expect(
      resolveReplicationUrls(
        { storage: { getUrl } },
        {
          storage_id: "originalstorage0001",
          thumbnail_storage_id: "thumbstorage000001",
          preview_storage_id: "previewstorage00001",
          motion_storage_id: "motionstorage000001",
          motion_poster_storage_id: "posterstorage000001",
          r2_key: KEY_A,
          thumbnail_r2_key: KEY_B,
          preview_r2_key: KEY_A,
          motion_r2_key: KEY_A,
          motion_poster_r2_key: KEY_B,
          url: "https://fallback.test/original.mp4",
        },
      ),
    ).resolves.toEqual({
      url: `${BASE}/${KEY_A}`,
      thumbnail_url: `${BASE}/${KEY_B}`,
      preview_url: `${BASE}/${KEY_A}`,
      motion_url: `${BASE}/${KEY_A}`,
      motion_poster_url: `${BASE}/${KEY_B}`,
    });
    expect(getUrl).not.toHaveBeenCalled();
  });

  it("resolves an R2-only row without consulting Postgres storage", async () => {
    vi.stubEnv("REPLICATION_MEDIA_BASE_URL", BASE);
    const getUrl = vi.fn(async (storageId: string) => `https://cdn.test/${storageId}`);

    await expect(
      resolveReplicationUrls({ storage: { getUrl } }, { r2_key: KEY_A }),
    ).resolves.toMatchObject({ url: `${BASE}/${KEY_A}` });
    expect(getUrl).not.toHaveBeenCalled();
  });

  it("ignores every R2 key when the base URL is unset (rollback switch)", async () => {
    const getUrl = vi.fn(async (storageId: string) => `https://cdn.test/${storageId}`);

    const resolved = await resolveReplicationUrls(
      { storage: { getUrl } },
      { storage_id: "originalstorage0001", r2_key: KEY_A },
    );

    expect(resolved.url).toBe("https://cdn.test/originalstorage0001");
  });

  it("falls back to Postgres storage for a malformed key instead of serving it", async () => {
    vi.stubEnv("REPLICATION_MEDIA_BASE_URL", BASE);
    const getUrl = vi.fn(async (storageId: string) => `https://cdn.test/${storageId}`);

    const resolved = await resolveReplicationUrls(
      { storage: { getUrl } },
      {
        storage_id: "originalstorage0001",
        r2_key: `media/sha256/../${SHA_A}.mp4`,
      },
    );

    expect(resolved.url).toBe("https://cdn.test/originalstorage0001");
  });

  it("aliases the thumbnail to an R2 main URL when storage ids match", async () => {
    vi.stubEnv("REPLICATION_MEDIA_BASE_URL", BASE);
    const getUrl = vi.fn(async (storageId: string) => `https://cdn.test/${storageId}`);

    const resolved = await resolveReplicationUrls(
      { storage: { getUrl } },
      {
        storage_id: "originalstorage0001",
        thumbnail_storage_id: "originalstorage0001",
        r2_key: KEY_A,
      },
    );

    expect(resolved.thumbnail_url).toBe(`${BASE}/${KEY_A}`);
    expect(getUrl).not.toHaveBeenCalled();
  });

  it("still skips preview resolution entirely when preview is disabled", async () => {
    vi.stubEnv("REPLICATION_MEDIA_BASE_URL", BASE);
    const getUrl = vi.fn(async (storageId: string) => `https://cdn.test/${storageId}`);

    const resolved = await resolveReplicationUrls(
      { storage: { getUrl } },
      {
        storage_id: "originalstorage0001",
        preview_storage_id: "previewstorage00001",
        preview_r2_key: KEY_A,
      },
      { preview: false },
    );

    expect(resolved.preview_url).toBeNull();
  });

  it("keeps preview and motion closed on failure even with R2 configured", async () => {
    vi.stubEnv("REPLICATION_MEDIA_BASE_URL", BASE);
    const getUrl = vi.fn(async () => {
      throw new Error("missing");
    });

    const resolved = await resolveReplicationUrls(
      { storage: { getUrl } },
      {
        storage_id: "originalstorage0001",
        preview_storage_id: "previewstorage00001",
        motion_storage_id: "motionstorage000001",
        url: "https://fallback.test/original.gif",
      },
    );

    expect(resolved.url).toBe("https://fallback.test/original.gif");
    expect(resolved.preview_url).toBeNull();
    expect(resolved.motion_url).toBeNull();
  });
});
