import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ContributorReviewedArticle } from "@/types/reviewedArticles";
import { UserProfileReviewedArticlesSection } from "./UserProfileReviewedArticlesSection";

const reviewed = (count: number): ContributorReviewedArticle[] =>
  Array.from({ length: count }, (_, index) => ({
    slug: `substance-${index + 1}`,
    title: `Substance ${index + 1}`,
    reviewed_at: "2026-08-01T00:00:00.000Z",
  }));

describe("UserProfileReviewedArticlesSection", () => {
  it("renders a single review as one tag linking to the article, with no expander", () => {
    render(
      <UserProfileReviewedArticlesSection
        reviewedArticles={[{ slug: "2c-b", title: "2C-B", reviewed_at: null }]}
        contributorName="Lyrea"
      />,
    );

    expect(screen.getByRole("link", { name: "2C-B" })).toHaveAttribute(
      "href",
      "/2c-b",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("caps the visible tags and puts the rest behind the count-pill expander", async () => {
    const user = userEvent.setup();

    render(
      <UserProfileReviewedArticlesSection
        reviewedArticles={reviewed(82)}
        contributorName="Lyrea"
      />,
    );

    // The count is on the heading, so the reader is told 82 without 82 tags
    // pushing the changelog off the page.
    expect(screen.getByRole("heading", { name: "Reviewed articles" })).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();

    const preview = screen.getByRole("list", {
      name: "Substance articles Lyrea reviewed",
    });
    expect(within(preview).getAllByRole("link")).toHaveLength(24);

    // The remainder sits behind the shared centered "+N" pill — the same
    // expander the effect credits above it and the substance-article
    // sections use.
    const expandButton = screen.getByRole("button", { name: "Expand reviewed articles" });
    expect(expandButton).toHaveTextContent("+58");

    await user.click(expandButton);

    expect(screen.getAllByRole("link")).toHaveLength(82);
    expect(screen.getByRole("link", { name: "Substance 82" })).toHaveAttribute(
      "href",
      "/substance-82",
    );
  });

  it("renders nothing at all for a contributor with no completed reviews", () => {
    const { container } = render(
      <UserProfileReviewedArticlesSection reviewedArticles={[]} contributorName="Josie Kins" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
