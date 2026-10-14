import { afterEach, describe, expect, it, vi } from "vitest";

import { isValidR2Key, resolveReplicationUrls } from "../../server/lib/replicationUrls";

const SHA_A = "ab".padEnd(64, "0");
const KEY_A = `media/sha256/ab/${SHA_A}.mp4`;

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

describe("resolveReplicationUrls", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to Postgres storage for a malformed key instead of serving it", async () => {
    vi.stubEnv("REPLICATION_MEDIA_BASE_URL", "https://media.example.test");
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
});
