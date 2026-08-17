import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRouteLoaderMocks } from "./routeLoaders.testHarness";
import {
  loadEffectRoute,
  loadEffectsIndexRoute,
  loadPsychoactiveSummaryRoute,
  loadSubstanceRoute,
} from "./routeLoaders.substances";
import { loadArticleRoute, loadArticlesIndexRoute } from "./routeLoaders.publications";
import {
  loadReportRoute,
  loadReportsIndexRoute,
  REPORT_FALLBACK_METADATA,
} from "./routeLoaders.reports";
import { effectsIndexEmptyState, reportsIndexEmptyState } from "./publicRouteOutcomes";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { SubjectiveEffectDetailRecord } from "../convex/publicData";
import type { PublicSubstanceRecord } from "../convex/publicData.shared";

const { publicData, publicLibrary, publicMolecules, reagentData } = getRouteLoaderMocks();

describe("substance, effect, publication, and report route loaders", () => {
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
    publicData.getPublicSubstances.mockResolvedValueOnce([
      { slug: "lsd", title: "LSD" },
      { slug: "mdma", title: "MDMA" },
    ]);
    publicData.getPublicCategoryLayout.mockResolvedValueOnce({
      categories: [{ key: "psychedelic" }],
    } as never);

    const result = await loadSubstanceRoute("lsd");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.metadata).toEqual({
      title: "LSD: Dosage, Effects & Safety | dose.wiki",
      description: "A lysergamide.",
    });
    expect(result.canonicalRoute).toEqual({ family: "substance", params: { slug: "lsd" } });
    expect(result.pageProps.fromSubstanceSlug).toBe("lsd");
    expect(result.pageProps.article.summary).toBe("A lysergamide [cite:paper-a][cite:paper-b].");
    expect(result.pageProps.linkableSubstanceSlugs).toEqual(["lsd", "mdma"]);
    expect(result.pageProps.linkableCategoryKeys).toEqual(["psychedelic"]);
    expect(result.pageProps.content?.moleculeAsset?.url).toBe(
      "/api/molecules/lsd?v=2026-07-11T12%3A00%3A00.000Z",
    );
    expect(reagentData.getCachedReagentDataForArticle).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "lsd" }),
      "lsd",
    );
    expect(result.pageProps.externalReagentData).toBeNull();
    expect(result.pageProps.hasRelatedTripReports).toBe(false);
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
    publicData.getPublicSubstances.mockResolvedValueOnce([
      { slug: "lsd", title: "LSD" } as never,
    ]);
    publicData.getPublicEffects.mockResolvedValueOnce([
      { slug: "visual-drifting", name: "Visual drifting" } as never,
    ]);

    const result = await loadEffectRoute("visual-drifting");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.metadata).toEqual({
      title: "Visual drifting: Subjective Effect | dose.wiki",
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
    expect(result.pageProps.linkableSubstanceSlugs).toEqual(["lsd"]);
    expect(result.pageProps.linkableEffectSlugs).toEqual(["visual-drifting"]);

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

  it("resolves article bylines from authorProfileKeys and drops keys no profile claims", async () => {
    publicData.getPublicContributorProfiles.mockResolvedValueOnce([
      { key: "JOSIE", displayName: "Josie Kins", aliases: ["josikinz"] },
    ] as unknown as NormalizedUserProfile[]);
    publicData.getPublicEffectIndexArticleBySlug.mockResolvedValueOnce({
      slug: "dmt",
      title: "DMT",
      publication_status: "published",
      tags: [],
      body_raw: "[p]DMT.[/p]",
      // The legacy ObjectId stays unrendered; the backfilled key is what prints.
      authors: ["60542430198361300fea3610"],
      authorProfileKeys: ["josie", "NOBODY"],
    });

    const result = await loadArticleRoute("dmt");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }

    expect(result.pageProps.bylineAuthors).toEqual([
      { key: "JOSIE", name: "Josie Kins", href: "/contributors/josie" },
    ]);
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
        bylineAuthors: [],
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
});
