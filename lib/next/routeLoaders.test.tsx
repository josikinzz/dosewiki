import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  categoryRouteDescriptor,
  loadArticleRoute,
  loadArticlesIndexRoute,
  loadCategoryRoute,
  loadContributorRoute,
  loadEffectCategoryRoute,
  loadEffectRoute,
  loadEffectsIndexRoute,
  loadMechanismQualifierRoute,
  loadPsychoactiveSummaryRoute,
  loadReportRoute,
  loadReportsIndexRoute,
  loadSubstanceRoute,
  loadTaxonomyRoute,
  loadTaxonomyStaticParams,
  REPORT_FALLBACK_METADATA,
  type TaxonomyRouteDescriptor,
} from "./routeLoaders";
import { effectsIndexEmptyState, reportsIndexEmptyState } from "./publicRouteOutcomes";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { SubjectiveEffectDetailRecord } from "../convex/publicData";
import type { PublicSubstanceRecord } from "../convex/publicData.shared";

vi.mock("server-only", () => ({}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

const publicData = vi.hoisted(() => ({
  getPublishedEffectIndexArticles: vi.fn(),
  getPublicCategoryLayout: vi.fn(),
  getPublicContributorByKey: vi.fn(),
  getPublicContributorDirectory: vi.fn(() => Promise.resolve([])),
  getPublicDataOverview: vi.fn(),
  getPublicEffectArticles: vi.fn(),
  getPublicEffectIndexArticleBySlug: vi.fn(),
  getPublicEffectBySlug: vi.fn(),
  getPublicEffects: vi.fn(),
  getPublicReplications: vi.fn(() => Promise.resolve([])),
  getPublicReportBySlug: vi.fn(),
  getPublicReports: vi.fn(),
  getPublicSubstanceBySlug: vi.fn(),
  getPublicSubstanceLookup: vi.fn(),
  getPublicSubstances: vi.fn(),
  getReportsByContributor: vi.fn(),
}));

const publicLibrary = vi.hoisted(() => ({
  getPublicCategoryDetail: vi.fn(),
  getPublicEffectDetail: vi.fn(),
  getPublicMechanismDetail: vi.fn(),
}));

const publicMolecules = vi.hoisted(() => ({
  getMoleculeUpdatedAt: vi.fn(),
  moleculeOverrideImageUrl: vi.fn(
    (slug: string, updatedAt: string) =>
      `/api/molecules/${slug}?v=${encodeURIComponent(updatedAt)}`,
  ),
}));

const staticParams = vi.hoisted(() => ({
  getStaticCategoryParams: vi.fn(),
  getStaticEffectCategoryParams: vi.fn(),
  getStaticMechanismParams: vi.fn(),
  getStaticMechanismQualifierParams: vi.fn(),
}));

vi.mock("@server/convex/publicData", () => publicData);
vi.mock("@server/convex/publicLibrary", () => publicLibrary);
vi.mock("@server/convex/publicData.molecules", () => publicMolecules);
vi.mock("./staticParams", () => staticParams);

function buildContributorProfile(overrides: Partial<NormalizedUserProfile> = {}): NormalizedUserProfile {
  return {
    key: "ADA",
    displayName: "Ada",
    aliases: [],
    avatarUrl: null,
    bio: "",
    links: [],
    hasCustomBio: false,
    ...overrides,
  };
}

describe("route loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicMolecules.getMoleculeUpdatedAt.mockResolvedValue(null);
  });

  it("returns substance ok results with stripped metadata and a canonical route", async () => {
    publicMolecules.getMoleculeUpdatedAt.mockResolvedValueOnce("2026-07-11T12:00:00.000Z");
    publicData.getPublicSubstanceBySlug.mockResolvedValueOnce({
      slug: "lsd",
      title: "LSD",
      summary: "A lysergamide [cite:paper-a][cite:paper-b].",
    } as PublicSubstanceRecord);

    const result = await loadSubstanceRoute("lsd");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.metadata).toEqual({
      title: "LSD dosage, effects, and safety",
      description: "A lysergamide.",
    });
    expect(result.canonicalRoute).toEqual({ family: "substance", params: { slug: "lsd" } });
    expect(result.pageProps.fromSubstanceSlug).toBe("lsd");
    expect(result.pageProps.article.summary).toBe("A lysergamide [cite:paper-a][cite:paper-b].");
    expect(result.pageProps.content?.moleculeAsset?.url).toBe(
      "/api/molecules/lsd?v=2026-07-11T12%3A00%3A00.000Z",
    );
  });

  it("returns substance not-found results", async () => {
    publicData.getPublicSubstanceBySlug.mockResolvedValueOnce(null);

    await expect(loadSubstanceRoute("missing")).resolves.toEqual({ kind: "not-found" });
  });

  it("redirects high-volume substance aliases before fetching article data", async () => {
    await expect(loadSubstanceRoute("psilocybin")).resolves.toEqual({
      kind: "redirect",
      target: "/psilocybin-mushrooms",
      metadata: {
        title: "Substance",
        description: `Redirecting to the canonical ${SITE_FLAVOR_CONFIG.name} substance page.`,
      },
      canonicalRoute: { family: "substance", params: { slug: "psilocybin" } },
    });
    expect(publicData.getPublicSubstanceBySlug).not.toHaveBeenCalled();
  });

  it("returns effect ok and not-found results", async () => {
    const effect: SubjectiveEffectDetailRecord = {
      slug: "visual-drifting",
      name: "Visual drifting",
      summary: "Objects appear to drift.",
      tags: ["visual"],
      featured: false,
      description_raw: "A description.",
      gallery_order: [],
    };
    publicData.getPublicEffectBySlug.mockResolvedValueOnce(effect);
    publicLibrary.getPublicEffectDetail.mockResolvedValueOnce(null);
    publicData.getPublicContributorDirectory.mockResolvedValueOnce([
      { key: "JOSIE", displayName: "Josie Kins", aliases: ["josie"] },
    ]);

    const result = await loadEffectRoute("visual-drifting");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.metadata).toEqual({
      title: "Visual drifting",
      description: "Objects appear to drift.",
    });
    expect(result.canonicalRoute).toEqual({
      family: "effect",
      params: { effectSlug: "visual-drifting" },
    });
    expect(result.pageProps.article.hero.name).toBe("Visual drifting");
    // Contributor credits render as plain text unless the page receives the
    // directory, so the loader must carry it through to the page props.
    expect(result.pageProps.contributorDirectory).toEqual([
      { key: "JOSIE", displayName: "Josie Kins", aliases: ["josie"] },
    ]);

    publicData.getPublicEffectBySlug.mockResolvedValueOnce(null);
    publicLibrary.getPublicEffectDetail.mockResolvedValueOnce(null);

    await expect(loadEffectRoute("missing")).resolves.toEqual({ kind: "not-found" });
  });

  it("assembles curated psychoactive sections with all-tag matching and exclusions", async () => {
    publicData.getPublicEffectArticles.mockResolvedValueOnce([
      {
        slug: "visual-acuity-enhancement",
        name: "Visual acuity enhancement",
        summary: "",
        description_raw: "",
        tags: ["psychedelic", "visual", "enhancement"],
      },
      {
        slug: "wrong-category",
        name: "Wrong category",
        summary: "",
        description_raw: "",
        tags: ["psychedelic", "visual"],
      },
      {
        slug: "geometry",
        name: "Geometry",
        summary: "",
        description_raw: "",
        tags: ["psychedelic", "visual", "geometric"],
      },
    ]);

    const result = await loadPsychoactiveSummaryRoute([
      "psychedelic",
      "visual",
    ]);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }

    expect(result.canonicalRoute).toEqual({
      family: "psychoactiveSummary",
      params: { summaryPath: ["psychedelic", "visual"] },
    });
    expect(result.metadata.title).toBe("Visual Psychedelic Effects");
    expect(
      result.pageProps.sections.map((section) => ({
        title: section.title,
        effects: section.effects.map((effect) => effect.slug),
      })),
    ).toEqual([
      {
        title: "Visual Amplifications",
        effects: ["visual-acuity-enhancement"],
      },
      { title: "Visual Distortions", effects: [] },
      { title: "Geometric Patterns", effects: ["geometry"] },
      { title: "Hallucinatory States", effects: [] },
    ]);
  });

  it("keeps the Effect Index name order for dissociative disconnective effects", async () => {
    publicData.getPublicEffectArticles.mockResolvedValueOnce([
      {
        slug: "visual-disconnection",
        name: "Visual disconnection",
        summary: "",
        description_raw: "",
        tags: ["dissociative", "sensory", "disconnective"],
      },
      {
        slug: "physical-disconnection",
        name: "Physical disconnection",
        summary: "",
        description_raw: "",
        tags: ["dissociative", "physical", "disconnective"],
      },
      {
        slug: "cognitive-disconnection",
        name: "Cognitive disconnection",
        summary: "",
        description_raw: "",
        tags: ["dissociative", "cognitive", "disconnective"],
      },
      {
        slug: "pain-relief",
        name: "Pain relief",
        summary: "",
        description_raw: "",
        tags: ["dissociative", "physical"],
      },
      {
        slug: "uncomfortable",
        name: "Uncomfortable",
        summary: "",
        description_raw: "",
        tags: ["dissociative", "physical", "uncomfortable"],
      },
    ]);

    const result = await loadPsychoactiveSummaryRoute(["dissociative"]);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }

    expect(
      result.pageProps.sections[0].effects.map((effect) => effect.slug),
    ).toEqual([
      "physical-disconnection",
      "cognitive-disconnection",
      "visual-disconnection",
    ]);
    expect(
      result.pageProps.sections
        .find((section) => section.title === "Physical Effects")
        ?.effects.map((effect) => effect.slug),
    ).toEqual(["physical-disconnection", "pain-relief"]);
  });

  it("rejects non-curated psychoactive summary paths before reading effects", async () => {
    await expect(
      loadPsychoactiveSummaryRoute(["psychedelic"]),
    ).resolves.toEqual({ kind: "not-found" });
    expect(publicData.getPublicEffectArticles).not.toHaveBeenCalled();
  });

  it("returns article detail and published-only index results", async () => {
    publicData.getPublicEffectIndexArticleBySlug.mockResolvedValueOnce({
      slug: "dxm",
      title: "DXM",
      publication_status: "unlisted",
      tags: ["intensity scale"],
      body_raw: "[p]DXM plateaus.[/p]",
      body_ast: {
        name: "p",
        properties: {},
        children: ["DXM plateaus."],
      },
    });

    await expect(loadArticleRoute("dxm")).resolves.toMatchObject({
      kind: "ok",
      canonicalRoute: { family: "article", params: { slug: "dxm" } },
      metadata: {
        title: "DXM",
        description: "DXM Effect Index article.",
        noIndex: true,
      },
      pageProps: {
        article: {
          slug: "dxm",
          publication_status: "unlisted",
        },
      },
    });

    publicData.getPublishedEffectIndexArticles.mockResolvedValueOnce([
      {
        slug: "lucid-dreaming",
        title: "Lucid dreaming",
        publication_status: "published",
        tags: ["dreams"],
        body_raw: "[p]Lucid dreaming.[/p]",
      },
    ]);

    await expect(loadArticlesIndexRoute()).resolves.toMatchObject({
      kind: "ok",
      canonicalRoute: { family: "articles" },
      metadata: { title: "Articles · 1 entries" },
      pageProps: {
        articles: [{ slug: "lucid-dreaming", title: "Lucid dreaming" }],
        emptyState: undefined,
      },
    });
  });

  it("returns effects index results with an empty state only when empty", async () => {
    publicData.getPublicDataOverview.mockResolvedValueOnce({ effectCount: 1 });
    publicData.getPublicEffects.mockResolvedValueOnce([
      { slug: "visuals", name: "Visuals", summary: "", featured: false, tags: ["sensory"] },
    ]);

    await expect(loadEffectsIndexRoute()).resolves.toMatchObject({
      kind: "ok",
      canonicalRoute: { family: "effects" },
      metadata: { title: "Effects · 1 records" },
      pageProps: {
        effects: [{ slug: "visuals", name: "Visuals", tags: ["sensory"] }],
        emptyState: undefined,
      },
    });

    publicData.getPublicDataOverview.mockResolvedValueOnce({ effectCount: 0 });
    publicData.getPublicEffects.mockResolvedValueOnce([]);

    await expect(loadEffectsIndexRoute()).resolves.toMatchObject({
      kind: "ok",
      pageProps: {
        effects: [],
        emptyState: effectsIndexEmptyState,
      },
    });
  });

  it("returns reports index results with an empty state only when empty", async () => {
    publicData.getPublicDataOverview.mockResolvedValueOnce({ reportCount: 1 });
    publicData.getPublicReports.mockResolvedValueOnce([
      {
        slug: "first-trip",
        title: "First trip",
        featured: false,
        substanceNames: ["LSD"],
        substances: [{ name: "LSD" }],
        author: "Anonymous",
        introduction: "",
        tripDate: "2026-01-01",
        authorAvatarUrl: null,
        authorProfileKey: "anonymous",
      },
    ]);

    await expect(loadReportsIndexRoute()).resolves.toMatchObject({
      kind: "ok",
      canonicalRoute: { family: "reports" },
      metadata: { title: "Reports · 1 entries" },
      pageProps: {
        reports: [{ slug: "first-trip", title: "First trip" }],
        emptyState: undefined,
      },
    });

    publicData.getPublicDataOverview.mockResolvedValueOnce({ reportCount: 0 });
    publicData.getPublicReports.mockResolvedValueOnce([]);

    await expect(loadReportsIndexRoute()).resolves.toMatchObject({
      kind: "ok",
      pageProps: {
        reports: [],
        emptyState: reportsIndexEmptyState,
      },
    });
  });

  it("strips citation tokens from report metadata descriptions", async () => {
    publicData.getPublicReportBySlug.mockResolvedValueOnce({
      slug: "first-trip",
      title: "First trip",
      introduction: "An intro [cite:paper-a] with tokens [cite:paper-b].",
    });
    publicData.getPublicSubstances.mockResolvedValueOnce([{ slug: "lsd", title: "LSD" }]);

    const result = await loadReportRoute("first-trip");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.metadata).toEqual({
      title: "First trip",
      description: "An intro with tokens.",
    });
    expect(result.metadata.description).not.toContain("[cite:");
    expect(result.canonicalRoute).toEqual({ family: "report", params: { slug: "first-trip" } });
    expect(result.pageProps.report.slug).toBe("first-trip");
    expect(result.substanceBySlug).toEqual({ lsd: { name: "LSD" } });
  });

  it("falls back to the shared report description when an introduction is missing", async () => {
    publicData.getPublicReportBySlug.mockResolvedValueOnce({
      slug: "no-intro",
      title: "No intro",
    });
    publicData.getPublicSubstances.mockResolvedValueOnce([]);

    const result = await loadReportRoute("no-intro");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.metadata.description).toBe(REPORT_FALLBACK_METADATA.description);
  });

  it("returns report not-found results", async () => {
    publicData.getPublicReportBySlug.mockResolvedValueOnce(null);
    publicData.getPublicSubstances.mockResolvedValueOnce([]);

    await expect(loadReportRoute("missing")).resolves.toEqual({ kind: "not-found" });
  });

  it("returns contributor ok results for the canonical key", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(buildContributorProfile());
    publicData.getReportsByContributor.mockResolvedValueOnce([]);

    const result = await loadContributorRoute("ada");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(publicData.getPublicContributorByKey).toHaveBeenCalledWith("ADA");
    expect(result.metadata).toEqual({
      title: "Ada",
      description: "Browse contributor profile ADA.",
    });
    expect(result.canonicalRoute).toEqual({ family: "contributor", params: { profileKey: "ADA" } });
    expect(result.pageProps.profile.key).toBe("ADA");
    expect(result.pageProps.bioContent).toBeNull();
    expect(result.pageProps.reportHrefPrefix).toBe("/reports/");
    expect(result.pageProps.tripReports).toEqual([]);
  });

  it("returns contributor redirect results for alias keys without loading reports", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(
      buildContributorProfile({ aliases: ["OLD-KEY"] }),
    );

    await expect(loadContributorRoute("old-key")).resolves.toMatchObject({
      kind: "redirect",
      target: "/contributors/ada",
      canonicalRoute: { family: "contributor", params: { profileKey: "ADA" } },
    });
    expect(publicData.getReportsByContributor).not.toHaveBeenCalled();
  });

  it("returns contributor not-found results with the normalized key", async () => {
    publicData.getPublicContributorByKey.mockResolvedValueOnce(null);

    await expect(loadContributorRoute("missing%20key")).resolves.toEqual({
      kind: "not-found",
      normalizedKey: "MISSING KEY",
    });
  });
});

