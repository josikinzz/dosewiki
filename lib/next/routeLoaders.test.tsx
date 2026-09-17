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
import type { SubjectiveEffectDetailRecord } from "../data/publicData";
import type { PublicEffectArticle } from "../data/publicData";
import type { PublicSubstanceRecord } from "../data/publicData.shared";
import type * as PublicDataCache from "@server/data/publicData.cache";

const reportSourceRevision = vi.hoisted(() => vi.fn<() => Promise<string>>());
vi.mock("@server/data/publicData.cache", async (importOriginal) => {
  const actual = await importOriginal<typeof PublicDataCache>();
  return {
    ...actual,
    publicDataCache: ((callback, keys, options) => keys[0] === "public-report-index-revision-v1"
      ? reportSourceRevision
      : actual.publicDataCache(callback, keys, options)) as typeof actual.publicDataCache,
  };
});

const localizedRecords = vi.hoisted(() => ({
  getLocalizedPublicEffectBySlug: vi.fn(),
}));
vi.mock("@server/translation/localizedRecords", () => localizedRecords);

const translations = vi.hoisted(() => ({
  localizeRecords: vi.fn(async (records: unknown[], _locale: string, _kind: string) => ({ records })),
}));
vi.mock("@server/translation/liveTranslation", () => translations);

const { publicData, publicLibrary, publicMolecules, reagentData, warningBanners } =
  getRouteLoaderMocks();

