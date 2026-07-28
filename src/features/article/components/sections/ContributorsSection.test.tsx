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
  it("always credits the autonomous synthesis workflow and links it to the docs", () => {
    render(<ContributorsSection article={baseArticle} profileHrefs={profileHrefs} />);

    // Title-less by design: the section is labelled for assistive tech, not shown.
    expect(screen.getByRole("region", { name: "Contributors" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Contributors" })).not.toBeInTheDocument();
    expect(screen.getByText("Josie Kins").closest("a")).toHaveAttribute(
      "href",
      "/contributors/josie",
    );
    expect(screen.getByText("autonomous workflow").closest("a")).toHaveAttribute(
      "href",
      "/docs/how",
    );
    // The expert-review credit stays hidden until an article is marked reviewed.
    expect(screen.queryByText("Lyrea")).not.toBeInTheDocument();
  });

  it("adds the expert-review credit from the public expert_reviewed flag", () => {
    const reviewed = { ...baseArticle, expert_reviewed: true } as unknown as SubstanceArticle;
    render(<ContributorsSection article={reviewed} profileHrefs={profileHrefs} />);

    expect(screen.getByText(/Reviewed, edited, and approved/)).toBeInTheDocument();
    expect(screen.getByText("Lyrea").closest("a")).toHaveAttribute(
      "href",
      "/contributors/lyrea",
    );
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
