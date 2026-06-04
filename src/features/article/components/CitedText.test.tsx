import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { SubstanceArticle } from "@/schema";
import { ArticleText, CitedText, CitationMarker } from "./CitedText";

function makeReference(id: string, title: string) {
  return {
    id,
    type: "webpage" as const,
    title,
    authors: [],
    url: `https://example.test/${id}`,
    sourceType: "unknown" as const,
    quality: "fallback" as const,
  };
}

function makeArticle(summary: string, referenceIds: string[]) {
  return {
    ...createEmptyArticle(),
    summary,
    references: referenceIds.map((id) => makeReference(id, id)),
  } as SubstanceArticle;
}

describe("CitedText", () => {
  it("renders adjacent citation markers as one superscript link", () => {
    const text = "Supported claim. [cite:first][cite:second] Next sentence.";
    const article = makeArticle(text, ["first", "second"]);
    const { container } = render(<CitedText text={text} article={article} />);

    expect(container).toHaveTextContent("Supported claim.[1, 2] Next sentence.");
    expect(container.textContent).not.toContain("[cite:");
    expect(screen.getByRole("link", { name: "[1, 2]" })).toHaveAttribute(
      "href",
      "#ref-first",
    );
  });

  it("keeps unknown references visible without raw cite tokens", () => {
    const text = "Unsupported public marker [cite:missing].";
    const article = makeArticle(text, []);
    render(<ArticleText article={article} text={text} />);

    expect(screen.getByText(/Unsupported public marker/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "[?]" })).toHaveAttribute(
      "href",
      "#sources",
    );
    expect(screen.queryByText(/\[cite:/)).not.toBeInTheDocument();
  });

  it("links explicit citation marker groups to the first resolved reference", () => {
    const article = makeArticle(
      "First [cite:first]. Second [cite:second].",
      ["first", "second"],
    );

    render(<CitationMarker article={article} referenceIds={["second", "first"]} />);

    const marker = screen.getByRole("link", { name: "[2, 1]" });
    expect(marker).toHaveAttribute("href", "#ref-second");
    expect(marker).toHaveClass("theme-evidence-link");
  });
});
