import { describe, expect, it } from "vitest";

import {
  groupByArtist,
  matchesQuery,
} from "@/features/effects/gallery/galleryModel";
import {
  PRODUCTION_SHAPED_REPLICATION_COUNT,
  productionShapedReplicationGallery,
} from "@/test/fixtures/replicationGalleryCorpus";
import { viewerCollectionFromGalleryGroups } from "./viewer/viewerModel";
import { drainGalleryPages } from "./galleryPagination";

const PAGE_SIZE = 64;
const PAGE_JSON_BUDGET_BYTES = 128 * 1024;
const FILTER_BUDGET_MS = 250;
const VIEWER_MODEL_BUDGET_MS = 250;
const COMPLETE_TRAVERSAL_BUDGET_MS = 500;

function fastestOf(runs: number, operation: () => void): number {
  operation();
  let fastest = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now();
    operation();
    fastest = Math.min(fastest, performance.now() - startedAt);
  }
  return fastest;
}

describe("Replication Index performance budgets", () => {
  const corpus = productionShapedReplicationGallery();

  it("uses the audited production-scale row count", () => {
    expect(corpus).toHaveLength(PRODUCTION_SHAPED_REPLICATION_COUNT);
  });

  it("keeps a bounded gallery page below the JSON transfer budget", () => {
    const bytes = Buffer.byteLength(
      JSON.stringify({
        data: corpus.slice(0, PAGE_SIZE),
        nextCursor: "opaque-convex-cursor",
        hasMore: true,
      }),
    );

    expect(bytes).toBeLessThanOrEqual(PAGE_JSON_BUDGET_BYTES);
  });

  it("filters a production-shaped corpus within the interaction budget", () => {
    let resultCount = 0;
    const elapsed = fastestOf(5, () => {
      resultCount = corpus.filter((row) =>
        matchesQuery(row, "artist 42", (slug) => slug),
      ).length;
    });

    expect(resultCount).toBeGreaterThan(0);
    expect(elapsed).toBeLessThanOrEqual(FILTER_BUDGET_MS);
  });

  it("builds the viewer collection within the open-latency budget", () => {
    const groups = groupByArtist(corpus);
    let itemCount = 0;
    const elapsed = fastestOf(5, () => {
      const collection = viewerCollectionFromGalleryGroups(
        groups,
        "artist",
        "/replications",
        (slug) => slug,
        () => null,
      );
      itemCount = collection.groups.reduce(
        (total, group) => total + group.items.length,
        0,
      );
    });

    expect(itemCount).toBe(PRODUCTION_SHAPED_REPLICATION_COUNT);
    expect(elapsed).toBeLessThanOrEqual(VIEWER_MODEL_BUDGET_MS);
  });

  it("traverses all 6,733 rows through bounded pages without omissions or duplicates", async () => {
    const firstPage = corpus.slice(0, PAGE_SIZE);
    const requestedOffsets: number[] = [];
    const startedAt = performance.now();
    const result = await drainGalleryPages({
      initialItems: firstPage,
      initialCursor: String(PAGE_SIZE),
      fetchPage: async (cursor) => {
        const offset = Number(cursor);
        requestedOffsets.push(offset);
        const nextOffset = offset + PAGE_SIZE;
        return {
          data: corpus.slice(offset, nextOffset),
          nextCursor: nextOffset < corpus.length ? String(nextOffset) : null,
          hasMore: nextOffset < corpus.length,
        };
      },
    });
    const elapsed = performance.now() - startedAt;

    expect(requestedOffsets).toHaveLength(
      Math.ceil(corpus.length / PAGE_SIZE) - 1,
    );
    expect(new Set(result.items.map((row) => row._id)).size).toBe(
      PRODUCTION_SHAPED_REPLICATION_COUNT,
    );
    expect(result.items).toHaveLength(PRODUCTION_SHAPED_REPLICATION_COUNT);
    expect(result.pagesLoaded).toBe(requestedOffsets.length);
    expect(elapsed).toBeLessThanOrEqual(COMPLETE_TRAVERSAL_BUDGET_MS);
  });
});
