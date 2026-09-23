import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRouteLoaderMocks } from "./routeLoaders.testHarness";
import { loadPsychoactiveSummaryRoute } from "./routeLoaders.substances";
import type { PublicEffectArticle } from "../data/publicData";

const localizedRecords = vi.hoisted(() => ({
  getLocalizedPublicEffectBySlug: vi.fn(),
}));
vi.mock("@server/translation/localizedRecords", () => localizedRecords);

const translations = vi.hoisted(() => ({
  localizeRecords: vi.fn(async (records: unknown[], _locale: string, _kind: string) => ({ records })),
}));
vi.mock("@server/translation/liveTranslation", () => translations);

const { publicData, publicMolecules } = getRouteLoaderMocks();

function mockSummaryEffects(effects: Omit<PublicEffectArticle, "featured">[]) {
  const records = effects.map((effect) => ({ ...effect, featured: false }));
  publicData.getPublicEffects.mockResolvedValueOnce(records);
  publicData.getPublicEffectSummariesBySlugs.mockImplementationOnce(async (slugs) =>
    records.filter((effect) => slugs.includes(effect.slug)),
  );
}

describe("psychoactive summary route loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicMolecules.getMoleculeUpdatedAt.mockResolvedValue(null);
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
});
