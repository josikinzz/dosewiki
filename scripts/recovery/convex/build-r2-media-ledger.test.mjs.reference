import { describe, expect, it } from "vitest";

import {
  buildLedgerEntries,
  indexManifestBySha,
  matchLedgerEntry,
} from "./build-r2-media-ledger.mjs";

const SHA_A = "ab".padEnd(64, "0");
const SHA_B = "cd".padEnd(64, "1");
const KEY_A = `media/sha256/ab/${SHA_A}.mp4`;

const storageRecord = (id, sha256hex, size, contentType) => ({
  _id: id,
  sha256: Buffer.from(sha256hex, "hex").toString("base64"),
  size,
  contentType,
});

describe("indexManifestBySha", () => {
  it("indexes canonical keys by digest and skips non-media keys", () => {
    const { bySha, skipped } = indexManifestBySha([
      { key: KEY_A, size: 10 },
      { key: "reports/summary.json", size: 5 },
      // Shard/digest mismatch is not a media object, whatever its prefix.
      { key: `media/sha256/zz/${SHA_A}.mp4` },
    ]);
    expect(bySha.get(SHA_A)).toEqual([{ key: KEY_A, ext: "mp4", size: 10 }]);
    expect(skipped).toBe(2);
  });

  it("tolerates alternate manifest field names but rejects keyless records", () => {
    const { bySha } = indexManifestBySha([{ name: KEY_A, bytes: 10 }]);
    expect(bySha.get(SHA_A)?.[0]).toEqual({ key: KEY_A, ext: "mp4", size: 10 });
    expect(() => indexManifestBySha([{ etag: "abc" }])).toThrow(/no recognizable key field/);
  });
});

describe("matchLedgerEntry", () => {
  const entry = { sha256: SHA_A, size: 10, contentType: "video/mp4" };

  it("matches exactly one byte-identical object", () => {
    const { bySha } = indexManifestBySha([{ key: KEY_A, size: 10 }]);
    expect(matchLedgerEntry(entry, bySha)).toEqual({
      status: "exact",
      r2_key: KEY_A,
      manifest: { key: KEY_A, ext: "mp4", size: 10 },
    });
  });

  it("reports a digest absent from the manifest as missing", () => {
    expect(matchLedgerEntry(entry, new Map()).status).toBe("missing");
  });

  it("treats a size disagreement as an error, never a match", () => {
    const { bySha } = indexManifestBySha([{ key: KEY_A, size: 11 }]);
    expect(matchLedgerEntry(entry, bySha).status).toBe("error");
  });

  it("disambiguates same-bytes twins by content type, else stays ambiguous", () => {
    const jpg = `media/sha256/ab/${SHA_A}.jpg`;
    const jpeg = `media/sha256/ab/${SHA_A}.jpeg`;
    const webp = `media/sha256/ab/${SHA_A}.webp`;
    const image = { sha256: SHA_A, size: 10, contentType: "image/webp" };

    const twins = indexManifestBySha([{ key: jpg, size: 10 }, { key: webp, size: 10 }]).bySha;
    expect(matchLedgerEntry(image, twins)).toMatchObject({ status: "exact", r2_key: webp });

    // Both jpg and jpeg are legitimate for image/jpeg: no single winner.
    const jpegTwins = indexManifestBySha([{ key: jpg, size: 10 }, { key: jpeg, size: 10 }]).bySha;
    expect(
      matchLedgerEntry({ sha256: SHA_A, size: 10, contentType: "image/jpeg" }, jpegTwins).status,
    ).toBe("ambiguous");
  });
});

describe("buildLedgerEntries", () => {
  it("emits one entry per populated non-placeholder variant with CAS basis", () => {
    const rows = [
      {
        _id: "rep1",
        slug: "work-a",
        storage_id: "mainA",
        thumbnail_storage_id: "thumbA",
        preview_storage_id: "placeholder-preview",
      },
    ];
    const entries = buildLedgerEntries(rows, [
      storageRecord("mainA", SHA_A, 10, "video/mp4"),
      storageRecord("thumbA", SHA_B, 4, "image/webp"),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      role: "main",
      keyField: "r2_key",
      storage_id: "mainA",
      expectedStorageId: "mainA",
      sha256: SHA_A,
      size: 10,
      status: "pending",
    });
    expect(entries[1]).toMatchObject({
      role: "thumbnail",
      storage_id: "thumbA",
      expectedStorageId: "mainA",
      sha256: SHA_B,
    });
  });

  it("flags a storage ID missing from the dump as an error entry", () => {
    const entries = buildLedgerEntries(
      [{ _id: "rep1", slug: "work-a", storage_id: "ghost" }],
      [],
    );
    expect(entries[0]).toMatchObject({ status: "error", role: "main" });
  });
});
