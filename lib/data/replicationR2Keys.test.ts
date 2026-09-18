import { describe, expect, it } from "vitest";

import { validateR2KeyUpdate } from "../../server/lib/replicationRecovery";

const SHA_A = "ab".padEnd(64, "0");
const SHA_B = "cd".padEnd(64, "1");
const KEY_A = `media/sha256/ab/${SHA_A}.mp4`;
const KEY_B = `media/sha256/cd/${SHA_B}.webp`;

const row = (overrides: Record<string, string | undefined> = {}) => ({
  slug: "breathing-by-artist",
  storage_id: "mainstorage0000001",
  thumbnail_storage_id: "thumbstorage000001",
  preview_storage_id: "previewstorage00001",
  ...overrides,
});

const ID = "rep000001" as never;

describe("validateR2KeyUpdate compare-and-swap", () => {
  it("returns only the keys the entry sets, once every precondition holds", () => {
    expect(
      validateR2KeyUpdate(row(), {
        id: ID,
        expectedStorageId: "mainstorage0000001",
        r2_key: KEY_A,
        thumbnail_r2_key: KEY_B,
        expectedThumbnailStorageId: "thumbstorage000001",
      }),
    ).toEqual({ r2_key: KEY_A, thumbnail_r2_key: KEY_B });
  });

  it("fails the whole entry when the row's storage_id moved since the plan", () => {
    expect(() =>
      validateR2KeyUpdate(row({ storage_id: "repointedstorage01" }), {
        id: ID,
        expectedStorageId: "mainstorage0000001",
        r2_key: KEY_A,
      }),
    ).toThrow(/storage_id changed since the plan/);
  });

  it("requires the matching expected variant id for every variant key set", () => {
    // Absent expectedThumbnailStorageId: the caller never stated its basis.
    expect(() =>
      validateR2KeyUpdate(row(), {
        id: ID,
        expectedStorageId: "mainstorage0000001",
        thumbnail_r2_key: KEY_B,
      }),
    ).toThrow(/thumbnail_storage_id changed since the plan/);

    // Stale expected id: the thumbnail was repointed after the ledger was built.
    expect(() =>
      validateR2KeyUpdate(row({ thumbnail_storage_id: "newthumbstorage001" }), {
        id: ID,
        expectedStorageId: "mainstorage0000001",
        thumbnail_r2_key: KEY_B,
        expectedThumbnailStorageId: "thumbstorage000001",
      }),
    ).toThrow(/thumbnail_storage_id changed since the plan/);
  });

  it("refuses a variant key for a variant the row does not natively store", () => {
    expect(() =>
      validateR2KeyUpdate(row({ preview_storage_id: undefined }), {
        id: ID,
        expectedStorageId: "mainstorage0000001",
        preview_r2_key: KEY_A,
        expectedPreviewStorageId: "previewstorage00001",
      }),
    ).toThrow(/no native preview_storage_id/);

    expect(() =>
      validateR2KeyUpdate(row({ preview_storage_id: "placeholder-preview" }), {
        id: ID,
        expectedStorageId: "mainstorage0000001",
        preview_r2_key: KEY_A,
        expectedPreviewStorageId: "placeholder-preview",
      }),
    ).toThrow(/no native preview_storage_id/);
  });

  it("rejects non-canonical keys before touching preconditions", () => {
    expect(() =>
      validateR2KeyUpdate(row(), {
        id: ID,
        expectedStorageId: "mainstorage0000001",
        r2_key: `media/sha256/cd/${SHA_A}.mp4`, // shard/digest mismatch
      }),
    ).toThrow(/not a canonical media\/sha256\/ key/);
  });

  it("rejects an entry that sets no keys at all", () => {
    expect(() =>
      validateR2KeyUpdate(row(), {
        id: ID,
        expectedStorageId: "mainstorage0000001",
      }),
    ).toThrow(/sets no keys/);
  });
});
