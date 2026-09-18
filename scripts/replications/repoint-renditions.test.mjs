import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chunk,
  imageContentTypeFor,
  sniffImageContentType,
  planRepoint,
  verifyRepoint,
} from "./repoint-renditions.mjs";

const MEDIA_BASE = "https://media.example.test/assets";
const PROD = `${MEDIA_BASE}/media/sha256/${"a".repeat(64)}.mp4`;
const PROD_OLD = `${MEDIA_BASE}/media/sha256/${"b".repeat(64)}.mp4`;

beforeEach(() => vi.stubEnv("REPLICATION_MEDIA_BASE_URL", MEDIA_BASE));
afterEach(() => vi.unstubAllEnvs());
const ORPHAN = "https://orphan.example.invalid/api/storage/x";

describe("sniffImageContentType", () => {
  const withHeader = (bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(12)]);

  it("reads the container signature for every format in the corpus", () => {
    expect(sniffImageContentType(withHeader([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageContentType(withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageContentType(withHeader(Buffer.from("GIF89a", "latin1")))).toBe("image/gif");
    expect(sniffImageContentType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1"))).toBe("image/webp");
  });

  it("does not mistake a bare RIFF container for a WebP", () => {
    expect(sniffImageContentType(Buffer.from("RIFF\0\0\0\0WAVEfmt ", "latin1"))).toBeNull();
  });

  it("returns nothing rather than guessing on an unknown or truncated head", () => {
    expect(sniffImageContentType(Buffer.from("not an image", "latin1"))).toBeNull();
    expect(sniffImageContentType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageContentType(null)).toBeNull();
  });
});

describe("imageContentTypeFor", () => {
  // `shadow-people-figure-in-a-doorway` carries format "jpg" on a thumbnail
  // whose stored object is a WebP. The bytes are the only honest witness.
  it("lets the file's own signature overrule both the header and the row", () => {
    expect(
      imageContentTypeFor({ sniffed: "image/webp", declared: "image/jpeg", format: "jpg" }),
    ).toBe("image/webp");
  });

  // Legacy storage hands back whatever the upload declared, so a wrong type makes the
  // browser download the file instead of showing it — a page that looks broken.
  it("prefers the type the source deployment itself served", () => {
    expect(imageContentTypeFor({ declared: "image/webp", format: "jpg" })).toBe("image/webp");
  });

  it("ignores charset noise on the declared type", () => {
    expect(imageContentTypeFor({ declared: "image/png; charset=binary" })).toBe("image/png");
  });

  it("falls back to the archived extension when a resumed run never saw a response", () => {
    expect(imageContentTypeFor({ declared: null, format: "webp" })).toBe("image/webp");
    expect(imageContentTypeFor({ format: "jpeg" })).toBe("image/jpeg");
    expect(imageContentTypeFor({ format: "GIF" })).toBe("image/gif");
  });

  it("ignores a declared type that is not an image at all", () => {
    expect(imageContentTypeFor({ declared: "application/octet-stream", format: "png" })).toBe("image/png");
  });

  // Guessing octet-stream is the exact failure this function exists to prevent.
  it("throws rather than guessing", () => {
    expect(() => imageContentTypeFor({ declared: null, format: "psd" })).toThrow(/content type/);
    expect(() => imageContentTypeFor({})).toThrow(/content type/);
  });
});

describe("planRepoint", () => {
  const rendition = (extra = {}) => ({
    sourcePath: "/web/a.mp4",
    sourceBytes: 1000,
    contentType: "video/mp4",
    ...extra,
  });

  it("plans a repoint for a row still served from an orphan host", () => {
    const rows = [{ _id: "1", slug: "a", url: ORPHAN, storage_id: "placeholder-a" }];
    const { actions } = planRepoint(rows, new Map([["a", rendition()]]));

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      rowId: "1",
      expectedStorageId: "placeholder-a",
      expectedUrl: ORPHAN,
    });
  });

  it("refuses to repoint a row with no upload source, because that would delete its page", () => {
    const { actions, skipped } = planRepoint(
      [{ _id: "1", slug: "a", url: ORPHAN, storage_id: "placeholder-a" }],
      new Map(),
    );

    expect(actions).toHaveLength(0);
    expect(skipped[0].reason).toContain("no upload source");
  });

  it("refuses an empty upload source", () => {
    const { actions, skipped } = planRepoint(
      [{ _id: "1", slug: "a", url: ORPHAN, storage_id: "x" }],
      new Map([["a", rendition({ sourceBytes: 0 })]]),
    );

    expect(actions).toHaveLength(0);
    expect(skipped[0].reason).toContain("empty");
  });

  it("leaves a row alone when it already serves from production storage", () => {
    const rows = [{ _id: "1", slug: "a", url: PROD, storage_id: "real", storageOnProduction: true }];
    const { actions, skipped } = planRepoint(rows, new Map([["a", rendition()]]));

    expect(actions).toHaveLength(0);
    expect(skipped[0].reason).toContain("already served from production");
  });

  // Measured on production 2026-08-11: `shadow-people-figure-in-a-doorway`
  // resolved its image from production and its thumbnail from
  // `warmhearted-mosquito-204`. A media-only skip declared that row rescued
  // while it still handed an orphan host's URL to the gallery and public API.
  it("does not call a row rescued while its thumbnail is still on an orphan host", () => {
    const rows = [
      { _id: "1", slug: "a", url: PROD, thumbnail_url: ORPHAN, storage_id: "real", storageOnProduction: true },
    ];
    const { actions, skipped } = planRepoint(rows, new Map([["a", rendition({ posterPath: "/a.jpg" })]]));

    expect(skipped).toHaveLength(0);
    expect(actions[0].writesThumbnail).toBe(true);
  });

  it("captures the compare-and-swap expectation from the reviewed plan", () => {
    const rows = [
      { _id: "1", slug: "a", url: ORPHAN, thumbnail_url: PROD_OLD, storage_id: "placeholder-a" },
    ];
    const { actions } = planRepoint(rows, new Map([["a", rendition()]]));

    expect(actions[0].expectedThumbnailUrl).toBe(PROD_OLD);
    expect(actions[0].expectedStorageId).toBe("placeholder-a");
  });

  it("can be told to leave thumbnails out of the operation", () => {
    const rows = [{ _id: "1", slug: "a", url: ORPHAN, storage_id: "x" }];
    const { actions } = planRepoint(
      rows,
      new Map([["a", rendition({ posterPath: "/web/a.jpg" })]]),
      { includeThumbnails: false },
    );

    expect(actions[0].posterPath).toBeNull();
  });

  // A video's poster is a genuinely different file, so it is never mirrored even
  // in the unlikely event the two URLs match.
  it("never mirrors a thumbnail on the video path", () => {
    const rows = [{ _id: "1", slug: "a", url: ORPHAN, thumbnail_url: ORPHAN, storage_id: "x" }];
    const { actions } = planRepoint(rows, new Map([["a", rendition()]]));

    expect(actions[0].mirrorThumbnail).toBe(false);
  });
});

describe("planRepoint for images", () => {
  const master = (extra = {}) => ({
    sourcePath: "/archive/image/a.webp",
    sourceBytes: 18776,
    contentType: "image/webp",
    ...extra,
  });
  const options = { mediaType: "image" };

  it("uploads the archived master and carries its own content type", () => {
    const rows = [{ _id: "1", slug: "a", url: ORPHAN, thumbnail_url: ORPHAN, storage_id: "x" }];
    const { actions } = planRepoint(rows, new Map([["a", master()]]), options);

    expect(actions[0]).toMatchObject({
      sourcePath: "/archive/image/a.webp",
      sourceBytes: 18776,
      contentType: "image/webp",
    });
  });

  // The thumbnail and the image are one stored object wearing two field names.
  // Uploading it twice would double the bytes and leave two ids that can drift.
  it("mirrors a thumbnail that resolves to the same object as the image", () => {
    const rows = [{ _id: "1", slug: "a", url: ORPHAN, thumbnail_url: ORPHAN, storage_id: "x" }];
    const { actions } = planRepoint(rows, new Map([["a", master()]]), options);

    expect(actions[0].mirrorThumbnail).toBe(true);
    expect(actions[0].posterPath).toBeNull();
    expect(actions[0].writesThumbnail).toBe(true);
  });

  it("never uploads a mirrored thumbnail twice, even when one was archived", () => {
    const rows = [{ _id: "1", slug: "a", url: ORPHAN, thumbnail_url: ORPHAN, storage_id: "x" }];
    const { actions } = planRepoint(
      rows,
      new Map([["a", master({ posterPath: "/archive/image/a-thumbnail.webp" })]]),
      options,
    );

    expect(actions[0].posterPath).toBeNull();
  });

  it("does not claim to have written a thumbnail for a row that has none", () => {
    const rows = [{ _id: "1", slug: "a", url: ORPHAN, storage_id: "x" }];
    const { actions } = planRepoint(rows, new Map([["a", master()]]), options);

    expect(actions[0].writesThumbnail).toBe(false);
  });

  it("does not mirror a thumbnail that points somewhere else", () => {
    const rows = [{ _id: "1", slug: "a", url: ORPHAN, thumbnail_url: PROD_OLD, storage_id: "x" }];
    const { actions } = planRepoint(rows, new Map([["a", master()]]), options);

    expect(actions[0].mirrorThumbnail).toBe(false);
  });

  it("does not invent a thumbnail for a row that has none", () => {
    const rows = [{ _id: "1", slug: "a", url: ORPHAN, storage_id: "x" }];
    const { actions } = planRepoint(rows, new Map([["a", master()]]), options);

    expect(actions[0].mirrorThumbnail).toBe(false);
    expect(actions[0].posterPath).toBeNull();
  });

  it("honours --skip-thumbnails even when the thumbnail would be free to mirror", () => {
    const rows = [{ _id: "1", slug: "a", url: ORPHAN, thumbnail_url: ORPHAN, storage_id: "x" }];
    const { actions } = planRepoint(rows, new Map([["a", master()]]), {
      ...options,
      includeThumbnails: false,
    });

    expect(actions[0].mirrorThumbnail).toBe(false);
  });
});

describe("verifyRepoint", () => {
  it("accepts a row that moved from an orphan host to production", () => {
    const verdict = verifyRepoint({ before: { url: ORPHAN }, after: { url: PROD } });

    expect(verdict).toEqual({ ok: true, reasons: [] });
  });

  it("treats a null resolved url as a hard failure, because the page would be removed", () => {
    const verdict = verifyRepoint({ before: { url: ORPHAN }, after: { url: null } });

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons[0]).toContain("page would be removed");
  });

  it("catches the silent no-op: the write landed but the resolved url is unchanged", () => {
    const verdict = verifyRepoint({ before: { url: ORPHAN }, after: { url: ORPHAN } });

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("did not take effect");
  });

  it("verifies thumbnail rescue without demanding content-addressed media URL churn", () => {
    const key = `media/sha256/${"a".repeat(64)}.mp4`;
    const before = { url: PROD, thumbnail_url: ORPHAN };
    const after = { url: PROD, r2_key: key, thumbnail_url: PROD_OLD };
    const options = { before, after, expectedR2Key: key, expectThumbnailProduction: true };
    expect(verifyRepoint(options).ok).toBe(true);
    expect(verifyRepoint({ ...options, after: { ...after, r2_key: "wrong-key" } }).ok).toBe(false);
    expect(verifyRepoint({ ...options, after: { ...after, thumbnail_url: ORPHAN } }).ok).toBe(false);
  });

  it("rejects unknown and retired production delivery after repointing", () => {
    for (const url of [
      "https://unknown.example.test/media.mp4",
      "https://retired.example.invalid/api/storage/new",
    ]) {
      expect(verifyRepoint({ before: { url: ORPHAN }, after: { url } }).ok).toBe(false);
    }
  });

  it("catches a row that changed but still is not on production", () => {
    const verdict = verifyRepoint({
      before: { url: ORPHAN },
      after: { url: "https://dev.example.invalid/api/storage/y" },
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("dev.example.invalid");
  });

  it("catches a poster regressing to null", () => {
    const verdict = verifyRepoint({
      before: { url: ORPHAN, thumbnail_url: PROD_OLD },
      after: { url: PROD, thumbnail_url: null },
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("thumbnail regressed");
  });

  it("does not demand a poster the row never had", () => {
    expect(verifyRepoint({ before: { url: ORPHAN }, after: { url: PROD } }).ok).toBe(true);
  });

  it("reports every distinct problem at once rather than only the first", () => {
    const verdict = verifyRepoint({
      before: { url: ORPHAN, thumbnail_url: PROD_OLD },
      after: { url: ORPHAN, thumbnail_url: null },
    });

    expect(verdict.reasons).toHaveLength(3);
  });

  // A half-done rescue looks exactly like a finished one: the page renders from
  // production while the gallery tile and the public API still hand out the
  // orphan host's URL.
  it("catches an image whose media moved but whose thumbnail was left behind", () => {
    const verdict = verifyRepoint({
      before: { url: ORPHAN, thumbnail_url: ORPHAN },
      after: { url: PROD, thumbnail_url: ORPHAN },
      expectThumbnailProduction: true,
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("thumbnail still points at");
  });

  it("accepts an image whose media and thumbnail both landed on production", () => {
    expect(
      verifyRepoint({
        before: { url: ORPHAN, thumbnail_url: ORPHAN },
        after: { url: PROD, thumbnail_url: PROD },
        expectThumbnailProduction: true,
      }),
    ).toEqual({ ok: true, reasons: [] });
  });

  // The video run never claimed to move a thumbnail to production by mirroring,
  // so it must not start failing on rows it was always happy with.
  it("does not ask about the thumbnail host unless the run mirrored one", () => {
    expect(
      verifyRepoint({
        before: { url: ORPHAN, thumbnail_url: ORPHAN },
        after: { url: PROD, thumbnail_url: ORPHAN },
      }).ok,
    ).toBe(true);
  });
});

describe("chunk", () => {
  it("keeps batches small so blast radius stays small", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns nothing for an empty plan", () => {
    expect(chunk([], 5)).toEqual([]);
  });

  it("rejects a nonsense batch size instead of looping forever", () => {
    expect(() => chunk([1], 0)).toThrow(/positive integer/);
  });
});
