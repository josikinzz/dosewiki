import { describe, expect, it } from "vitest";

import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { SubstanceArticle } from "@/schema";

import { resolveEditorArticleSlug } from "./devModeUtils";

function row(overrides: Partial<SubstanceArticle> & { slug?: unknown }): SubstanceArticle {
  return { ...createEmptyArticle(), ...overrides } as SubstanceArticle;
}

describe("resolveEditorArticleSlug", () => {
  it("returns the row's stored slug", () => {
    expect(resolveEditorArticleSlug(row({ slug: "lsd", title: "LSD" }))).toBe("lsd");
  });

  it("returns null for a row without a slug instead of guessing from the title", () => {
    expect(resolveEditorArticleSlug(row({ title: "Ketamine" }))).toBeNull();
    expect(resolveEditorArticleSlug(row({ slug: "   ", title: "Ketamine" }))).toBeNull();
    expect(resolveEditorArticleSlug(row({ slug: 42, title: "Ketamine" }))).toBeNull();
  });

  it("keeps the stored slug when the title differs from it", () => {
    expect(
      resolveEditorArticleSlug(row({ slug: "1p-lsd", title: "1P-LSD (1-propionyl-lysergic acid diethylamide)" })),
    ).toBe("1p-lsd");
  });

  it("trims a padded slug", () => {
    expect(resolveEditorArticleSlug(row({ slug: "  mdma " }))).toBe("mdma");
  });
});
