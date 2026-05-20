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
      introduction: "A report",
      tripDate: "2026-01-01",
      authorAvatarUrl: "https://example.com/avatar.png",
      authorProfileKey: "ada",
    };

    expect(buildReportsIndexViewModel({ reportCount: 1, reports: [report] })).toEqual({
      metadata: {
        title: "Reports · 1 entries",
        description: "Browse 1 trip reports in dose.wiki.",
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
        description: "Browse 1 subjective effect entries in dose.wiki.",
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

  it("adapts substance articles and strips the route slug from article props", () => {
    const tripReportsSection = <section data-testid="trip-reports" />;
    const substance: PublicSubstanceRecord = {
      slug: "lsd",
      title: "LSD",
      summary: "A lysergamide.",
      identification: {
        common_name: "LSD",
        alternative_names: [],
      },
    } as PublicSubstanceRecord;

    const viewModel = buildSubstanceArticleViewModel({
      slug: "lsd",
      substance,
      tripReportsSection,
    });

    expect(viewModel.metadata).toEqual({
      title: "LSD",
      description: "A lysergamide.",
    });
    expect(viewModel.pageProps.fromSubstanceSlug).toBe("lsd");
    expect(viewModel.pageProps.tripReportsSection).toBe(tripReportsSection);
    expect("slug" in viewModel.pageProps.article).toBe(false);
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
});
