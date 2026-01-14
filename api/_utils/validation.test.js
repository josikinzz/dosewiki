import { describe, it, expect } from "vitest";

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
  citations: [],
});

describe("validation helpers", () => {
  it("computes payload byte length for strings and objects", async () => {
    const { getPayloadByteLength } = await import("./validation.js");

    expect(getPayloadByteLength(null)).toBe(0);
    expect(getPayloadByteLength("hello")).toBe(5);
    expect(getPayloadByteLength({ value: "hello" })).toBe(
      Buffer.byteLength(JSON.stringify({ value: "hello" }), "utf8")
    );
  });

  it("accepts valid articles payload", async () => {
    const { validateArticlesPayload } = await import("./validation.js");
    const result = validateArticlesPayload([buildValidArticle()]);

    expect(result.success).toBe(true);
  });

  it("rejects invalid articles payload", async () => {
    const { validateArticlesPayload } = await import("./validation.js");
    const invalid = { ...buildValidArticle(), title: 123 };
    const result = validateArticlesPayload([invalid]);

    expect(result.success).toBe(false);
  });
});
