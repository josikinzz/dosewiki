import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IntLink, normalizeInternalPath } from "./IntLink";

function renderLink(to: string | undefined) {
  render(<IntLink to={to}>Target link</IntLink>);

  return screen.getByRole("link", { name: "Target link" });
}

describe("IntLink", () => {
  it.each([
    ["/effectsgeometry", "/effects/geometry"],
    ["/effectsinternal-hallucination", "/effects/internal-hallucination"],
    ["/categories/geometric-patterns", "/effects/category/geometric-patterns"],
    // Legacy per-class routes now point at server-routed index/detail pages.
    ["/psychoactive/psychedelic", "/substances/group/psychedelic"],
    ["/psychoactive/stimulant", "/substances/group/stimulant"],
    ["/summaries/psychedelics", "/substances/group/psychedelic"],
    ["/chemical/tryptamine", "/chemical-classes/tryptamine"],
    ["effectsgeometry", "/effects/geometry"],
    // Doubled prefix, as the dissociative intensity scale authors five of its links.
    ["/effects/effects/scenery-slicing", "/effects/scenery-slicing"],
    ["/effects/effects/effects/tactile-suppression", "/effects/tactile-suppression"],
    // `/substances/` with no slug is the index; it used to collapse to the home page.
    ["/substances/", "/substances"],
    ["/substances", "/substances"],
    ["/substances/lsd", "/lsd"],
    ["/dxm", "/dextromethorphan"],
    ["/effects/acuity-enhancement", "/effects/visual-acuity-enhancement"],
    ["/effects/category/effects", "/effects"],
    ["/effects/category/visual-enhancements", "/effects/category/visual-amplifications"],
    ["/effects/diffraction-spikes", "/effects/diffraction"],
    ["/effects/memory-suppressionShort", "/effects/memory-suppression"],
    ["/effects/stimulating", "/effects/stimulation"],
    ["/effects/suggestibility-enhancement", "/effects/increased-suggestibility"],
    ["/effects/sweating", "/effects/increased-perspiration"],
    ["/profiles/Josie", "/contributors/josie"],
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

  it("repairs an external URL authored with a leading slash", () => {
    expect(renderLink("/https://en.wikipedia.org/wiki/Turing_test")).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Turing_test",
    );
  });

  it.each([
    "/effects/pattern-recognition-enhancement",
    "/effects/pattern-recognition-suppression",
    "/effects/psychedelic-therapy",
  ])("renders known missing internal targets as text instead of broken links", (to) => {
    render(<IntLink to={to}>Missing target</IntLink>);

    expect(screen.getByText("Missing target").closest("a")).toBeNull();
  });

  it("preserves the /substances redirect the flattening rewrite used to defeat", () => {
    // `/substances/dxm` flattened to `/dxm`, which 404s: no substance article
    // claims that slug (DoseWiki's is `dextromethorphan`) and the Effect Index
    // article lives at `/articles/dxm`. 30 in-body links depended on this.
    expect(normalizeInternalPath("/substances/dxm")).toBe("/articles/dxm");
    expect(normalizeInternalPath("/substances/dxm/")).toBe("/articles/dxm");
    expect(normalizeInternalPath("/substances/dmt")).toBe("/articles/dmt");
    // A substance that really does own its slug still flattens.
    expect(normalizeInternalPath("/substances/ketamine")).toBe("/ketamine");
  });

  it("corrects subarticle selectors that name something the page does not contain", () => {
    // `memory-suppression` has no subarticles at all, and ego death is its own effect.
    expect(normalizeInternalPath("/effects/memory-suppression?s=ego-death")).toBe(
      "/effects/ego-death",
    );
    expect(normalizeInternalPath("/effectsmemory-suppression?s=physical-auntomy")).toBe(
      "/effects/physical-autonomy",
    );
  });

  it("lower-cases and trims a subarticle selector so the anchor matches", () => {
    expect(normalizeInternalPath("/effects/time-distortion?s=Time-dilation")).toBe(
      "/effects/time-distortion#time-dilation",
    );
  });

});
