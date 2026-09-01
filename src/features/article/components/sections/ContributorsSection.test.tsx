import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SubstanceArticle } from "@/schema";
import { ContributorsSection } from "./ContributorsSection";

const baseArticle = {
  title: "2C-B",
  summary: "",
} as SubstanceArticle;

const profileHrefs = { josie: "/contributors/josie", lyrea: "/contributors/lyrea" };

describe("ContributorsSection", () => {
  it("always renders the three-step ladder with the synthesis credit first", () => {
    render(<ContributorsSection article={baseArticle} profileHrefs={profileHrefs} />);

    const heading = screen.getByRole("heading", { name: "Article Status" });
    expect(heading).toBeInTheDocument();
    expect(heading.closest("section")).toHaveAttribute("id", "article-status");
    expect(screen.getByText("Josie Kins").closest("a")).toHaveAttribute(
      "href",
      "/contributors/josie",
    );
    expect(screen.getByText("autonomous workflow").closest("a")).toHaveAttribute(
      "href",
      "/docs/how",
    );
    // All three steps render even before any review: steps 2 and 3 are pending.
    expect(screen.getByText(/Step 1 · Automated synthesis/)).toBeInTheDocument();
    expect(screen.getByText(/Step 2 · First-pass review/)).toBeInTheDocument();
    expect(screen.getByText(/Step 3 · Citation review/)).toBeInTheDocument();
    expect(screen.getAllByText("Pending")).toHaveLength(2);
    // The pending step reuses the top banner sentence verbatim.
    expect(screen.getByText(/pending editorial review by/)).toBeInTheDocument();
    expect(screen.getByText(/No one has reviewed this article's citations yet/)).toBeInTheDocument();
  });

  it("flips step 2 to the expert-review credit from the public expert_reviewed flag", () => {
    const reviewed = { ...baseArticle, expert_reviewed: true } as unknown as SubstanceArticle;
    render(<ContributorsSection article={reviewed} profileHrefs={profileHrefs} />);

    expect(screen.getByText(/has reviewed this article's essentials/)).toBeInTheDocument();
    expect(screen.getByText("Lyrea").closest("a")).toHaveAttribute(
      "href",
      "/contributors/lyrea",
    );
    // Only the citation-review step remains pending.
    expect(screen.getAllByText("Pending")).toHaveLength(1);
  });


  it("also honors the editor editorial_review status in the generator preview", () => {
    const reviewed = {
      ...baseArticle,
      editorial_review: { status: "completed", notes: "" },
    } as SubstanceArticle;
    render(<ContributorsSection article={reviewed} />);

    expect(screen.getByText("Lyrea")).toBeInTheDocument();
  });
});
