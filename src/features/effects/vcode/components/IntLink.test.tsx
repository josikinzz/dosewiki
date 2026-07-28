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
  ])("normalizes malformed rich-content href %s", (input, expectedHref) => {
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
