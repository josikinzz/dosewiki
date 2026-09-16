import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRouteLoaderMocks } from "./routeLoaders.testHarness";
import {
  loadCategoryRoute,
  loadCategoryMetadataRoute,
  loadEffectCategoryRoute,
  loadMechanismQualifierRoute,
  loadTaxonomyRoute,
  loadTaxonomyStaticParams,
  type TaxonomyRouteDescriptor,
} from "./routeLoaders.taxonomy";

const { publicData, publicLibrary } = getRouteLoaderMocks();

const liveTranslation = vi.hoisted(() => ({
  localizeRecords: vi.fn(),
}));
vi.mock("../translation/liveTranslation", () => liveTranslation);

describe("taxonomy route loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicData.getPublicEffectSummariesBySlugs.mockResolvedValue([]);
  });

  function createGenericDescriptor(
    detail: { label: string; total: number } | null,
  ): TaxonomyRouteDescriptor<"mechanism", { label: string; total: number } | null> {
    return {
      routeFamily: "mechanism",
      getDetail: async () => detail,
      getMetadata: ({ detail }) => ({
        title: detail?.label ?? "Fallback",
        description: detail
          ? `Browse ${detail.total} records in ${detail.label} [cite:paper-a].`
          : "Browse fallback routes.",
      }),
    };
  }

  it("returns ok results with stripped metadata and the requested canonical route", async () => {
    const result = await loadTaxonomyRoute(createGenericDescriptor({ label: "Tryptamines", total: 12 }), {
      mechanismSlug: "tryptamines",
    });

    expect(result).toEqual({
      kind: "ok",
      detail: { label: "Tryptamines", total: 12 },
      metadata: {
        title: "Tryptamines",
        description: "Browse 12 records in Tryptamines.",
      },
      canonicalRoute: { family: "mechanism", params: { mechanismSlug: "tryptamines" } },
    });
  });

  it("returns not-found results that keep the descriptor fallback metadata", async () => {
    await expect(
      loadTaxonomyRoute(createGenericDescriptor(null), { mechanismSlug: "unknown" }),
    ).resolves.toEqual({
      kind: "not-found",
      metadata: { title: "Fallback", description: "Browse fallback routes." },
      canonicalRoute: { family: "mechanism", params: { mechanismSlug: "unknown" } },
    });
  });

  it("supports specialized missing rules through isMissing", async () => {
    const descriptor: TaxonomyRouteDescriptor<"effectCategory", unknown[]> = {
      routeFamily: "effectCategory",
      getDetail: async () => [],
      isMissing: (effects) => effects.length === 0,
      getMetadata: ({ params, detail }) => ({
        title: `Effect category · ${params.categorySlug}`,
        description: `Browse ${detail?.length ?? 0} effects in the ${params.categorySlug} category.`,
      }),
    };

    await expect(
      loadTaxonomyRoute(descriptor, { categorySlug: "visual" }),
    ).resolves.toMatchObject({
      kind: "not-found",
      metadata: { description: "Browse 0 effects in the visual category." },
    });
  });

  it("redirects alias params to the canonical route path", async () => {
    const descriptor: TaxonomyRouteDescriptor<"category", null> = {
      routeFamily: "category",
      getDetail: async () => null,
      getAlias: ({ categoryKey }) =>
        categoryKey === "psychedelics" ? { categoryKey: "psychedelic" } : null,
      getMetadata: () => ({ title: "Category", description: "Browse substances by category." }),
    };

    await expect(loadTaxonomyRoute(descriptor, { categoryKey: "psychedelics" })).resolves.toEqual({
      kind: "redirect",
      target: "/category/psychedelic",
      metadata: { title: "Category", description: "Browse substances by category." },
      canonicalRoute: { family: "category", params: { categoryKey: "psychedelics" } },
    });
  });

  it("selects canonical category membership before localizing only rendered summaries", async () => {
    publicLibrary.getPublicCategoryDetail.mockResolvedValueOnce({
      definition: { key: "psychedelic", name: "Psychedelics" },
      total: 12,
    });
    const selected = {
      slug: "colour-enhancement", name: "Colour enhancement", summary: "Brighter colours.",
      featured: false, tags: ["psychedelic", "visual", "enhancement"],
    };
    publicData.getPublicEffects.mockResolvedValueOnce([
      selected,
      { ...selected, slug: "unrelated", tags: ["dissociative"] },
    ]);
    const summary = {
      ...selected, long_summary_raw: "Detailed colour summary",
      citations: [{ url: "https://example.com/paper", text: "Paper" }],
      subarticles: [{ id: "colour", title: "Colour" }],
    };
    publicData.getPublicEffectSummariesBySlugs.mockResolvedValueOnce([summary]);
    const localized = { ...summary, name: "色彩增强", summary: "色彩更加明亮。" };
    liveTranslation.localizeRecords.mockResolvedValueOnce({ records: [localized] });
    const result = await loadCategoryRoute("psychedelic", {
      code: "zh-Hans", pathPrefix: "/zh", htmlLang: "zh-Hans",
    });
    expect(publicData.getPublicEffectSummariesBySlugs).toHaveBeenCalledWith(["colour-enhancement"]);
    expect(liveTranslation.localizeRecords).toHaveBeenCalledWith([summary], "zh-Hans", "effect");
    expect(result).toMatchObject({ kind: "ok", effects: [localized] });
  });

  it("resolves category metadata without optional effect or gallery reads", async () => {
    publicLibrary.getPublicCategoryDetail.mockResolvedValueOnce({
      definition: { key: "psychedelic", name: "Psychedelics" },
      total: 12,
    });
    await expect(loadCategoryMetadataRoute("psychedelic")).resolves.toMatchObject({
      kind: "ok",
      canonicalRoute: { family: "category", params: { categoryKey: "psychedelic" } },
    });
    expect(publicData.getPublicEffects).not.toHaveBeenCalled();
    expect(publicData.getPublicEffectSummariesBySlugs).not.toHaveBeenCalled();
    expect(publicData.getPublicGalleryReplications).not.toHaveBeenCalled();
  });

  it("redirects known category aliases without loading effects", async () => {

    await expect(loadCategoryRoute("psychedelics")).resolves.toEqual({
      kind: "redirect",
      target: "/category/psychedelic",
      metadata: { title: "Category", description: "Browse substances by category." },
      canonicalRoute: { family: "category", params: { categoryKey: "psychedelics" } },
    });
    expect(publicLibrary.getPublicCategoryDetail).not.toHaveBeenCalled();
    expect(publicData.getPublicEffects).not.toHaveBeenCalled();
  });

  it("returns category not-found results with fallback metadata and no effects fetch", async () => {
    publicLibrary.getPublicCategoryDetail.mockResolvedValueOnce(null);

    await expect(loadCategoryRoute("missing")).resolves.toEqual({
      kind: "not-found",
      metadata: { title: "Category", description: "Browse substances by category." },
      canonicalRoute: { family: "category", params: { categoryKey: "missing" } },
    });
    expect(publicData.getPublicEffects).not.toHaveBeenCalled();
  });

  it("keeps canonical effect category routes valid when no effects are mapped yet", async () => {
    publicData.getPublicEffects.mockResolvedValueOnce([]);

    await expect(loadEffectCategoryRoute("visual-effects")).resolves.toEqual({
      kind: "ok",
      detail: [],
      metadata: {
        title: "Visual Effects",
        description: "Browse 0 effects in the visual-effects category.",
      },
      canonicalRoute: { family: "effectCategory", params: { categorySlug: "visual-effects" } },
    });
  });

  it("returns effect category not-found for unknown slugs without fetching effects", async () => {
    await expect(loadEffectCategoryRoute("not-real")).resolves.toMatchObject({
      kind: "not-found",
      metadata: { description: "Browse 0 effects in the not-real category." },
    });
    expect(publicData.getPublicEffects).not.toHaveBeenCalled();
  });

  it("redirects effect category aliases to their canonical slug", async () => {
    await expect(loadEffectCategoryRoute("visual")).resolves.toMatchObject({
      kind: "redirect",
      target: "/effects/category/visual-effects",
      canonicalRoute: { family: "effectCategory", params: { categorySlug: "visual" } },
    });
    expect(publicData.getPublicEffects).not.toHaveBeenCalled();
  });

  it("filters effect category routes by the canonical tag groups", async () => {
    publicData.getPublicEffects.mockResolvedValueOnce([
      {
        name: "Visual Alpha",
        slug: "visual-alpha",
        summary: "",
        featured: false,
        tags: ["visual", "amplification"],
      },
      {
        name: "Visual Suppression",
        slug: "visual-suppression",
        summary: "",
        featured: false,
        tags: ["visual", "suppression"],
      },
    ]);

    await expect(loadEffectCategoryRoute("visual-amplifications")).resolves.toMatchObject({
      kind: "ok",
      detail: [
        expect.objectContaining({
          name: "Visual Alpha",
          slug: "visual-alpha",
        }),
      ],
      metadata: {
        title: "Visual Amplifications",
        description: "Browse 1 effects in the visual-amplifications category.",
      },
    });
  });

  it("resolves mechanism qualifier routes from the two-param surface", async () => {
    const mechanism = {
      definition: { name: "Serotonin", total: 5 },
      qualifiers: [{ key: "agonist", label: "Agonist", total: 3 }],
    };
    publicLibrary.getPublicMechanismDetail.mockResolvedValueOnce(mechanism);

    await expect(loadMechanismQualifierRoute("serotonin", "agonist")).resolves.toEqual({
      kind: "ok",
      detail: { mechanism, qualifier: mechanism.qualifiers[0] },
      metadata: {
        title: "Serotonin Agonist",
        description: "Browse 3 substances in the Agonist qualifier.",
      },
      canonicalRoute: {
        family: "mechanismQualifier",
        params: { mechanismSlug: "serotonin", qualifierSlug: "agonist" },
      },
    });

    publicLibrary.getPublicMechanismDetail.mockResolvedValueOnce(mechanism);

    await expect(loadMechanismQualifierRoute("serotonin", "missing")).resolves.toEqual({
      kind: "not-found",
      metadata: {
        title: "Mechanism qualifier",
        description: "Browse mechanism qualifier routes.",
      },
      canonicalRoute: {
        family: "mechanismQualifier",
        params: { mechanismSlug: "serotonin", qualifierSlug: "missing" },
      },
    });
  });


  it("defaults static params to an empty list when the descriptor omits them", async () => {
    await expect(loadTaxonomyStaticParams(createGenericDescriptor(null))).resolves.toEqual([]);
  });
});