describe("taxonomy route loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        description: `Browse ${detail.length} effects in the ${params.categorySlug} category.`,
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

  it("returns category ok results with the effects payload", async () => {
    publicLibrary.getPublicCategoryDetail.mockResolvedValueOnce({
      definition: { name: "Psychedelics" },
      total: 12,
    });
    publicData.getPublicEffectArticles.mockResolvedValueOnce([{ slug: "euphoria" }]);

    const result = await loadCategoryRoute("psychedelic");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.detail).toEqual({ definition: { name: "Psychedelics" }, total: 12 });
    expect(result.effects).toEqual([{ slug: "euphoria" }]);
    expect(result.metadata).toEqual({
      title: "Psychedelics",
      description: "Browse 12 substances grouped under Psychedelics.",
    });
    expect(result.canonicalRoute).toEqual({
      family: "category",
      params: { categoryKey: "psychedelic" },
    });
  });

  it("redirects known category aliases without loading effects", async () => {
    publicLibrary.getPublicCategoryDetail.mockResolvedValueOnce(null);

    await expect(loadCategoryRoute("psychedelics")).resolves.toEqual({
      kind: "redirect",
      target: "/category/psychedelic",
      metadata: { title: "Category", description: "Browse substances by category." },
      canonicalRoute: { family: "category", params: { categoryKey: "psychedelics" } },
    });
    expect(publicData.getPublicEffectArticles).not.toHaveBeenCalled();
  });

  it("returns category not-found results with fallback metadata and no effects fetch", async () => {
    publicLibrary.getPublicCategoryDetail.mockResolvedValueOnce(null);

    await expect(loadCategoryRoute("missing")).resolves.toEqual({
      kind: "not-found",
      metadata: { title: "Category", description: "Browse substances by category." },
      canonicalRoute: { family: "category", params: { categoryKey: "missing" } },
    });
    expect(publicData.getPublicEffectArticles).not.toHaveBeenCalled();
  });

  it("keeps canonical effect category routes valid when no effects are mapped yet", async () => {
    publicData.getPublicEffects.mockResolvedValueOnce([]);

    await expect(loadEffectCategoryRoute("visual-effects")).resolves.toEqual({
      kind: "ok",
      detail: [],
      metadata: {
        title: "Effect category · visual-effects",
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
        title: "Effect category · visual-amplifications",
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
        title: "Serotonin · Agonist",
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

  it("includes canonical and alias params in category static params", async () => {
    staticParams.getStaticCategoryParams.mockResolvedValueOnce([{ categoryKey: "psychedelic" }]);

    const params = await loadTaxonomyStaticParams(categoryRouteDescriptor);

    expect(params[0]).toEqual({ categoryKey: "psychedelic" });
    expect(params).toContainEqual({ categoryKey: "psychedelics" });
  });

  it("defaults static params to an empty list when the descriptor omits them", async () => {
    await expect(loadTaxonomyStaticParams(createGenericDescriptor(null))).resolves.toEqual([]);
  });
});
