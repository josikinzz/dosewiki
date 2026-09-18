import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SubstanceArticle } from "@/schema";
import { CitedText } from "../CitedText";
import { CitationsSection } from "./CitationsSection";
import { HistoryCultureSection } from "./HistoryCultureSection";

const article = {
  summary: "Supported [cite:paper-one].",
  references: [
    { id: "paper-one", type: "webpage", title: "Paper One", authors: [], url: "https://example.com/paper", sourceType: "unknown", quality: "fallback" },
  ],
  source_citations: [{ name: "PsychonautWiki", url: "https://psychonautwiki.org/wiki/Ketamine" }],
  citations: [
    { name: "Reading 1", url: "https://example.com/1" },
    { name: "Reading 2", url: "https://example.com/2" },
    { name: "Reading 3", url: "https://example.com/3" },
    { name: "Reading 4", url: "https://example.com/4" },
  ],
} as SubstanceArticle;

describe("CitationsSection", () => {
  it("renders projected substance sources before collapsed further reading", () => {
    render(<CitationsSection article={article} />);

    expect(screen.getByText("References")).toBeInTheDocument();
    expect(screen.getByText("Source Pages")).toBeInTheDocument();
    expect(screen.getByText("Citations")).toBeInTheDocument();
    expect(screen.getByText("Further Reading")).toBeInTheDocument();
    expect(screen.getByText("PsychonautWiki")).toBeInTheDocument();
    expect(screen.getByText("PsychonautWiki").closest("a")).toHaveAttribute(
      "data-token",
      "public-name-chip",
    );
    expect(screen.getByText(/Paper One/).closest("a")).not.toHaveAttribute(
      "data-token",
      "public-name-chip",
    );
    expect(screen.getByText("Reading 3")).toBeInTheDocument();
    expect(screen.getByText("Reading 4")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /expand further reading/i })).not.toBeInTheDocument();
  });

  it("applies mobile wrapping guards to structured reference links", () => {
    render(<CitationsSection article={article} />);

    const referenceLink = screen.getByText(/Paper One/).closest("a");
    expect(referenceLink).toHaveClass("hyphenate");
    expect(referenceLink?.closest("ol")).toHaveClass("max-w-full", "list-none", "p-0");
    expect(referenceLink?.closest("li")?.querySelector(".theme-reference-number")).toHaveClass(
      "rounded-[0.12rem]",
    );
  });

  it("renders small citation backlinks to in-article marker uses", async () => {
    render(
      <>
        <p>
          <CitedText text={article.summary} article={article} />
        </p>
        <CitationsSection article={article} />
      </>,
    );

    const inlineCitation = screen.getByRole("link", { name: "Citation 1" });

    await waitFor(() => {
      expect(inlineCitation).toHaveAttribute("id", "cite-use-paper-one-1");
      const backlink = screen.getByRole("link", { name: "Go to use 1 of citation 1" });
      expect(backlink.closest(".theme-citation-marker")).toHaveClass("rounded-[0.12rem]");
      expect(
        backlink,
      ).toHaveAttribute("href", "#cite-use-paper-one-1");
    });
  });

  it("includes backlinks for citations hidden inside collapsed sections and expands them on click", async () => {
    const collapsedArticle = {
      ...article,
      summary: "",
      references: [
        { id: "hidden-ref", type: "webpage" as const, title: "Hidden Ref", authors: [], url: "https://example.com/hidden", sourceType: "unknown" as const, quality: "fallback" },
      ],
      history_culture: {
        content: "",
        sections: [
          {
            heading: "Early history",
            content: "Visible history.",
            subsections: [],
          },
          {
            heading: "Later history",
            content: "Hidden history [cite:hidden-ref].",
            subsections: [],
          },
        ],
      },
    } as SubstanceArticle;

    render(
      <>
        <HistoryCultureSection article={collapsedArticle} />
        <CitationsSection article={collapsedArticle} />
      </>,
    );

    expect(screen.queryByText(/Hidden history/)).not.toBeInTheDocument();

    const hiddenBacklink = screen.getByRole("link", {
      name: "Go to use 1 of citation 1",
    });
    expect(hiddenBacklink).toHaveAttribute("href", "#sources");

    fireEvent.click(hiddenBacklink);

    await waitFor(() => {
      expect(screen.getByText(/Hidden history/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Citation 1" })).toHaveAttribute(
        "data-reference-id",
        "hidden-ref",
      );
    });
  });
});
