import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IntLink } from "./IntLink";

function renderLink(to: string | undefined) {
  render(<IntLink to={to}>Target link</IntLink>);

  return screen.getByRole("link", { name: "Target link" });
}

describe("IntLink", () => {
  it.each([
    ["/effectsgeometry", "/effects/geometry"],
    ["/effectsinternal-hallucination", "/effects/internal-hallucination"],
    ["/categories/geometric-patterns", "/effects/category/geometric-patterns"],
    // Legacy per-class routes now point at the routed index/detail pages.
    ["/psychoactive/psychedelic", "/substances#psychedelic"],
    ["/psychoactive/stimulant", "/substances#stimulant"],
    ["/summaries/psychedelics", "/substances#psychedelic"],
    ["/chemical/tryptamine", "/chemical-classes/tryptamine"],
    ["effectsgeometry", "/effects/geometry"],
    // Doubled prefix, as the dissociative intensity scale authors five of its links.
    ["/effects/effects/scenery-slicing", "/effects/scenery-slicing"],
    ["/effects/effects/effects/tactile-suppression", "/effects/tactile-suppression"],
    // `/substances/` with no slug is the index; it used to collapse to the home page.
    ["/substances/", "/substances"],
    ["/substances", "/substances"],
    ["/substances/lsd", "/lsd"],
  ])("normalizes malformed rich-content href %s", (input, expectedHref) => {
    expect(renderLink(input)).toHaveAttribute("href", expectedHref);
  });

  it.each([
    // Effect Index's subarticle selector addresses a section that renders with
    // the same id, so it has to become a fragment or the link never scrolls.
    ["/effects/drifting?s=variations", "/effects/drifting#variations"],
    ["/effects/autonomous-entity?s=communication-styles", "/effects/autonomous-entity#communication-styles"],
    // Both slips at once.
    ["/effects/effects/visual-disconnection?s=holes-spaces-voids", "/effects/visual-disconnection#holes-spaces-voids"],
  ])("turns the subarticle selector in %s into an anchor", (input, expectedHref) => {
    expect(renderLink(input)).toHaveAttribute("href", expectedHref);
  });

  it.each([
    // Anything richer than a bare `?s=<id>` is left alone rather than guessed at.
    ["/effects/drifting?s=variations&full=1", "/effects/drifting?s=variations&full=1"],
    ["/effects/drifting?page=2", "/effects/drifting?page=2"],
    ["/effects/drifting#variations", "/effects/drifting#variations"],
  ])("leaves the query on %s untouched", (input, expectedHref) => {
    expect(renderLink(input)).toHaveAttribute("href", expectedHref);
  });

  it.each([
    "/effects/geometry",
    "/effects/internal-hallucination",
    "/effects/category/geometric-patterns",
    "/category/psychedelic",
    "/psychoactive/psychedelic/visual",
    "/psychoactive/psychedelic/cognitive",
    "/psychoactive/psychedelic/miscellaneous",
    "/psychoactive/dissociative",
    "/psychoactive/deliriant",
    "#references",
  ])("keeps valid internal href %s unchanged", (href) => {
    expect(renderLink(href)).toHaveAttribute("href", href);
  });

  it.each([
    [
      "/summaries/psychedelics/visual",
      "/psychoactive/psychedelic/visual",
    ],
    [
      "/summaries/psychedelics/cognitive",
      "/psychoactive/psychedelic/cognitive",
    ],
    [
      "/summaries/psychedelics/miscellaneous",
      "/psychoactive/psychedelic/miscellaneous",
    ],
    ["/summaries/dissociatives/", "/psychoactive/dissociative"],
    ["/summaries/deliriants/", "/psychoactive/deliriant"],
  ])("routes legacy summary href %s to its curated page", (input, expectedHref) => {
    expect(renderLink(input)).toHaveAttribute("href", expectedHref);
  });

  it("does not rewrite external hrefs passed to the internal link component", () => {
    expect(renderLink("https://example.com/effectsgeometry")).toHaveAttribute(
      "href",
      "https://example.com/effectsgeometry",
    );
  });
});
