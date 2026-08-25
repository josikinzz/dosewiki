import { describe, expect, it } from "vitest";

import {
  mediaTypeForKind,
  normalizeIdentity,
  reconcileMedia,
  selectCanary,
} from "./import-replication-taxonomy.mjs";

describe("replication taxonomy importer", () => {
  it("uses the same trim-and-lowercase artist identity as gallery grouping", () => {
    expect(normalizeIdentity("  Eloh   Projects ")).toBe("eloh   projects");
  });

  it("maps GIF catalog records to stored image rows", () => {
    expect(mediaTypeForKind("gif")).toBe("image");
    expect(mediaTypeForKind("review-note")).toBeNull();
  });

  it("prefers a ledger-owned production id and rejects duplicate catalog claims", () => {
    const live = {
      id: "row-1",
      slug: "work-artist",
      title: "Work",
      artist: "Artist",
      type: "image",
      storage_id: "storage-1",
      taxonomy_source_digest: null,
    };
    const result = reconcileMedia({
      taxonomy: {
        mediaClassification: [
          { id: "a", title: "Work", artist: "Artist", kind: "image" },
          { id: "b", title: "Work", artist: "Artist", kind: "image" },
        ],
      },
      uploadPlan: { entries: [] },
      uploadLedger: {
        items: {
          a: { productionId: "row-1" },
          b: { productionId: "row-1" },
        },
      },
      liveRows: [live],
    });
    expect(result.matched).toEqual([]);
    expect(result.duplicateLiveMatches).toEqual([
      { productionId: "row-1", slug: "work-artist", catalogIds: ["a", "b"] },
    ]);
  });

  it("chooses a diverse canary without duplicating rows", () => {
    const row = (id, overrides = {}) => ({
      id,
      taxonomy: { replication_status: "replication", ...overrides },
    });
    const selected = selectCanary(
      [
        row("not", { replication_status: "not-replication" }),
        row("open", { viewing_mode: "open-eye" }),
        row("closed", { viewing_mode: "closed-eye" }),
        row("mixed", { viewing_mode: "mixed" }),
        row("drug", { title_drugs: [{ slug: "dmt" }] }),
      ],
      [
        { key: "a", primary_type: "replicator" },
        { key: "b", primary_type: "mixed" },
      ],
    );
    expect(selected.replications.map((entry) => entry.id)).toEqual([
      "not",
      "open",
      "closed",
      "mixed",
      "drug",
    ]);
    expect(selected.artists.map((entry) => entry.key)).toEqual(["a", "b"]);
  });
});
