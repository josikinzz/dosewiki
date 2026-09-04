import { fireEvent, render, screen } from "@testing-library/react";
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

  it("renders no Recent changes ledger when the article has no human edits", () => {
    render(<ContributorsSection article={baseArticle} recentChanges={[]} />);

    expect(screen.queryByText("Recent changes")).not.toBeInTheDocument();
  });

  it("collapses the ledger by default and never shows diff text until a row is opened", () => {
    render(
      <ContributorsSection
        article={baseArticle}
        recentChanges={[
          {
            id: "direct-1",
            createdAt: "2026-08-12T10:00:00.000Z",
            kind: "prose",
            message: "Changed a word",
            detail: null,
            section: { id: "dosage-duration", label: "Dosage & Duration" },
            field: "Threshold",
            contributor: { name: "Josie Kins", href: "/contributors/josie", avatarUrl: null },
            diff: "@@ dosage.threshold @@\n- 5 mg\n+ 4 mg",
            articleCount: 1,
          },
          {
            id: "source-1",
            createdAt: "2026-08-12T09:00:00.000Z",
            kind: "source",
            message: "Added a source",
            detail: "Some paper",
            section: { id: "sources", label: "Sources" },
            field: null,
            contributor: null,
            diff: "@@ references @@\n+ Some paper",
            articleCount: 1,
          },
          {
            id: "bulk-1",
            createdAt: "2026-07-02T10:00:00.000Z",
            kind: "bulk",
            message: "Updated the article",
            detail: "2026-07-02",
            section: null,
            field: null,
            contributor: null,
            diff: "",
            articleCount: 14,
          },
        ]}
      />,
    );

    const details = screen.getByText("Recent changes").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText(/3 human edits/)).toBeInTheDocument();
    expect(screen.getByText("12 Aug").closest("time")).toHaveAttribute("dateTime", "2026-08-12T10:00:00.000Z");
    expect(document.querySelector("ins")).toBeNull();

    // Rows exist in the DOM (native details keeps them for search and a11y)
    // but a row's diff mounts only when its own expander is pressed. Rows
    // group by day with a time each; the section name links to its anchor.
    expect(screen.getByRole("heading", { name: "12 August 2026" })).toBeInTheDocument();
    expect(screen.getAllByText("10:00")[0].closest("time")).toHaveAttribute("dateTime", "2026-08-12T10:00:00.000Z");
    expect(screen.getByText("Changed a word")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dosage & Duration" })).toHaveAttribute("href", "#dosage-duration");
    expect(screen.getByText(/› Threshold/)).toBeInTheDocument();
    expect(screen.getByText("Some paper")).toBeInTheDocument();
    expect(screen.getByText(/part of a save across 14 articles/)).toBeInTheDocument();
    // Only the prose row has something to open: source rows say it all inline.
    expect(screen.getAllByRole("button", { name: "Show what changed" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Show what changed" }));
    expect(document.querySelector("ins")).toHaveTextContent("4");
    expect(document.querySelector("del")).toHaveTextContent("5");
    expect(screen.getByRole("button", { name: "Hide what changed" })).toBeInTheDocument();
  });
});
