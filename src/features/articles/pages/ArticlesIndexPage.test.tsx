import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArticlesIndexPage } from "./ArticlesIndexPage";

const emptyState = {
  badge: "No articles yet",
  title: "No published articles found",
  description: "There aren't any published Effect Index articles yet.",
  icon: "lucide:file-search",
} as const;

describe("ArticlesIndexPage", () => {
  it("groups published articles under their subject headings in index order", () => {
    render(
      <ArticlesIndexPage
        articles={[
          {
            slug: "psychedelic-intensity-scale",
            title: "Psychedelic Intensity Scale",
            tags: ["intensity scale"],
            shortDescription: "Seven levels from threshold to ego death.",
            publicationDate: "2021-05-08",
            body_raw: `[p]${"word ".repeat(1200)}[/p]`,
          },
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
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Drug guides", "Intensity & rating scales", "Dreaming & consciousness"]);
    expect(screen.getByRole("link", { name: /DMT/ })).toHaveAttribute(
      "href",
      "/articles/dmt",
    );
  });

  it("renders every article as one row with title, blurb, and inline meta", () => {
    render(
      <ArticlesIndexPage
        articles={[
          {
            slug: "dmt",
            title: "DMT",
            tags: ["intensity scale", "psychedelics"],
            shortDescription: "A staged model of the DMT experience.",
            publicationDate: "2021-05-08",
            body_raw: `[p]${"word ".repeat(1200)}[/p]`,
          },
          {
            slug: "duration-terminology-explanation",
            title: "Duration Terminology Explanation",
            tags: [],
            publicationDate: "2021-02-01",
            body_raw: `[p]What onset, come up, peak, and offset mean. ${"word ".repeat(226)}[/p]`,
          },
        ]}
      />,
    );

    const guide = screen.getByRole("link", { name: /DMT/ });
    expect(guide.querySelector("h3")).toBeNull();
    expect(guide).toHaveTextContent("A staged model of the DMT experience.");
    expect(guide).toHaveTextContent("May 2021 · 5 min read");
    // Tags stay on the article page; in the index the group heading says the
    // subject, so a row carries no pills.
    expect(guide).not.toHaveTextContent("intensity scale");
    expect(guide).not.toHaveTextContent("psychedelics");

    const definition = screen.getByRole("link", { name: /Duration Terminology Explanation/ });
    expect(definition).toHaveTextContent("What onset, come up, peak, and offset mean.");
    expect(definition).toHaveTextContent("February 2021 · 1 min read");
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
