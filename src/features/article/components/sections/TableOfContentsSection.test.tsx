import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { TableOfContentsSection } from "./TableOfContentsSection";

describe("TableOfContentsSection", () => {
  it("shows subjective effects when only the overview note is present", () => {
    const article = {
      ...createEmptyArticle(),
      id: 12,
      title: "Overview Only",
      identification: {
        ...createEmptyArticle().identification,
        common_name: "Overview Only",
      },
      subjective_effects: {
        ...createEmptyArticle().subjective_effects,
        notes: {
          ...createEmptyArticle().subjective_effects.notes,
          overview: "This substance has a distinctive experiential arc.",
        },
      },
    };

    render(<TableOfContentsSection article={article} />);

    expect(screen.getByText("Subjective Effects")).toBeInTheDocument();
  });
});
