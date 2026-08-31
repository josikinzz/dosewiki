import { describe, expect, it, vi } from "vitest";

import { drainGalleryPages } from "./galleryPagination";
import { productionShapedReplicationGallery } from "@/test/fixtures/replicationGalleryCorpus";

describe("gallery continuation safety", () => {
  it("merges overlapping pages idempotently in first-seen order", async () => {
    const corpus = productionShapedReplicationGallery().slice(0, 4);
    const result = await drainGalleryPages({
      initialItems: corpus.slice(0, 2),
      initialCursor: "next",
      fetchPage: vi.fn(async () => ({
        data: corpus.slice(1),
        nextCursor: null,
        hasMore: false,
      })),
    });

    expect(result.items.map(({ _id }) => _id)).toEqual(
      corpus.map(({ _id }) => _id),
    );
  });

  it("fails closed when a continuation repeats its cursor", async () => {
    await expect(
      drainGalleryPages({
        initialItems: [],
        initialCursor: "same",
        fetchPage: vi.fn(async () => ({
          data: [],
          nextCursor: "same",
          hasMore: true,
        })),
      }),
    ).rejects.toThrow("repeated a cursor");
  });

  it("fails closed when a continuing response omits its cursor", async () => {
    await expect(
      drainGalleryPages({
        initialItems: [],
        initialCursor: "first",
        fetchPage: vi.fn(async () => ({
          data: [],
          nextCursor: null,
          hasMore: true,
        })),
      }),
    ).rejects.toThrow("omitted its next cursor");
  });

  it("partitions 6,733 rows into 105 full pages and one terminal page", async () => {
    const corpus = productionShapedReplicationGallery();
    const pageSizes = [corpus.slice(0, 64).length];
    const fetchPage = vi.fn(async (cursor: string) => {
      const offset = Number(cursor);
      const data = corpus.slice(offset, offset + 64);
      pageSizes.push(data.length);
      const nextOffset = offset + data.length;
      return {
        data,
        nextCursor: nextOffset < corpus.length ? String(nextOffset) : null,
        hasMore: nextOffset < corpus.length,
      };
    });

    const result = await drainGalleryPages({
      initialItems: corpus.slice(0, 64),
      initialCursor: "64",
      fetchPage,
    });

    expect(pageSizes).toHaveLength(106);
    expect(pageSizes.slice(0, -1)).toEqual(Array(105).fill(64));
    expect(pageSizes[pageSizes.length - 1]).toBe(13);
    expect(fetchPage).toHaveBeenCalledTimes(105);
    expect(result.items).toHaveLength(6_733);
    expect(new Set(result.items.map(({ _id }) => _id)).size).toBe(6_733);
  });
});
