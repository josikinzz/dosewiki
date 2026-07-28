import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArticlesIndexPage } from "./ArticlesIndexPage";

const emptyState = {
  badge: "No articles yet",
  title: "No published articles found",
  description: "There aren't any published Effect Index articles in this deployment yet.",
  icon: "lucide:file-search",
} as const;

describe("ArticlesIndexPage", () => {
  it("groups published articles under their subject headings", () => {
    render(
      <ArticlesIndexPage
        articles={[
          {
            slug: "dmt",
            title: "DMT",
            tags: ["intensity scale"],
            shortDescription: "A staged model of the DMT experience.",
            publicationDate: "2021-05-08",
            body_raw: `[p]${"word ".repeat(1200)}[/p]`,
          },
          {
            slug: "dreams",
            title: "Dreams",
            tags: ["dreams"],
            body_raw: `[p]${"word ".repeat(1200)}[/p]`,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Intensity & rating scales" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Dreaming & consciousness" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /DMT/ })).toHaveAttribute(
      "href",
      "/articles/dmt",
    );
  });

  it("renders a definitional page as a single-line row without reading time", () => {
    render(
      <ArticlesIndexPage
        articles={[
          {
            slug: "duration-terminology-explanation",
            title: "Duration Terminology Explanation",
            tags: [],
            shortDescription: "What onset, come up, peak, and offset mean.",
            publicationDate: "2021-02-01",
            body_raw: `[p]${"word ".repeat(226)}[/p]`,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("link", { name: /Duration Terminology Explanation/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/min read/)).not.toBeInTheDocument();
  });

  // Production currently has no imported articles, so the empty branch is the
  // live public state rather than an edge case.
  it("offers a way onward when the index is empty", () => {
    render(<ArticlesIndexPage articles={[]} emptyState={emptyState} />);

    expect(
      screen.getByRole("heading", { name: emptyState.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Browse the effect index" }),
    ).toHaveAttribute("href", "/effects");
    expect(
      screen.getByRole("link", { name: "Browse substances" }),
    ).toHaveAttribute("href", "/substances");
  });
});
