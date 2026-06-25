import { describe, expect, it } from "vitest";

const buildValidArticle = () => ({
  id: 1,
  title: "Test Substance",
  index_categories: [],
  identification: {},
  classification: {},
  summary: "",
  dosage: {},
  duration: {},
  subjective_effects: {},
  comparisons: [],
  pharmacology: {},
  interactions: {},
  reagent_testing: {},
  tolerance: {},
  harm_potential: {},
  legality: {},
  references: [],
  citations: [],
});

describe("GitHub save validation helpers", () => {
  it("computes payload byte length for strings and objects", async () => {
    const { getPayloadByteLength } = await import("./validation.mjs");

    expect(getPayloadByteLength(null)).toBe(0);
    expect(getPayloadByteLength("hello")).toBe(5);
    expect(getPayloadByteLength({ value: "hello" })).toBe(
      Buffer.byteLength(JSON.stringify({ value: "hello" }), "utf8")
    );
  });

  it("accepts valid articles payload", async () => {
    const { validateArticlesPayload } = await import("./validation.mjs");
    const result = validateArticlesPayload([buildValidArticle()]);

    expect(result.success).toBe(true);
  });

  it("rejects invalid articles payload", async () => {
    const { validateArticlesPayload } = await import("./validation.mjs");
    const invalid = { ...buildValidArticle(), title: 123 };
    const result = validateArticlesPayload([invalid]);

    expect(result.success).toBe(false);
  });

  it("accepts structured references and route reference ids in backup payloads", async () => {
    const { validateArticlesPayload } = await import("./validation.mjs");
    const valid = {
      ...buildValidArticle(),
      references: [
        {
          id: "pmid-12345",
          title: "Primary paper",
          type: "journal_article",
          sourceType: "primary_literature",
          quality: "high",
        },
      ],
      dosage: {
        routes: [
          {
            route: "Oral",
            reference_ids: ["pmid-12345"],
          },
        ],
      },
      duration: {
        routes: [
          {
            route: "Oral",
            reference_ids: ["pmid-12345"],
          },
        ],
      },
    };

    expect(validateArticlesPayload([valid]).success).toBe(true);
  });

  it("rejects route reference ids that do not resolve to article references", async () => {
    const { validateArticlesPayload } = await import("./validation.mjs");
    const invalid = {
      ...buildValidArticle(),
      dosage: {
        routes: [
          {
            route: "Oral",
            reference_ids: ["missing-reference"],
          },
        ],
      },
    };

    const result = validateArticlesPayload([invalid]);

    expect(result.success).toBe(false);
  });
});
