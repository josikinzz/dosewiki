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
    ["/psychoactive/psychedelics/visual", "/psychoactive/psychedelic"],
    ["/summaries/psychedelics", "/psychoactive/psychedelic"],
    ["effectsgeometry", "/effects/geometry"],
  ])("normalizes malformed rich-content href %s", (input, expectedHref) => {
    expect(renderLink(input)).toHaveAttribute("href", expectedHref);
  });

  it.each([
    "/effects/geometry",
    "/effects/internal-hallucination",
    "/effects/category/geometric-patterns",
    "/category/psychedelic",
    "/psychoactive/psychedelic",
    "#references",
  ])("keeps valid internal href %s unchanged", (href) => {
    expect(renderLink(href)).toHaveAttribute("href", href);
  });

  it("does not rewrite external hrefs passed to the internal link component", () => {
    expect(renderLink("https://example.com/effectsgeometry")).toHaveAttribute(
      "href",
      "https://example.com/effectsgeometry",
    );
  });
});
