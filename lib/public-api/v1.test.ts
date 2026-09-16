import { describe, expect, it } from "vitest";
import {
  decodePublicApiCursor,
  encodePublicApiCursor,
  parsePublicApiLimit,
  projectPublicApiReplication,
  projectPublicApiSubstanceDetail,
  projectPublicApiSubstancePreview,
} from "./v1";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import { parsePublicSubstanceRecord } from "../data/publicData.substanceContract";

describe("public API v1 contract helpers", () => {
  it("round-trips opaque pagination cursors", () => {
    const cursor = encodePublicApiCursor(42);
    expect(cursor).not.toContain("42");
    expect(decodePublicApiCursor(cursor)).toBe(42);
    expect(decodePublicApiCursor("not-a-cursor")).toBeNull();
  });

  it("bounds page sizes", () => {
    expect(parsePublicApiLimit(null)).toBe(25);
    expect(parsePublicApiLimit("1")).toBe(1);
    expect(parsePublicApiLimit("100")).toBe(100);
    expect(parsePublicApiLimit("0")).toBeNull();
    expect(parsePublicApiLimit("101")).toBeNull();
    expect(parsePublicApiLimit("2.5")).toBeNull();
  });

  it("preserves the legacy pharmacology shape at the v1 detail boundary", () => {
    const article = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
    });
    expect(article).not.toBeNull();
    if (!article) throw new Error("Expected a valid public article fixture.");

    const detail = projectPublicApiSubstanceDetail(article);
    expect(detail.pharmacology).toMatchObject({
      receptor_profile: [
        { receptor: "5-HT2A", tag: "5-HT2A receptor agonist" },
      ],
    });
    expect(detail.pharmacology).toHaveProperty("binding_sites");
    expect(detail).toMatchObject({
      reagent_testing_normalized: { source: "none", results: [] },
      molecule: {
        schemes: {
          dosewiki: { url: "/api/v1/molecules/lsd.svg?scheme=dosewiki" },
          "effect-index": {
            url: "/api/v1/molecules/lsd.svg?scheme=effect-index",
          },
          "effect-index-dark": {
            url: "/api/v1/molecules/lsd.svg?scheme=effect-index-dark",
          },
        },
      },
    });
  });

  it("removes private storage and permission fields from replications", () => {
    const projected = projectPublicApiReplication({
      _id: "private-id",
      _creationTime: 1,
      storage_id: "private-storage",
      thumbnail_storage_id: "private-thumbnail",
      permission_notes: "private note",
      removal_contact: "private@example.com",
      slug: "drifting",
      title: "Drifting",
      artist: "Artist",
      type: "video",
      effect_slug: "visual-drifting",
      format: "mp4",
      created_at: "2026-01-01",
      date_info: {
        value: "2020",
        kind: "year",
        confidence: "high",
        researched_at: "2026-01-02",
      },
      url: "https://media.example/drifting.mp4",
      rights_status: "permission-granted",
    });

    expect(projected).not.toHaveProperty("_id");
    expect(projected).not.toHaveProperty("storage_id");
    expect(JSON.stringify(projected)).not.toContain("private note");
    expect(projected.rights.status).toBe("permission-granted");
    // Presence distinguishes known-empty assignments from an older API that
    // omitted secondary vocabulary entirely.
    expect(projected.effect_tags).toEqual([]);
    expect(projected.created_at).toBe("2026-01-01");
    expect(projected.date_info?.value).toBe("2020");
  });

  it("projects the stable substance preview shape", () => {
    expect(
      projectPublicApiSubstancePreview({
        slug: "mdma",
        title: "MDMA",
        summary: "Summary",
        priority: "high",
        indexCategories: ["entactogen"],
      }),
    ).toEqual({
      slug: "mdma",
      title: "MDMA",
      summary: "Summary",
      priority: "high",
      categories: ["entactogen"],
      url: "https://dose.wiki/mdma",
    });
  });
});
