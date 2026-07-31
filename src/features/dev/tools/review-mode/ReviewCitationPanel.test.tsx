import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { SubstanceArticle } from "@/schema";
import { ReviewCitationPanel } from "./ReviewCitationPanel";

function makeReference(id: string, title: string) {
  return {
    id,
    type: "webpage" as const,
    title,
    authors: [],
    url: `https://example.test/${id}`,
    sourceType: "unknown" as const,
    quality: "fallback" as const,
  };
}

/**
 * Summary carries one resolvable marker (`cited`), one dangling marker
 * (`ghost`); `orphan` is a structured reference no marker cites.
 */
function makeArticle(): SubstanceArticle {
  return {
    ...createEmptyArticle(),
    summary: "A supported claim. [cite:cited] A broken one. [cite:ghost]",
    references: [
      makeReference("cited", "Cited source"),
      makeReference("orphan", "Uncited source"),
    ],
  } as SubstanceArticle;
}

function renderPanel(onClose = vi.fn()) {
  render(
    <ReviewCitationPanel
      article={makeArticle()}
      name="Testium"
      id="review-citation-panel"
      onClose={onClose}
    />,
  );
  return onClose;
}

describe("ReviewCitationPanel", () => {
  it("lists cited, uncited, and dangling entries in their own groups", () => {
    renderPanel();

    // The cited reference carries its public number.
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/Cited source/)).toBeInTheDocument();

    // The orphan is flagged as publicly invisible, not silently mixed in.
    expect(screen.getByText("uncited")).toBeInTheDocument();
    expect(screen.getByText(/Uncited source/)).toBeInTheDocument();

    // The dangling marker is shown as its raw token.
    expect(screen.getByText("dangling")).toBeInTheDocument();
    expect(screen.getByText("[cite:ghost]")).toBeInTheDocument();
  });

  it("copies the exact marker token for a reference", async () => {
    // user-event installs its own clipboard stub; read it back rather than
    // fighting it with a mock.
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Copy the citation marker for orphan" }),
    );

    expect(await navigator.clipboard.readText()).toBe("[cite:orphan]");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("closes through the header button", async () => {
    const user = userEvent.setup();
    const onClose = renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Close the citation panel" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("explains itself when the article has no references or markers", () => {
    render(
      <ReviewCitationPanel
        article={{ ...createEmptyArticle(), summary: "Plain." } as SubstanceArticle}
        name="Testium"
        id="review-citation-panel"
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/no structured references yet/i),
    ).toBeInTheDocument();
  });
});
