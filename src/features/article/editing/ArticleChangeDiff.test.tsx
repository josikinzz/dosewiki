import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { fullArticleWithDosage } from "@/test/fixtures/articles";
import type { SubstanceArticle } from "@/schema";
import { ARTICLE_PATCH_FIELDS } from "../../../../lib/proposals/articlePatch";
import { ArticleChangeDiff, articleFieldChanges } from "./ArticleChangeDiff";
import { ARTICLE_SECTION_LABELS } from "./articleSections";

afterEach(cleanup);

function withOralModerate(min: number, max: number): SubstanceArticle {
  const article = structuredClone(fullArticleWithDosage);
  article.dosage.routes[0] = {
    ...article.dosage.routes[0],
    route: "oral",
    dose_ranges: { ...article.dosage.routes[0].dose_ranges, moderate: { min, max, unit: "mg" } },
  };
  return article;
}

describe("ArticleChangeDiff", () => {
  it("reads a dose change as its place in words plus the range before and after", () => {
    render(<ArticleChangeDiff before={withOralModerate(10, 20)} after={withOralModerate(15, 25)} />);

    const diff = screen.getByLabelText("Article change review");
    expect(within(diff).getByRole("heading", { level: 3 })).toHaveTextContent("Dosage and duration");
    expect(within(diff).getByTestId("article-change")).toHaveTextContent("Oral › Dose ranges › Moderate: 10-20 mg to 15-25 mg");
    // No storage path or object key reaches the reader.
    expect(diff.textContent).not.toMatch(/dose_ranges|routes\[|\bmin:|\bmax:/);
  });

  it("records a dose range as one change, not one per bound", () => {
    expect(articleFieldChanges(withOralModerate(10, 20), withOralModerate(15, 25))).toEqual([{
      path: "dosage.routes[oral].dose_ranges.moderate",
      before: { min: 10, max: 20, unit: "mg" },
      after: { min: 15, max: 25, unit: "mg" },
    }]);
  });

  it("covers every section the in-page editor can change", () => {
    expect(ARTICLE_PATCH_FIELDS).toEqual(expect.arrayContaining(Object.keys(ARTICLE_SECTION_LABELS)));
  });

  it("renders a stored patch the same way it renders two article versions", () => {
    const changes = articleFieldChanges(withOralModerate(10, 20), withOralModerate(15, 25));
    const { container: fromPatch } = render(<ArticleChangeDiff changes={changes} />);
    const patchText = fromPatch.textContent;
    cleanup();
    const { container: fromVersions } = render(<ArticleChangeDiff before={withOralModerate(10, 20)} after={withOralModerate(15, 25)} />);
    expect(fromVersions.textContent).toBe(patchText);
  });

  it("keeps long prose in a before and after pair", () => {
    const before = { ...fullArticleWithDosage, summary: "A long summary that runs well past a single line of the review panel." };
    const after = { ...before, summary: "A long summary that runs well past a single line of the review panel, now sourced." };
    render(<ArticleChangeDiff before={before} after={after} />);
    expect(screen.getByRole("heading", { level: 4, name: "Before" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "After" })).toBeInTheDocument();
  });
});
