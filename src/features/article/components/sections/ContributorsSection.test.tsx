import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

  it("loads a scoped history diff only when its row is expanded", async () => {
    const fetchDiff = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ markdown: "@@ dosage.threshold @@\n- 5 mg\n+ 4 mg" }),
      { headers: { "Content-Type": "application/json" } },
    ));
    try {
      render(
        <ContributorsSection
          article={baseArticle}
          recentChanges={[{
            id: "direct-1",
            createdAt: "2026-08-12T10:00:00.000Z",
            kind: "prose",
            message: "Changed a word",
            detail: null,
            section: { id: "dosage-duration", label: "Dosage & Duration" },
            field: [{ label: "Threshold", index: null }],
            contributor: null,
            hasDiff: true,
            articles: [{ id: 12, title: "2C-B", slug: "2c-b" }],
            subjectSlug: "2c-b",
          }]}
        />,
      );
      expect(fetchDiff).not.toHaveBeenCalled();
      expect(document.querySelector("ins")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Show what changed" }));
      await waitFor(() => expect(document.querySelector("ins")).toHaveTextContent("4"));
      expect(document.querySelector("del")).toHaveTextContent("5");
      fireEvent.click(screen.getByRole("button", { name: "Hide what changed" }));
      expect(document.querySelector("ins")).toBeNull();
    } finally {
      fetchDiff.mockRestore();
    }
  });
});
