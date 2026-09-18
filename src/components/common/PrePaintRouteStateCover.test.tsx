import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  dismissPrePaintRouteStateCover,
  PrePaintRouteStateCover,
} from "./PrePaintRouteStateCover";

describe("PrePaintRouteStateCover", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-prepaint-route-state");
  });

  it("ships a synchronous route-scoped reveal before the hidden cover", () => {
    const { container } = render(
      <PrePaintRouteStateCover
        id="effect-index-legacy"
        legacyHashes={["cognitive"]}
        queryKeys={["view"]}
      />,
    );

    const cover = container.querySelector(
      '[data-prepaint-route-cover="effect-index-legacy"]',
    );
    const script = container.querySelector("script");
    expect(cover).toHaveClass("hidden");
    expect(script?.textContent).toContain("cognitive");
    expect(script?.textContent).toContain("view");
  });

  it("dismisses only the cover that owns the active reveal flag", () => {
    document.documentElement.setAttribute(
      "data-prepaint-route-state",
      "replications-gallery-browse",
    );

    dismissPrePaintRouteStateCover("effect-index-legacy");
    expect(document.documentElement).toHaveAttribute(
      "data-prepaint-route-state",
      "replications-gallery-browse",
    );

    dismissPrePaintRouteStateCover("replications-gallery-browse");
    expect(document.documentElement).not.toHaveAttribute(
      "data-prepaint-route-state",
    );
  });
});
