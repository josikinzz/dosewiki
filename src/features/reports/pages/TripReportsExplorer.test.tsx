import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";

import type { ReportCardModel } from "@/types/tripReport";
import { TripReportsExplorer } from "./TripReportsExplorer";

function reportCard(index: number): ReportCardModel {
  const paddedIndex = index.toString().padStart(2, "0");

  return {
    slug: `report-${paddedIndex}`,
    title: `Report ${paddedIndex}`,
    featured: false,
    subject: {
      name: `Author ${index % 3}`,
      trip_date: `2026-04-${paddedIndex}`,
    },
    substances: [{ name: "DMT" }],
  };
}

// The substance picker is a Radix popper-positioned popover; it measures its
// anchor and manages pointer focus, and jsdom has neither.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => {} },
    releasePointerCapture: { configurable: true, value: () => {} },
    scrollIntoView: { configurable: true, value: () => {} },
  });
});

describe("TripReportsExplorer", () => {
  it("renders every report without progressive pagination", () => {
    const reports = Array.from({ length: 30 }, (_, index) => reportCard(index + 1));

    render(<TripReportsExplorer reports={reports} />);

    expect(
      screen.getByRole("tablist", { name: "Trip report grouping" }).closest("[data-nosnippet]"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Sort order" }).closest("[data-nosnippet]"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(30);
    expect(screen.getByRole("link", { name: /report 30/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show .* reports/i })).not.toBeInTheDocument();
  });

  it("keeps every report visible when users change grouping", async () => {
    const user = userEvent.setup();
    const reports = Array.from({ length: 30 }, (_, index) => reportCard(index + 1));

    render(<TripReportsExplorer reports={reports} />);

    await user.click(screen.getByRole("tab", { name: /title/i }));

    expect(screen.getAllByRole("link")).toHaveLength(30);
    expect(screen.getByRole("link", { name: /report 30/i })).toBeInTheDocument();
  });

  it("sorts groups by report count when the count control is selected", async () => {
    const user = userEvent.setup();
    const reports = [
      { ...reportCard(1), substances: [{ name: "LSD" }] },
      { ...reportCard(2), substances: [{ name: "DMT" }] },
      { ...reportCard(3), substances: [{ name: "DMT" }] },
    ];

    render(<TripReportsExplorer reports={reports} />);

    let headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["DMT", "LSD"]);

    // Count sort defaults to most-reports-first.
    await user.click(screen.getByRole("button", { name: /report count/i }));
    headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["DMT", "LSD"]);

    // Clicking again flips to fewest-first.
    await user.click(screen.getByRole("button", { name: /report count/i }));
    headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["LSD", "DMT"]);
  });

  it("keeps the empty state", () => {
    render(<TripReportsExplorer reports={[]} />);

    expect(
      screen.getByRole("heading", { name: "No trip reports found" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show .* reports/i })).not.toBeInTheDocument();
  });

  it("lists exactly the substances with reports and narrows them by search", async () => {
    const user = userEvent.setup();
    const reports = [
      { ...reportCard(1), substances: [{ name: "LSD" }] },
      { ...reportCard(2), substances: [{ name: "DMT" }] },
      { ...reportCard(3), substances: [{ name: "DMT" }, { name: "Cannabis" }] },
    ];

    render(<TripReportsExplorer reports={reports} />);

    await user.click(screen.getByRole("button", { name: "Filter by substance" }));

    const picker = screen.getByRole("dialog");
    let options = within(picker).getAllByRole("button");
    expect(options.map((option) => option.textContent)).toEqual([
      "Cannabis1",
      "DMT2",
      "LSD1",
    ]);

    await user.type(within(picker).getByRole("searchbox", { name: "Search substances" }), "dm");

    options = within(picker).getAllByRole("button");
    expect(options.map((option) => option.textContent)).toEqual(["DMT2"]);

    await user.clear(within(picker).getByRole("searchbox", { name: "Search substances" }));
    await user.type(
      within(picker).getByRole("searchbox", { name: "Search substances" }),
      "ketamine",
    );
    expect(within(picker).getByText("No substances match.")).toBeInTheDocument();
  });

  it("filters every view by the selected substance and restores on clear", async () => {
    const user = userEvent.setup();
    const reports = [
      { ...reportCard(1), substances: [{ name: "LSD" }] },
      { ...reportCard(2), substances: [{ name: "DMT" }] },
      { ...reportCard(3), substances: [{ name: "DMT" }, { name: "Cannabis" }] },
    ];

    render(<TripReportsExplorer reports={reports} />);

    await user.click(screen.getByRole("button", { name: "Filter by substance" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /DMT/ }));

    // Substance view keeps the single-substance group plus combinations.
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /report 01/i })).toBeNull();

    // The filter survives view-mode changes.
    await user.click(screen.getByRole("tab", { name: /title/i }));
    expect(screen.getAllByRole("link")).toHaveLength(2);
    await user.click(screen.getByRole("tab", { name: /author/i }));
    expect(screen.getAllByRole("link")).toHaveLength(2);

    // The chip wears the active substance; the sibling pill clears in one click.
    expect(
      screen.getByRole("button", { name: "Substance filter, DMT active" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear substance filter, DMT" }));

    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Filter by substance" })).toBeInTheDocument();
  });
});
