import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ArticleRecentChange } from "@/data/changelog/articleRecentChanges";
import { RecentChangesList } from "./RecentChangesList";

const base = {
  createdAt: "2026-09-01T15:44:00.000Z",
  contributor: { name: "Lyrea", href: "/contributors/lyrea", avatarUrl: null },
  detail: null,
  field: null,
  subjectSlug: null,
} satisfies Partial<ArticleRecentChange>;

describe("RecentChangesList (site-wide)", () => {
  it("names the article each edit touched and links its section on that article", () => {
    render(
      <RecentChangesList
        changes={[
          {
            ...base,
            id: "a",
            kind: "prose",
            message: "Added a citation",
            section: { id: "summary", label: "Summary" },
            articles: [{ id: 12, title: "2C-B", slug: "2c-b" }],
            diff: "- Claim.\n+ Claim.[cite:doi-1]",
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "2C-B" })).toHaveAttribute("href", "/2c-b#summary");
    expect(screen.getByText("Summary")).toBeInTheDocument();

    // Off the article page the citation number is unknown, so the token
    // becomes a "source" chip pointing at that article's references.
    fireEvent.click(screen.getByRole("button", { name: "Show what changed" }));
    expect(screen.getByRole("link", { name: "Source no longer cited" })).toHaveAttribute("href", "/2c-b#sources");
  });

  it("lists every article of a bulk save and opens its structural diff", () => {
    render(
      <RecentChangesList
        changes={[
          {
            ...base,
            id: "b",
            kind: "bulk",
            message: "Updated the article",
            detail: "2026-07-02",
            section: null,
            articles: [
              { id: 4, title: "LSD", slug: "lsd" },
              { id: 5, title: "Psilocybin", slug: "psilocybin" },
            ],
            diff: '# LSD · #4\n\n-  "common": "12 mg"\n+  "common": "14 mg"',
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "LSD" })).toHaveAttribute("href", "/lsd");
    expect(screen.getByRole("link", { name: "Psilocybin" })).toHaveAttribute("href", "/psilocybin");
    fireEvent.click(screen.getByRole("button", { name: "Show what changed" }));
    expect(screen.getByLabelText("Diff of changed lines")).toHaveTextContent('"common": "14 mg"');
  });
});
