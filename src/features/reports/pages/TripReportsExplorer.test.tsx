import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

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

describe("TripReportsExplorer", () => {
  it("renders every report without progressive pagination", () => {
    const reports = Array.from({ length: 30 }, (_, index) => reportCard(index + 1));

    render(<TripReportsExplorer reports={reports} />);

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
});
