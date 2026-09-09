import { render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

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

function shelf(name: string): HTMLElement {
  const section = screen.getByRole("heading", { level: 2, name }).closest("section");
  if (!section) {
    throw new Error(`No shelf rendered for ${name}`);
  }
  return section as HTMLElement;
}

async function chooseSort(user: UserEvent, label: string) {
  await user.click(screen.getByRole("button", { name: /^Sort order/ }));
  await user.click(screen.getByRole("menuitemradio", { name: label }));
}

/**
 * Grouping is a labelled menu now, not a tab strip: choosing an axis is open
 * the trigger, pick the row, which is where the names live at every width.
 */
async function chooseGrouping(user: UserEvent, label: string) {
  await user.click(screen.getByRole("button", { name: /^Group by/ }));
  await user.click(screen.getByRole("menuitemradio", { name: label }));
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

beforeEach(() => {
  window.history.replaceState({}, "", "/reports");
});

describe("TripReportsExplorer", () => {
  it("renders a routed grouping as the first selected view", () => {
    render(
      <TripReportsExplorer
        reports={[reportCard(1), reportCard(2)]}
        initialView="author"
      />,
    );

    expect(screen.getByRole("button", { name: "Group by: By author" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Author 1" })).toBeInTheDocument();
  });

  it("renders every report in its shelf without progressive pagination", () => {
    const reports = Array.from({ length: 30 }, (_, index) => reportCard(index + 1));

    render(<TripReportsExplorer reports={reports} />);

    expect(
      screen.getByRole("button", { name: /^Group by/ }).closest("[data-nosnippet]"),
    ).toBeInTheDocument();
    expect(within(shelf("DMT")).getAllByRole("listitem")).toHaveLength(30);
    expect(within(shelf("DMT")).getByRole("link", { name: /report 30/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show .* reports/i })).not.toBeInTheDocument();
  });

  it("states each shelf's report count next to its heading", () => {
    const reports = Array.from({ length: 4 }, (_, index) => reportCard(index + 1));

    render(<TripReportsExplorer reports={reports} />);

    expect(shelf("DMT")).toHaveTextContent("4");
  });

  it("groups the title view by initial so the index keeps a document outline", async () => {
    const user = userEvent.setup();
    const reports = [reportCard(1), reportCard(2)];

    render(<TripReportsExplorer reports={reports} />);

    await chooseGrouping(user, "By title");
    expect(window.location.pathname).toBe("/reports/group/title");

    expect(within(shelf("R")).getAllByRole("listitem")).toHaveLength(2);
  });

  it("orders shelves by report count when that sort is chosen", async () => {
    const user = userEvent.setup();
    const reports = [
      { ...reportCard(1), substances: [{ name: "LSD" }] },
      { ...reportCard(2), substances: [{ name: "DMT" }] },
      { ...reportCard(3), substances: [{ name: "DMT" }] },
    ];

    render(<TripReportsExplorer reports={reports} />);

    const headingNames = () =>
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

    expect(headingNames()).toEqual(["Report highlights", "DMT", "LSD"]);

    await chooseSort(user, "Fewest reports first");
    expect(headingNames()).toEqual(["Report highlights", "LSD", "DMT"]);

    await chooseSort(user, "Most reports first");
    expect(headingNames()).toEqual(["Report highlights", "DMT", "LSD"]);
  });

  it("prints the dose the payload has always carried", () => {
    render(
      <TripReportsExplorer
        reports={[
          {
            ...reportCard(1),
            substances: [{ name: "DMT", dose: "40 mg", roa: "Vaporized" }],
          },
        ]}
      />,
    );

    expect(within(shelf("DMT")).getByRole("listitem")).toHaveTextContent("40 mg");
  });

  it("normalizes the free-text trip date instead of printing it raw", () => {
    render(
      <TripReportsExplorer
        reports={[{ ...reportCard(1), subject: { name: "Author", trip_date: "~2012" } }]}
      />,
    );

    const row = within(shelf("DMT")).getByRole("listitem");
    expect(row).toHaveTextContent("around 2012");
    expect(row).not.toHaveTextContent("~2012");
  });

  it("keeps the empty state", () => {
    render(<TripReportsExplorer reports={[]} />);

    expect(
      screen.getByRole("heading", { name: "No trip reports found" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Group by/ })).not.toBeInTheDocument();
  });

  it("offers every substance with reports as a listbox option and narrows them by search", async () => {
    const user = userEvent.setup();
    const reports = [
      { ...reportCard(1), substances: [{ name: "LSD" }] },
      { ...reportCard(2), substances: [{ name: "DMT" }] },
      { ...reportCard(3), substances: [{ name: "DMT" }, { name: "Cannabis" }] },
    ];

    render(<TripReportsExplorer reports={reports} />);

    await user.click(screen.getByRole("button", { name: "Filter by substance" }));

    const picker = screen.getByRole("listbox", { name: "Substances with reports" });
    expect(within(picker).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Cannabis1",
      "DMT2",
      "LSD1",
    ]);

    const search = screen.getByRole("combobox", { name: "Search substances" });
    await user.type(search, "dm");
    expect(within(picker).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "DMT2",
    ]);

    await user.clear(search);
    await user.type(search, "ketamine");
    expect(screen.getByText("No substances match.")).toBeInTheDocument();
  });

  it("carries the substance filter in the URL and restores the index on clear", async () => {
    const user = userEvent.setup();
    const reports = [
      { ...reportCard(1), substances: [{ name: "LSD" }] },
      { ...reportCard(2), substances: [{ name: "DMT" }] },
      { ...reportCard(3), substances: [{ name: "DMT" }, { name: "Cannabis" }] },
    ];

    render(<TripReportsExplorer reports={reports} />);

    await user.click(screen.getByRole("button", { name: "Filter by substance" }));
    await user.click(screen.getByRole("option", { name: /DMT/ }));

    expect(window.location.search).toBe("?substance=DMT");
    expect(screen.queryByRole("link", { name: /report 01/i })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("2 of 3");

    // The filter survives view-mode changes.
    await chooseGrouping(user, "By author");
    expect(screen.getByRole("status")).toHaveTextContent("2 of 3");
    expect(window.location.search).toBe("?substance=DMT");

    await user.click(screen.getByRole("button", { name: "Clear substance filter, DMT" }));

    expect(window.location.search).toBe("");
    expect(screen.getByRole("button", { name: "Filter by substance" })).toBeInTheDocument();
    expect(
      within(shelf("Author 1")).getByRole("link", { name: /report 01/i }),
    ).toBeInTheDocument();
  });

  it("searches titles, authors and substances, and offers a way out of no results", async () => {
    const user = userEvent.setup();
    const reports = [reportCard(1), reportCard(2), reportCard(3)];

    render(<TripReportsExplorer reports={reports} />);

    await user.type(screen.getByRole("searchbox", { name: "Search these reports" }), "report 02");
    expect(window.location.search).toBe("?q=report+02");
    expect(within(shelf("DMT")).getAllByRole("listitem")).toHaveLength(1);

    await user.clear(screen.getByRole("searchbox", { name: "Search these reports" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Search these reports" }),
      "nothing here",
    );

    expect(screen.getByRole("heading", { level: 2, name: "No reports match" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(within(shelf("DMT")).getAllByRole("listitem")).toHaveLength(3);
  });

  it("leads the band with what arrived most recently, and swaps to the curated list", async () => {
    const user = userEvent.setup();
    const reports = [
      {
        ...reportCard(1),
        title: "Chosen years ago",
        featured: true,
        publishedAt: "2019-01-01T00:00:00.000Z",
      },
      {
        ...reportCard(2),
        title: "Arrived last week",
        publishedAt: "2026-09-01T00:00:00.000Z",
      },
    ];

    render(<TripReportsExplorer reports={reports} />);

    const band = () => screen.getByRole("tabpanel");
    expect(screen.getByRole("tab", { name: "Recently added" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The whole point: a curated report cannot hold the first slot against a
    // newer arrival, which is what the featured-first band always did.
    expect(within(band()).getAllByRole("link").map((link) => link.textContent?.trim())[0]).toContain(
      "Arrived last week",
    );

    await user.click(screen.getByRole("tab", { name: "Featured" }));
    const featuredLinks = within(band()).getAllByRole("link").map((link) => link.textContent);
    expect(featuredLinks.some((text) => text?.includes("Chosen years ago"))).toBe(true);
    expect(featuredLinks.some((text) => text?.includes("Arrived last week"))).toBe(false);
  });

  it("hides the curated tab when nothing is curated", () => {
    render(<TripReportsExplorer reports={[reportCard(1), reportCard(2)]} />);

    expect(screen.queryByRole("tab", { name: "Featured" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Recently added" })).toBeInTheDocument();
  });

  it("offers the invitation beside the reports, not only at the end of the index", () => {
    render(<TripReportsExplorer reports={[reportCard(1)]} />);

    const invitation = within(screen.getByRole("tabpanel")).getByRole("link", {
      name: /submit a report/i,
    });
    expect(invitation).toHaveAttribute("href", "/reports/submit");
    // The reassurance that answers the actual fear used to live only behind
    // the click.
    expect(invitation).toHaveTextContent("Stays private until an editor approves it.");
  });
});
