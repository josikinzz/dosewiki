import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArticleRecentChange } from "@/data/changelog/articleRecentChanges";
import { RecentChangesList } from "./RecentChangesList";

const base = {
  createdAt: "2026-09-01T15:44:00.000Z",
  contributor: { name: "Lyrea", href: "/contributors/lyrea", avatarUrl: null },
  detail: null,
  field: null,
  subjectSlug: null,
} satisfies Partial<ArticleRecentChange>;

afterEach(() => vi.unstubAllGlobals());

describe("RecentChangesList (site-wide)", () => {
  it("names the article and fetches its diff only when expanded", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ markdown: "- Claim.\n+ Claim.[cite:doi-1]" }),
      });
    vi.stubGlobal("fetch", fetcher);
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
            hasDiff: true,
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "2C-B" })).toHaveAttribute(
      "href",
      "/2c-b#summary",
    );
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();

    // Off the article page the citation number is unknown, so the token
    // becomes a "source" chip pointing at that article's references.
    fireEvent.click(screen.getByRole("button", { name: "Show what changed" }));
    expect(
      await screen.findByRole("link", { name: "Source no longer cited" }),
    ).toHaveAttribute("href", "/2c-b#sources");
  });

  it("lists every article of a bulk save and opens its structural diff", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            markdown:
              '# LSD · #4\n\n-  "common": "12 mg"\n+  "common": "14 mg"',
          }),
        }),
    );
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
            hasDiff: true,
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "LSD" })).toHaveAttribute(
      "href",
      "/lsd",
    );
    expect(screen.getByRole("link", { name: "Psilocybin" })).toHaveAttribute(
      "href",
      "/psilocybin",
    );
    fireEvent.click(screen.getByRole("button", { name: "Show what changed" }));
    expect(
      await screen.findByLabelText("Diff of changed lines"),
    ).toHaveTextContent('"common": "14 mg"');
  });
});

describe("RecentChangesList (article surface)", () => {
  it("names the trimmed siblings and counts the rest from the projected total", () => {
    render(
      <RecentChangesList
        article={{ citations: { numbers: {}, hrefBase: "" } }}
        changes={[
          {
            ...base,
            id: "c",
            kind: "bulk",
            message: "Updated the article",
            section: null,
            subjectSlug: "ketamine",
            // The projection ships the subject plus the three named siblings;
            // the save itself touched 598 articles.
            articles: [
              { id: 1, title: "Ketamine", slug: "ketamine" },
              { id: 4, title: "LSD", slug: "lsd" },
              { id: 5, title: "Psilocybin", slug: "psilocybin" },
              { id: 6, title: "MDMA", slug: "mdma" },
            ],
            siblingTotal: 597,
            hasDiff: false,
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "LSD" })).toHaveAttribute(
      "href",
      "/lsd",
    );
    expect(screen.getByRole("link", { name: "MDMA" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Ketamine" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/and 594 more/)).toBeInTheDocument();
  });
});
