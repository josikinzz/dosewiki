import { describe, expect, it } from "vitest";

import { buildAssetMap, normalizeTag, rewriteInternalLinks, rewriteSeeAlso } from "../scripts/migrate/effects/rewrites.mjs";
import { transformEffect } from "../scripts/migrate/effects/transform.mjs";

describe("migrate-effects helpers", () => {
  it("normalizes tags and rewrites internal links", () => {
    expect(normalizeTag("Distortions")).toBe("distortion");
    expect(rewriteInternalLinks(`[int-link to="/summaries/psychedelics"]`)).toBe(
      `[int-link to="/psychoactive/psychedelic"]`,
    );
    expect(rewriteSeeAlso([{ location: "/substances/testamine", title: "Testamine" }])).toEqual([
      { location: "/testamine", title: "Testamine" },
    ]);
  });

  it("transforms effect records with asset, social image, and see-also rewrites", () => {
    const assetMap = buildAssetMap([
      {
        title: "example-image",
        resource: "gallery/example-image.jpg",
        url: "example-image",
      },
    ]);
    const galleryOrderByEffect = new Map([["fixture-effect", ["canonical-gallery-item"]]]);

    const transformed = transformEffect(
      {
        url: "fixture-effect",
        name: "Fixture Effect",
        tags: ["Distortions", "Visual"],
        featured: true,
        summary_raw: "Summary text",
        description_raw: `<img src="/img/gallery/example-image.jpg"> [int-link to="/summaries/psychedelics"]`,
        description: { parsed: '{"type":"doc"}' },
        analysis_raw: "Analysis",
        analysis: { parsed: { type: "analysis" } },
        long_summary: { raw: `See [int-link to="/substances/ketamine"]`, parsed: '{"type":"long"}' },
        social_media_image: "/img/gallery/example-image.jpg",
        see_also: [{ location: "/summaries/stimulants", title: "Stimulants" }],
        citations: [{ url: "https://example.com", text: "Citation" }],
        external_links: [{ url: "https://external.com", title: "External" }],
        subarticles: [{ _id: { $oid: "abc123" }, title: "Child" }],
        gallery_order: [{ title: "local gallery item" }],
      },
      assetMap,
      galleryOrderByEffect,
    );

    expect(transformed.tags).toEqual(["distortion", "visual"]);
    expect(transformed.description_raw).toContain("r2.dev");
    expect(transformed.description_raw).toContain(`/psychoactive/psychedelic`);
    expect(transformed.long_summary_raw).toContain(`[int-link to="/ketamine"]`);
    expect(transformed.social_media_image).toContain("r2.dev");
    expect(transformed.see_also).toEqual([
      { location: "/psychoactive/stimulant", title: "Stimulants" },
    ]);
    expect(transformed.gallery_order).toEqual(["canonical-gallery-item"]);
    expect(transformed.subarticles).toEqual([{ id: "abc123", title: "Child" }]);
    expect(transformed.description_ast).toEqual({ type: "doc" });
    expect(transformed.analysis_ast).toEqual({ type: "analysis" });
    expect(transformed.long_summary_ast).toEqual({ type: "long" });
  });
});
