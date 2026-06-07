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
  it("renders adjacent citation markers as separate superscript links", () => {
    const text = "Supported claim. [cite:first][cite:second] Next sentence.";
    const article = makeArticle(text, ["first", "second"]);
    const { container } = render(<CitedText text={text} article={article} />);

    expect(container).toHaveTextContent("Supported claim.12 Next sentence.");
    expect(container.textContent).not.toContain("[cite:");
    expect(screen.getByRole("link", { name: "1" })).toHaveAttribute(
      "href",
      "#ref-first",
    );
    expect(screen.getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "#ref-second",
    );
    expect(screen.queryByRole("link", { name: "1, 2" })).not.toBeInTheDocument();
  });

  it("uses line-box-safe citation marker layout for clamped article text", () => {
    const text = "Supported claim [cite:first].";
    const article = makeArticle(text, ["first"]);
    const { container } = render(<CitedText text={text} article={article} />);

    const marker = screen.getByRole("link", { name: "1" });
    expect(marker).toHaveClass("inline-flex", "leading-[1.05]", "rounded-[0.12rem]");
    expect(container.querySelector("sup")).toHaveClass(
      "inline-flex",
      "gap-[0.32em]",
      "align-baseline",
      "-top-[0.42em]",
      "text-[0.62em]",
    );
  });

  it("keeps unknown references visible without raw cite tokens", () => {
    const text = "Unsupported public marker [cite:missing].";
    const article = makeArticle(text, []);
    render(<ArticleText article={article} text={text} />);

    expect(screen.getByText(/Unsupported public marker/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "?" })).toHaveAttribute(
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

    const secondMarker = screen.getByRole("link", { name: "2" });
    const firstMarker = screen.getByRole("link", { name: "1" });
    expect(secondMarker).toHaveAttribute("href", "#ref-second");
    expect(firstMarker).toHaveAttribute("href", "#ref-first");
    expect(secondMarker).toHaveClass("theme-citation-marker");
  });
});
