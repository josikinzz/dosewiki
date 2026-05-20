import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SubstanceArticle } from "@/schema";
import { CitationsSection } from "./CitationsSection";

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
    expect(screen.getByText("Further Reading")).toBeInTheDocument();
    expect(screen.getByText("PsychonautWiki")).toBeInTheDocument();
    expect(screen.getByText("Reading 3")).toBeInTheDocument();
    expect(screen.queryByText("Reading 4")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /expand further reading/i }));
    expect(screen.getByText("Reading 4")).toBeInTheDocument();
  });
});
