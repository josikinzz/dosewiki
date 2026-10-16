import { describe, expect, it } from "vitest";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import {
  parsePublicSubstanceRecord,
} from "./publicData.substanceContract";

describe("public substance article contract", () => {
  it("validates public article records and strips editor-only metadata", () => {
    const result = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      editorial_review: {
        status: "needed",
        notes: "internal",
      },
    });

    expect(result).toMatchObject({
      title: "LSD",
      slug: "lsd",
      priority: "normal",
    });
    expect(result).not.toHaveProperty("editorial_review");
  });

  it("exposes a public-safe expert_reviewed flag derived from a completed review", () => {
    const reviewed = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      editorial_review: { status: "completed", notes: "internal" },
    });

    expect(reviewed).toMatchObject({ slug: "lsd", expert_reviewed: true });
    expect(reviewed).not.toHaveProperty("editorial_review");
    expect(JSON.stringify(reviewed)).not.toContain("internal");

    const pending = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      editorial_review: { status: "in_progress", notes: "" },
    });

    expect(pending).toMatchObject({ expert_reviewed: false });
  });
});
