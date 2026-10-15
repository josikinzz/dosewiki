import { describe, expect, it } from "vitest";
import type { PublicEffectPreview, PublicEffectSummary } from "../../../../lib/data/publicData.shared";
import { enrichEffectPreviews } from "./enrichEffectPreviews";

describe("canonical effect preview enrichment", () => {
  it("adds only article content while preserving canonical identity, metadata, and order", () => {
    const previews: PublicEffectPreview[] = [
      { slug: "synthetic-one", name: "Canonical one", summary: "Short one", featured: true, tags: ["canonical"] },
      { slug: "synthetic-two", name: "Canonical two", summary: "Short two", featured: false, tags: [] },
    ];
    const summaries: PublicEffectSummary[] = [{
      slug: "synthetic-one", name: "Stale name", summary: "Stale summary", tags: ["stale"],
      long_summary_raw: "Detailed content", long_summary_ast: [],
      citations: [{ url: "https://example.org/synthetic", text: "Synthetic source" }],
      subarticles: [{ id: "synthetic-subarticle", title: "Synthetic subarticle" }],
    }];
    expect(enrichEffectPreviews(previews, summaries)).toEqual([
      { ...previews[0], long_summary_raw: "Detailed content", long_summary_ast: [], citations: summaries[0].citations, subarticles: summaries[0].subarticles },
      previews[1],
    ]);
    expect(previews[0].name).toBe("Canonical one");
  });
});
