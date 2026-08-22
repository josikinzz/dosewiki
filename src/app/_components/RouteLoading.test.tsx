import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  getRouteLoadingModel,
  getSectionLoadingModel,
} from "@server/next/routeLoadingPolicy";
import {
  RouteLoading,
  RouteLoadingSkeleton,
} from "./RouteLoading";

describe("route loading models", () => {
  it("builds named route-family models with labels, density, landmarks, and regions", () => {
    const substance = getRouteLoadingModel("substance");
    const search = getRouteLoadingModel("search");

    expect(substance).toMatchObject({
      family: "substance",
      label: "Loading substance route",
      pendingLabel: "Fetching article sections and safety context",
      density: "spacious",
      landmark: {
        id: "loading-substance",
        role: "section",
        ariaBusy: true,
        ariaLive: "polite",
        focusTarget: false,
      },
    });
    expect(substance.sections).toHaveLength(4);
    expect(getRouteLoadingModel("mechanism").sections.map((section) => section.key)).toEqual([
      "qualifier-chips",
      "active-qualifier",
      "taxonomy-card-a",
      "taxonomy-card-b",
    ]);
    expect(search.sections.map((section) => section.variant)).toEqual(["list", "list", "list"]);
  });

  it("builds section fallback models without a focusable main landmark", () => {
    const model = getSectionLoadingModel({ key: "trip-reports", label: "Loading related reports" });

    expect(model.landmark).toMatchObject({
      id: "trip-reports",
      role: "section",
      ariaBusy: true,
      ariaLive: "polite",
      focusTarget: false,
    });
    expect(model.headingBlocks).toHaveLength(0);
    expect(model.sections).toHaveLength(1);
  });
});

describe("RouteLoading renderer", () => {
  it.each(["page", "substance", "category", "effect", "mechanism", "report", "search"] as const)(
    "renders accessible skeleton regions for %s routes",
    (family) => {
      const model = getRouteLoadingModel(family);

      render(<RouteLoading model={model} />);

      expect(screen.queryByRole("main")).not.toBeInTheDocument();
      const section = screen.getByRole("region", { name: model.label });
      expect(section).toHaveAttribute("aria-busy", "true");
      expect(section).toHaveAttribute("aria-live", "polite");
      expect(section).toHaveAttribute("data-loading-family", family);
      expect(section).toHaveAttribute("data-nosnippet");
      expect(section).toHaveAttribute("id", `loading-${family}`);
      expect(screen.getByText(model.label)).toHaveClass("sr-only");
      expect(screen.getByText(model.pendingLabel).closest("[role='status']")).toHaveClass("sr-only");
      expect(screen.getByText(model.stalledLabel)).toHaveClass("theme-loading-stalled-label");
      expect(document.querySelector(".theme-loading-surface")).toHaveAttribute("data-nosnippet");
      expect(document.querySelectorAll("[data-loading-section]")).toHaveLength(model.sections.length);
      expect(document.querySelector(".motion-reduce\\:animate-none")).toBeInTheDocument();
      expect(document.querySelector(".theme-loading-heading")).toHaveAttribute("aria-hidden", "true");
    },
  );

  it("reserves a scrollport for route fallbacks but not section fallbacks", () => {
    // A fallback no taller than the viewport leaves the document unscrollable,
    // so wheel input during the stream is clamped away and silently lost.
    const { unmount } = render(<RouteLoading model={getRouteLoadingModel("substance")} />);
    const route = screen.getByRole("region", { name: "Loading substance route" });

    expect(route).toHaveAttribute("data-loading-scope", "route");
    expect(route).toHaveClass("min-h-[200vh]");

    unmount();

    render(
      <RouteLoading model={getSectionLoadingModel({ key: "trip-reports", label: "Loading related reports" })} />,
    );
    const section = screen.getByRole("region", { name: "Loading related reports" });

    expect(section).toHaveAttribute("data-loading-scope", "section");
    expect(section).toHaveClass("min-h-[50vh]");
  });

  it("renders section skeletons without adding a main wrapper", () => {
    const model = getSectionLoadingModel({ key: "trip-reports-index", label: "Loading reports", variant: "list" });

    render(<RouteLoadingSkeleton model={model} />);

    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    expect(screen.getByText("Loading reports")).toBeInTheDocument();
    expect(screen.getByText("Still loading. Refresh if this section does not appear.")).toBeInTheDocument();
    expect(document.querySelector(".theme-loading-surface")).toHaveAttribute("data-nosnippet");
    expect(document.querySelector("[data-loading-section='trip-reports-index']")).toHaveAttribute(
      "data-loading-variant",
      "list",
    );
  });
});