function mockSummaryEffects(effects: Omit<PublicEffectArticle, "featured">[]) {
  const records = effects.map((effect) => ({ ...effect, featured: false }));
  publicData.getPublicEffects.mockResolvedValueOnce(records);
  publicData.getPublicEffectSummariesBySlugs.mockImplementationOnce(async (slugs) =>
    records.filter((effect) => slugs.includes(effect.slug)),
  );
}

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
    // The slug read, not the preview corpus: the article only needs to know
    // which wiki links resolve.
    publicData.getPublicSubstanceSlugs.mockResolvedValueOnce(["lsd", "mdma"]);
    publicData.getPublicCategoryLayout.mockResolvedValueOnce({
      categories: [{ key: "psychedelic" }],
    } as never);

    const result = await loadSubstanceRoute("lsd");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.metadata).toEqual({
      title: "LSD",
      description: "A lysergamide.",
    });
    expect(result.canonicalRoute).toEqual({ family: "substance", params: { slug: "lsd" } });
    expect(result.pageProps.fromSubstanceSlug).toBe("lsd");
    expect(result.pageProps.article.summary).toBe("A lysergamide [cite:paper-a][cite:paper-b].");
    expect(result.pageProps.content?.moleculeAsset?.url).toBe(
      "/api/molecules/lsd?v=2026-07-11T12%3A00%3A00.000Z",
    );
    expect(reagentData.getCachedReagentDataForArticle).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "lsd" }),
      "lsd",
    );
    expect(result.pageProps.externalReagentData).toBeNull();
  });

  it("returns article text while secondary report and contributor reads are pending", async () => {
    let releaseReports!: (rows: never[]) => void;
    let releaseDirectory!: (rows: never[]) => void;
    let releaseProfile!: (profile: null) => void;
    const reports = new Promise<never[]>((resolve) => { releaseReports = resolve; });
    const directory = new Promise<never[]>((resolve) => { releaseDirectory = resolve; });
    const profile = new Promise<null>((resolve) => { releaseProfile = resolve; });
    publicData.getPublicSubstanceBySlug.mockResolvedValueOnce({
      slug: "lsd",
      title: "LSD",
      summary: "Readable before related content.",
    } as PublicSubstanceRecord);
    publicData.getPublicReportsBySubstanceNames.mockReturnValueOnce(reports);
    publicData.getPublicContributorDirectory.mockReturnValueOnce(directory);
    publicData.getPublicContributorByKey.mockReturnValueOnce(profile).mockReturnValueOnce(profile);

    try {
      const result = await loadSubstanceRoute("lsd");
      if (result.kind !== "ok") throw new Error("expected readable article");
      expect(result.pageProps.article.summary).toBe("Readable before related content.");
    } finally {
      releaseReports([]);
      releaseDirectory([]);
      releaseProfile(null);
    }
  });

  it("returns substance not-found results", async () => {
    publicData.getPublicSubstanceBySlug.mockResolvedValueOnce(null);

    await expect(loadSubstanceRoute("missing")).resolves.toEqual({ kind: "not-found" });
  });

  it("swaps the citation-overhaul banner for the beta disclaimer once a marker was refuted", async () => {
    const presets = [
      {
        key: "citation-system-overhaul-1",
        tone: "caution",
        enabled: true,
        allSubstances: false,
        enabledSlugs: ["lsd"],
      },
      {
        key: "opioids",
        tone: "danger",
        enabled: true,
        allSubstances: false,
        enabledSlugs: ["lsd"],
      },
    ] as never[];
    warningBanners.getWarningBannerPresets.mockResolvedValueOnce(presets as never);
    warningBanners.getWarningBannerPresets.mockResolvedValueOnce(presets as never);
    publicData.getPublicSubstanceBySlug.mockResolvedValueOnce({
      slug: "lsd",
      title: "LSD",
      summary: "An audited claim [citation-needed]. A kept claim [cite:paper-a].",
    } as PublicSubstanceRecord);

    const audited = await loadSubstanceRoute("lsd");
    if (audited.kind !== "ok") throw new Error("expected ok result");
    expect(audited.pageProps.showBetaDisclaimer).toBe(true);
    expect(audited.pageProps.warningBanners.map((preset) => preset.key)).toEqual(["opioids"]);

    publicData.getPublicSubstanceBySlug.mockResolvedValueOnce({
      slug: "lsd",
      title: "LSD",
      summary: "An unaudited claim [cite:paper-a].",
    } as PublicSubstanceRecord);

    const unaudited = await loadSubstanceRoute("lsd");
    if (unaudited.kind !== "ok") throw new Error("expected ok result");
    expect(unaudited.pageProps.showBetaDisclaimer).toBe(false);
    expect(unaudited.pageProps.warningBanners.map((preset) => preset.key)).toEqual([
      "opioids",
      "citation-system-overhaul-1",
    ]);
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

  it("returns effect prose without waiting for membership or credit enrichment", async () => {
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
    const blocked = new Promise<never>(() => {});
    publicLibrary.getPublicEffectDetail.mockReturnValue(blocked);
    publicData.getPublicContributorDirectory.mockReturnValue(blocked);
    publicData.getPublicArtistCreditRows.mockReturnValue(blocked);
    try {
    publicData.getPublicSubstanceSlugs.mockResolvedValueOnce(["lsd"]);
    publicData.getPublicEffectSlugs.mockResolvedValueOnce(["visual-drifting"]);

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
    expect(publicLibrary.getPublicEffectDetail).not.toHaveBeenCalled();
    expect(publicData.getPublicContributorDirectory).not.toHaveBeenCalled();
    expect(publicData.getPublicArtistCreditRows).not.toHaveBeenCalled();
    expect(result.pageProps.linkableSubstanceSlugs).toEqual(["lsd"]);
    expect(result.pageProps.linkableEffectSlugs).toEqual(["visual-drifting"]);
    expect(publicData.getPublicSubstances).not.toHaveBeenCalled();

    publicData.getPublicEffectBySlug.mockResolvedValueOnce(null);

    await expect(loadEffectRoute("missing")).resolves.toEqual({ kind: "not-found" });
    } finally {
      publicLibrary.getPublicEffectDetail.mockReset();
      publicData.getPublicContributorDirectory.mockReset();
      publicData.getPublicArtistCreditRows.mockReset();
    }
  });

  it("assembles curated psychoactive sections with all-tag matching and exclusions", async () => {
    mockSummaryEffects([
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
    mockSummaryEffects([
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

  it("selects psychoactive summary effects by their English names and renders the localized records on a mirror", async () => {
    const english = [
      {
        slug: "cognitive-disconnection",
        name: "Cognitive disconnection",
        summary: "",
        description_raw: "",
        tags: ["dissociative", "cognitive", "disconnective"],
      },
      {
        slug: "physical-disconnection",
        name: "Physical disconnection",
        summary: "",
        description_raw: "",
        tags: ["dissociative", "physical", "disconnective"],
      },
    ];
    mockSummaryEffects(english);
    translations.localizeRecords.mockResolvedValueOnce({ records: [
      { ...english[0], name: "认知脱离" },
      { ...english[1], name: "身体脱离" },
    ] });

    const result = await loadPsychoactiveSummaryRoute(["dissociative"], {
      code: "zh-Hans",
      pathPrefix: "/zh",
      htmlLang: "zh-Hans",
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(
      result.pageProps.sections[0].effects.map((effect) => [effect.slug, effect.name]),
    ).toEqual([
      ["physical-disconnection", "身体脱离"],
      ["cognitive-disconnection", "认知脱离"],
    ]);
  });

  it("rejects non-curated psychoactive summary paths before reading effects", async () => {
    await expect(
      loadPsychoactiveSummaryRoute(["psychedelic"]),
    ).resolves.toEqual({ kind: "not-found" });
    expect(publicData.getPublicEffects).not.toHaveBeenCalled();
  });

  it("resolves article bylines from authorProfileKeys and drops keys no profile claims", async () => {
    publicData.getPublicContributorIdentities.mockResolvedValueOnce([
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

    publicData.getPublishedPublicationIndex.mockResolvedValueOnce([
      {
        slug: "lucid-dreaming",
        title: "Lucid dreaming",
        publication_status: "published",
        tags: ["dreams"],
        indexDescription: "Lucid dreaming.",
        readMinutes: 1,
        excerpt: "Lucid dreaming.",
      },
    ]);

    await expect(loadArticlesIndexRoute()).resolves.toMatchObject({
      kind: "ok",
      canonicalRoute: { family: "articles" },
      metadata: { title: "Articles" },
      pageProps: {
        articles: [{ slug: "lucid-dreaming", title: "Lucid dreaming" }],
        emptyState: undefined,
      },
    });
  });

  it("returns effects index results with an empty state only when empty", async () => {
    publicData.getPublicEffectIndex.mockResolvedValueOnce([
      { slug: "visuals", name: "Visuals", featured: false, tags: ["sensory"] },
    ]);

    await expect(loadEffectsIndexRoute()).resolves.toMatchObject({
      kind: "ok",
      canonicalRoute: { family: "effects" },
      metadata: { title: "Subjective Effect Index" },
      pageProps: {
        effects: [{ slug: "visuals", name: "Visuals", tags: ["sensory"] }],
        emptyState: undefined,
      },
    });

    publicData.getPublicEffectIndex.mockResolvedValueOnce([]);

    await expect(loadEffectsIndexRoute()).resolves.toMatchObject({
      kind: "ok",
      pageProps: {
        effects: [],
        emptyState: effectsIndexEmptyState,
      },
    });
  });

  it("returns reports index results with an empty state only when empty", async () => {
    reportSourceRevision.mockResolvedValueOnce("reports-published").mockResolvedValueOnce("reports-removed");
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
      metadata: { title: "Experience Reports Index" },
      pageProps: {
        reports: [{ slug: "first-trip", title: "First trip" }],
        emptyState: undefined,
      },
    });

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
    publicData.getPublicSubstanceLookup.mockResolvedValueOnce([{ slug: "lsd", name: "LSD", priority: "high" }]);

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
    publicData.getPublicSubstanceLookup.mockResolvedValueOnce([]);

    const result = await loadReportRoute("no-intro");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("expected ok result");
    }
    expect(result.metadata.description).toBe(REPORT_FALLBACK_METADATA.description);
  });

  it("returns report not-found results", async () => {
    publicData.getPublicReportBySlug.mockResolvedValueOnce(null);
    publicData.getPublicSubstanceLookup.mockResolvedValueOnce([]);

    await expect(loadReportRoute("missing")).resolves.toEqual({ kind: "not-found" });
  });
});
