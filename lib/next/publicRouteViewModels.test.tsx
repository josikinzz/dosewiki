import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { describe, expect, it, vi } from "vitest";
import {
  buildEffectArticleViewModel,
  buildEffectsIndexViewModel,
  buildReportsIndexViewModel,
  buildSubstanceArticleViewModel,
  toEffectsIndexSummary,
} from "./publicRouteViewModels";
import type {
  PublicEffectPreview,
  PublicReportPreview,
  SubjectiveEffectDetailRecord,
} from "../convex/publicData";
import type { PublicSubstanceRecord } from "../convex/publicData.shared";

vi.mock("server-only", () => ({}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

describe("public route view models", () => {
  it("adapts reports index records into route-ready page props and metadata", () => {
    const report: PublicReportPreview = {
      slug: "first-trip",
      title: "First Trip",
      featured: true,
      author: "Ada",
      substanceNames: ["LSD"],
      substances: [{ name: "LSD" }],
      introduction: "A report",
      tripDate: "2026-01-01",
      authorAvatarUrl: "https://example.com/avatar.png",
      authorProfileKey: "ada",
    };

    expect(buildReportsIndexViewModel({ reportCount: 1, reports: [report] })).toEqual({
      metadata: {
        title: "Reports · 1 entries",
        description: `Browse 1 trip reports in ${SITE_FLAVOR_CONFIG.name}.`,
      },
      pageProps: {
        reportHrefPrefix: "/reports/",
        reports: [
          {
            slug: "first-trip",
            title: "First Trip",
            featured: true,
            subject: {
              name: "Ada",
              trip_date: "2026-01-01",
              avatar_url: "https://example.com/avatar.png",
              profile_key: "ada",
            },
            substances: [{ name: "LSD" }],
          },
        ],
      },
    });
  });

  it("adapts effects index records behind a stable href and summary shape", () => {
    const effect: PublicEffectPreview = {
      slug: "visual-drifting",
      name: "Visual drifting",
      summary: "Objects appear to drift.",
      featured: false,
      tags: ["visual"],
    };

    expect(buildEffectsIndexViewModel({ effectCount: 1, effects: [effect] })).toEqual({
      metadata: {
        title: "Effects · 1 records",
        description: `Browse 1 subjective effect entries in ${SITE_FLAVOR_CONFIG.name}.`,
      },
      pageProps: {
        effectHrefPrefix: "/effects/",
        effects: [{ slug: "visual-drifting", name: "Visual drifting", tags: ["visual"] }],
      },
    });
  });

  it("defaults missing effect tags to an empty array", () => {
    expect(toEffectsIndexSummary({ slug: "x", name: "Effect", summary: "", featured: false } as PublicEffectPreview)).toEqual({
      slug: "x",
      name: "Effect",
      tags: [],
    });
  });

  it("adapts substance articles, strips citation tokens from metadata, and strips the route slug from article props", () => {
    const tripReportsSection = <section data-testid="trip-reports" />;
    const substance: PublicSubstanceRecord = {
      slug: "lsd",
      title: "LSD",
      summary: "A lysergamide [cite:paper-a][cite:paper-b].",
      identification: {
        common_name: "LSD",
        alternative_names: [],
      },
    } as PublicSubstanceRecord;

    const viewModel = buildSubstanceArticleViewModel({
      slug: "lsd",
      substance,
      tripReportsSection,
      hasRelatedTripReports: true,
    });

    expect(viewModel.metadata).toEqual({
      title: "LSD - dose.wiki",
      description: "A lysergamide.",
    });
    expect(viewModel.pageProps.fromSubstanceSlug).toBe("lsd");
    expect(viewModel.pageProps.article.summary).toBe("A lysergamide [cite:paper-a][cite:paper-b].");
    expect(viewModel.pageProps.tripReportsSection).toBe(tripReportsSection);
    expect("slug" in viewModel.pageProps.article).toBe(false);
  });

  it("uses an answer-ready substance metadata fallback when the summary is empty", () => {
    const substance: PublicSubstanceRecord = {
      slug: "dmt",
      title: "DMT",
      summary: "",
      identification: {
        common_name: "DMT",
        alternative_names: [],
      },
      classification: {
        psychoactive_class: ["Psychedelic"],
        chemical_class: ["Tryptamine"],
      },
    } as PublicSubstanceRecord;

    const viewModel = buildSubstanceArticleViewModel({
      slug: "dmt",
      substance,
      tripReportsSection: <section />,
      hasRelatedTripReports: false,
    });

    expect(viewModel.metadata).toEqual({
      title: "DMT - dose.wiki",
      description:
        "DMT substance profile in the Psychedelic, Tryptamine class covering dosage, duration, effects, interactions, tolerance, harm potential, legality, and references.",
    });
  });

  it("creates a primary molecule asset from Convex without a legacy static mapping", () => {
    const substance = {
      slug: "fixtureamine",
      id: 999_999,
      title: "Fixtureamine",
      summary: "A test molecule.",
      identification: {
        common_name: "Fixtureamine",
        alternative_names: [],
        smiles: "CCN",
      },
    } as PublicSubstanceRecord;

    const viewModel = buildSubstanceArticleViewModel({
      slug: "fixtureamine",
      substance,
      tripReportsSection: <section />,
      hasRelatedTripReports: false,
      moleculeOverrideUrl: "/api/molecules/fixtureamine?v=seeded",
    });

    expect(viewModel.pageProps.content?.moleculeAsset).toMatchObject({
      filename: "fixtureamine.svg",
      url: "/api/molecules/fixtureamine?v=seeded",
      matchedField: "convex-molecule",
      resolution: "convex-canonical",
    });
    expect(viewModel.pageProps.content?.moleculeAssets).toHaveLength(1);
  });

  it("adapts effect articles, href policy, related detail, and server replication policy", () => {
    const effect: SubjectiveEffectDetailRecord = {
      slug: "visual-drifting",
      name: "Visual drifting",
      summary: "Objects appear to drift.",
      tags: ["visual"],
      featured: false,
      description_raw: "A description.",
      gallery_order: ["replication-a"],
    };

    const viewModel = buildEffectArticleViewModel({
      effectSlug: "visual-drifting",
      effect,
      detail: {
        definition: { key: "visual-drifting", label: "Visual drifting", total: 1 },
        groups: [{ label: "LSD", entries: [{ name: "LSD", slug: "lsd" }] }],
      } as never,
    });

    expect(viewModel.metadata).toEqual({
      title: "Visual drifting",
      description: "Objects appear to drift.",
    });
    expect(viewModel.pageProps.drugHrefPrefix).toBe("/");
    expect(viewModel.pageProps.categoryHrefPrefix).toBe("/category/");
    expect(viewModel.pageProps.replicationsSection).toBeDefined();
    expect(viewModel.pageProps.article.hero).toEqual({
      name: "Visual drifting",
      icon: "lucide:eye",
    });
    expect(viewModel.pageProps.article.sections.map((section) => section.kind)).toEqual([
      "overview",
      "replications",
      "relatedSubstances",
    ]);
  });

  it("uses an answer-ready effect metadata fallback when sparse effect prose is empty", () => {
    const viewModel = buildEffectArticleViewModel({
      effectSlug: "serotonin-syndrome",
      effect: {
        slug: "serotonin-syndrome",
        name: "Serotonin syndrome",
        summary: "",
        tags: ["safety"],
        featured: false,
        description_raw: "",
      },
      replicationsSection: <section />,
    });

    expect(viewModel.metadata).toEqual({
      title: "Serotonin syndrome",
      description:
        "Serotonin syndrome subjective effect profile covering description, analysis, replications, related substances, and citations.",
    });
  });
});
