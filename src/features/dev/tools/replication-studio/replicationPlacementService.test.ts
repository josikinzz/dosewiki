import { describe, expect, it, vi } from "vitest";

import {
  placeReplicationsOnSubstances,
  preflightReplicationPlacement,
} from "./replicationPlacementService";
import type { GalleryDetail } from "./substanceGalleryPortalModel";

const DETAIL: GalleryDetail = {
  substance: { slug: "lsd", title: "LSD" },
  matches: [],
  curation: {
    curated_slugs: ["already-there"],
    removed_slugs: ["excluded-work"],
    updated_at: "2026-08-20T10:00:00.000Z",
    updated_by: "editor@example.com",
  },
};

describe("replication placement service", () => {
  it("directly appends an unmatched eligible replication without changing exclusions", async () => {
    const saveCuration = vi.fn(async (_slug, input) => ({
      status: "saved" as const,
      curatedSlugs: [...input.curatedSlugs],
      removedSlugs: [...input.removedSlugs],
      prunedCurated: [],
      updatedAt: "2026-08-21T10:00:00.000Z",
    }));

    const results = await placeReplicationsOnSubstances(
      { substanceSlugs: ["lsd"], replicationSlugs: ["unmatched-work"] },
      {
        fetchDetail: async () => ({ status: "ready", detail: DETAIL }),
        saveCuration,
      },
    );

    expect(saveCuration).toHaveBeenCalledWith("lsd", {
      curatedSlugs: ["already-there", "unmatched-work"],
      removedSlugs: ["excluded-work"],
      expectedUpdatedAt: "2026-08-20T10:00:00.000Z",
    });
    expect(results[0]).toMatchObject({
      status: "saved",
      added: ["unmatched-work"],
      excluded: [],
      ineligible: [],
    });
  });

  it("preserves a requested slug's exclusion and avoids a needless write", async () => {
    const saveCuration = vi.fn();
    expect(preflightReplicationPlacement(DETAIL, ["excluded-work", "already-there"])).toEqual({
      substanceSlug: "lsd",
      substanceTitle: "LSD",
      toAdd: [],
      alreadyPresent: ["already-there"],
      excluded: ["excluded-work"],
    });

    const [result] = await placeReplicationsOnSubstances(
      { substanceSlugs: ["lsd"], replicationSlugs: ["excluded-work"] },
      {
        fetchDetail: async () => ({ status: "ready", detail: DETAIL }),
        saveCuration,
      },
    );

    expect(saveCuration).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "unchanged", excluded: ["excluded-work"] });
  });

  it("reports conflicts, read errors, and server-pruned ineligible works per target", async () => {
    const results = await placeReplicationsOnSubstances(
      {
        substanceSlugs: ["lsd", "dmt", "psilocybin"],
        replicationSlugs: ["requested-work"],
      },
      {
        fetchDetail: async (slug) =>
          slug === "dmt"
            ? { status: "error", message: "Detail unavailable" }
            : {
                status: "ready",
                detail: { ...DETAIL, substance: { slug, title: slug.toUpperCase() } },
              },
        saveCuration: async (slug) =>
          slug === "lsd"
            ? { status: "conflict", message: "Changed elsewhere" }
            : {
                status: "saved",
                curatedSlugs: ["already-there"],
                removedSlugs: ["excluded-work"],
                prunedCurated: ["requested-work"],
                updatedAt: "2026-08-21T10:00:00.000Z",
              },
      },
    );

    expect(results).toEqual([
      expect.objectContaining({
        substanceSlug: "lsd",
        status: "conflict",
        message: "Changed elsewhere",
      }),
      expect.objectContaining({
        substanceSlug: "dmt",
        status: "error",
        message: "Detail unavailable",
      }),
      expect.objectContaining({
        substanceSlug: "psilocybin",
        status: "saved",
        ineligible: ["requested-work"],
        added: [],
      }),
    ]);
  });
});
