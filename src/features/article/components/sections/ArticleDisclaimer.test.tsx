import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { SubstanceArticle } from "@/schema";
import { ArticleDisclaimer } from "./ArticleDisclaimer";
import {
  TOLERANCE_SECTION_DISCLAIMER_FALLBACK,
} from "./articleDisclaimerCopy";
import { ToleranceSection } from "./ToleranceSection";

/**
 * The disclaimers are the one piece of article prose a reader never asked for,
 * so what matters is that an editor stays in control of it: the checked-in
 * sentence renders until a copy block replaces it, and blanking the block
 * removes the line rather than leaving a bare glyph behind.
 */

function toleranceArticle(): SubstanceArticle {
  const empty = createEmptyArticle();
  return {
    ...empty,
    tolerance: {
      full_tolerance: "Builds over three consecutive doses.",
      half_tolerance: "About five days.",
      baseline_tolerance: "About two weeks.",
      cross_tolerance: ["LSD"],
    },
  } as SubstanceArticle;
}

describe("ArticleDisclaimer", () => {
  // The suite-wide setup stubs @iconify/react to a null renderer, so the glyph
  // itself is covered by `Icon.test.tsx`; what belongs here is the line.
  it("renders the body inside one muted footnote line", () => {
    const { container } = render(<ArticleDisclaimer text="Numbers are approximate." />);

    expect(screen.getByText("Numbers are approximate.")).toBeInTheDocument();
    const line = container.querySelector("p");
    expect(line?.className).toContain("theme-text-muted");
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("renders nothing for a blank body", () => {
    const { container } = render(<ArticleDisclaimer text="   " />);

    expect(container.innerHTML).toBe("");
  });
});

describe("ToleranceSection disclaimer", () => {
  it("renders the checked-in default above the timing cards", () => {
    const { container } = render(<ToleranceSection article={toleranceArticle()} />);

    const disclaimer = screen.getByText(TOLERANCE_SECTION_DISCLAIMER_FALLBACK);
    expect(disclaimer).toBeInTheDocument();
    // Above the grid, and outside it: the masonry assigns cards to columns by
    // child index, so the line must not be one of its children.
    const masonry = container.querySelector(".flex.w-full.gap-4");
    expect(masonry?.contains(disclaimer)).toBe(false);
    expect(
      disclaimer.compareDocumentPosition(masonry as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders the edited copy body instead of the default", () => {
    const edited = "Timings are indicative only.";
    render(<ToleranceSection article={toleranceArticle()} disclaimer={edited} />);

    expect(screen.getByText(edited)).toBeInTheDocument();
    expect(
      screen.queryByText(TOLERANCE_SECTION_DISCLAIMER_FALLBACK),
    ).not.toBeInTheDocument();
  });

  it("draws no line at all when an editor blanks the block", () => {
    const { container } = render(
      <ToleranceSection article={toleranceArticle()} disclaimer="" />,
    );

    expect(container.textContent).not.toContain("rules of thumb");
    expect(screen.getByText("Full Tolerance")).toBeInTheDocument();
  });
});
