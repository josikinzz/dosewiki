import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";
import {
  buildArticleYamlDraft,
  findExistingArticleForSubstance,
  findExistingArticleIndex,
  upsertGeneratedArticle,
} from "./substanceEditorDraftUtils";
import { parseGeneratedYaml } from "./yamlParser";
import type { SubstanceInfo } from "./types";

function createArticle(overrides: Record<string, unknown> = {}): SubstanceArticle {
  return {
    ...createEmptyArticle(),
    editorial_review: {
      status: "needed",
    },
    ...overrides,
  } as SubstanceArticle;
}

describe("substanceEditorDraftUtils", () => {
  it("finds existing articles by selected substance title before common name", () => {
    const articles = [
      createArticle({ id: 7, title: "LSD", identification: { common_name: "Acid" } }),
    ];
    const substances: SubstanceInfo[] = [
      {
        slug: "lsd",
        name: "LSD",
        reviewStatus: "needed",
      },
    ];

    expect(findExistingArticleForSubstance(articles, substances, "lsd")?.id).toBe(7);
  });

  it("finds an existing article when the source display name uses separators", () => {
    const articles = [
      createArticle({
        id: 541,
        slug: "psilocybin-mushrooms",
        title: "Psilocybin Mushrooms",
      }),
    ];
    const substances: SubstanceInfo[] = [
      {
        slug: "psilocybin-mushrooms",
        name: "Psilocybin_mushrooms",
        reviewStatus: "needed",
      },
    ];

    expect(
      findExistingArticleForSubstance(
        articles,
        substances,
        "psilocybin-mushrooms",
      )?.id,
    ).toBe(541);
  });

  it("matches existing article index by id before falling back to text fields", () => {
    const articles = [
      createArticle({ id: 10, title: "Ketamine" }),
      createArticle({ id: 12, title: "LSD" }),
    ];

    const draft = createArticle({ id: 12, title: "Something Else" });

    expect(findExistingArticleIndex(articles, draft)).toBe(1);
  });

  it("falls back to title and common name matching when no id matches", () => {
    const articles = [
      createArticle({ id: 2, title: "Ketamine" }),
      createArticle({ id: 3, title: "Lysergic acid diethylamide", identification: { common_name: "LSD" } }),
    ];

    expect(
      findExistingArticleIndex(articles, createArticle({ title: "Ketamine" })),
    ).toBe(0);
    expect(
      findExistingArticleIndex(articles, createArticle({ identification: { common_name: "LSD" } })),
    ).toBe(1);
  });

  it("updates matching articles while preserving the existing id", () => {
    const articles = [
      createArticle({ id: 4, title: "LSD", identification: { common_name: "Acid" } }),
    ];

    const result = upsertGeneratedArticle(
      articles,
      createArticle({ id: 99, title: "LSD", identification: { common_name: "Acid" } }),
    );

    expect(result.action).toBe("updated");
    expect(result.assignedId).toBe(4);
    expect(result.nextArticles).toHaveLength(1);
    expect(result.nextArticles[0]?.id).toBe(4);
  });

  it("creates a new article with the next available id when no match exists", () => {
    const articles = [
      createArticle({ id: 4, title: "LSD" }),
      createArticle({ id: 7, title: "Ketamine" }),
    ];

    const result = upsertGeneratedArticle(
      articles,
      createArticle({ title: "Mescaline", identification: { common_name: "Mescaline" } }),
    );

    expect(result.action).toBe("created");
    expect(result.assignedId).toBe(8);
    expect(result.nextArticles).toHaveLength(3);
    expect(result.nextArticles[2]?.id).toBe(8);
  });

  it("round-trips references and route reference_ids through the YAML draft builder", () => {
    const article = createArticle({
      title: "LSD",
      references: [
        {
          id: "ref-1",
          type: "webpage",
          title: "Reference One",
          authors: [],
          url: "https://example.test/ref-1",
          sourceType: "unknown",
          quality: "fallback",
        },
      ],
      dosage: {
        routes: [
          {
            route: "Oral",
            bioavailability: "75%",
            bioavailability_notes: "",
            dose_ranges: {
              threshold: { min: null, max: null, unit: "mg" },
              light: { min: 5, max: 10, unit: "mg" },
              moderate: { min: 10, max: 20, unit: "mg" },
              strong: { min: 20, max: 30, unit: "mg" },
              heavy: { min: 30, max: null, unit: "mg" },
            },
            notes: "",
            reference_ids: ["ref-1"],
          },
        ],
        plateau_dosing: null,
      },
      duration: {
        routes: [
          {
            route: "Oral",
            half_life: "4 hours",
            half_life_notes: "",
            stages: {
              onset: { min: 15, max: 30, unit: "minutes" },
              come_up: { min: 30, max: 60, unit: "minutes" },
              peak: { min: 2, max: 4, unit: "hours" },
              offset: { min: 1, max: 2, unit: "hours" },
              after_effects: { min: 2, max: 4, unit: "hours" },
              total_duration: { min: 4, max: 8, unit: "hours" },
            },
            reference_ids: ["ref-1"],
          },
        ],
      },
    });

    const parseResult = parseGeneratedYaml(buildArticleYamlDraft(article));

    expect(parseResult.success).toBe(true);
    expect(parseResult.data?.references).toEqual([
      {
        ...article.references[0],
        access: "unknown",
        supportStatus: "unknown",
      },
    ]);
    expect(parseResult.data?.dosage.routes[0]?.reference_ids).toEqual(["ref-1"]);
    expect(parseResult.data?.duration.routes[0]?.reference_ids).toEqual(["ref-1"]);
  });
});
