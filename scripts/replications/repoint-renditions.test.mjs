import { describe, expect, it } from "vitest";
import {
  buildRollbackEntry,
  chunk,
  fieldThatWins,
  planRepoint,
  verifyRepoint,
} from "./repoint-renditions.mjs";

const PROD = "https://glad-minnow-656.convex.cloud/api/storage/new";
const PROD_OLD = "https://glad-minnow-656.convex.cloud/api/storage/old";
const ORPHAN = "https://warmhearted-mosquito-204.convex.cloud/api/storage/x";

describe("fieldThatWins", () => {
  // resolveReplicationUrls tries ctx.storage.getUrl(storage_id) first and only
  // falls back to `url`. Writing `url` alone is a silent no-op for any row with
  // a live storage id. If the resolver's precedence ever changes, this is the
  // test that should fail and force the migration to be re-thought.
  it("is storage_id, the field that outranks url in the resolver", () => {
    expect(fieldThatWins()).toBe("storage_id");
  });
});

describe("planRepoint", () => {
  const rendition = (extra = {}) => ({ videoPath: "/web/a.mp4", videoBytes: 1000, ...extra });

  it("plans a repoint for a row still served from an orphan host", () => {
    const rows = [{ _id: "1", slug: "a", url: ORPHAN, storage_id: "placeholder-a" }];
    const { actions } = planRepoint(rows, new Map([["a", rendition()]]));

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      rowId: "1",
      field: "storage_id",
      expectedStorageId: "placeholder-a",
      expectedUrl: ORPHAN,
    });
  });

  it("refuses to repoint a row with no rendition, because that would delete its page", () => {
    const { actions, skipped } = planRepoint(
      [{ _id: "1", slug: "a", url: ORPHAN, storage_id: "placeholder-a" }],
      new Map(),
    );

    expect(actions).toHaveLength(0);
    expect(skipped[0].reason).toContain("no rendition");
  });

  it("refuses an empty rendition", () => {
    const { actions, skipped } = planRepoint(
      [{ _id: "1", slug: "a", url: ORPHAN, storage_id: "x" }],
      new Map([["a", rendition({ videoBytes: 0 })]]),
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

  it("catches a row that changed but still is not on production", () => {
    const verdict = verifyRepoint({
      before: { url: ORPHAN },
      after: { url: "https://enchanted-echidna-791.convex.cloud/api/storage/y" },
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("enchanted-echidna-791");
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
});

describe("buildRollbackEntry", () => {
  it("records everything needed to put the row back exactly as it was", () => {
    const action = {
      rowId: "1",
      slug: "a",
      expectedStorageId: "placeholder-a",
      expectedUrl: ORPHAN,
      expectedThumbnailUrl: null,
    };
    const entry = buildRollbackEntry(action, { storageId: "new-id" });

    expect(entry.previous).toEqual({
      storage_id: "placeholder-a",
      url: ORPHAN,
      thumbnail_url: null,
    });
    expect(entry.applied.storage_id).toBe("new-id");
    expect(entry.reverseWith).toBe("api.replications.updateStorageIds");
  });

  it("keeps the old url, which is what makes the migration reversible", () => {
    const entry = buildRollbackEntry(
      { rowId: "1", slug: "a", expectedStorageId: "p", expectedUrl: ORPHAN, expectedThumbnailUrl: null },
      { storageId: "new" },
    );

    expect(entry.previous.url).toBe(ORPHAN);
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
