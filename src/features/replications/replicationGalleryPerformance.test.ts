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

/**
 * The complete corpus travels as one CDN-cached response now (about 1 MB
 * compressed in production). This budget guards the uncompressed JSON so a
 * projection change that fattens every row is caught before it ships ~7,000
 * copies of itself.
 */
const CORPUS_JSON_BUDGET_BYTES = 12 * 1024 * 1024;
const FILTER_BUDGET_MS = 250;
const VIEWER_MODEL_BUDGET_MS = 250;
const GROUPING_BUDGET_MS = 250;

function medianOf(runs: number, operation: () => void): number {
  operation();
  const elapsed: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now();
    operation();
    elapsed.push(performance.now() - startedAt);
  }
  elapsed.sort((left, right) => left - right);
  return elapsed[Math.floor(elapsed.length / 2)];
}

describe("Replication Index performance budgets", () => {
  const corpus = productionShapedReplicationGallery();

  it("uses the audited production-scale row count", () => {
    expect(corpus).toHaveLength(PRODUCTION_SHAPED_REPLICATION_COUNT);
  });

  it("keeps the complete corpus response below the JSON transfer budget", () => {
    const bytes = Buffer.byteLength(JSON.stringify({ data: corpus }));

    expect(bytes).toBeLessThanOrEqual(CORPUS_JSON_BUDGET_BYTES);
  });

  it("filters a production-shaped corpus within the interaction budget", () => {
    let resultCount = 0;
    const elapsed = medianOf(7, () => {
      resultCount = corpus.filter((row) =>
        matchesQuery(row, "artist 42", (slug) => slug),
      ).length;
    });

    expect(resultCount).toBeGreaterThan(0);
    expect(elapsed).toBeLessThanOrEqual(FILTER_BUDGET_MS);
  });

  it("groups a production-shaped corpus into artist rails within the render budget", () => {
    let groupCount = 0;
    const elapsed = medianOf(7, () => {
      groupCount = groupByArtist(corpus).length;
    });

    expect(groupCount).toBeGreaterThan(0);
    expect(elapsed).toBeLessThanOrEqual(GROUPING_BUDGET_MS);
  });

  it("builds the viewer collection within the open-latency budget", () => {
    const groups = groupByArtist(corpus);
    let itemCount = 0;
    const elapsed = medianOf(7, () => {
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
});
