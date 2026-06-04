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
        id: "main-content",
        role: "main",
        ariaBusy: true,
        ariaLive: "polite",
        focusTarget: true,
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

      const main = screen.getByRole("main");
      expect(main).toHaveAttribute("aria-busy", "true");
      expect(main).toHaveAttribute("aria-live", "polite");
      expect(main).toHaveAttribute("data-loading-family", family);
      expect(screen.getByText(model.label)).toBeInTheDocument();
      expect(screen.getByText(model.pendingLabel)).toBeInTheDocument();
      expect(screen.getByText(model.stalledLabel)).toHaveClass("theme-loading-stalled-label");
      expect(document.querySelectorAll("[data-loading-section]")).toHaveLength(model.sections.length);
      expect(document.querySelector(".motion-reduce\\:animate-none")).toBeInTheDocument();
    },
  );

  it("renders section skeletons without adding a main wrapper", () => {
    const model = getSectionLoadingModel({ key: "trip-reports-index", label: "Loading reports", variant: "list" });

    render(<RouteLoadingSkeleton model={model} />);

    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    expect(screen.getByText("Loading reports")).toBeInTheDocument();
    expect(screen.getByText("Still loading. Refresh if this section does not appear.")).toBeInTheDocument();
    expect(document.querySelector("[data-loading-section='trip-reports-index']")).toHaveAttribute(
      "data-loading-variant",
      "list",
    );
  });
});
