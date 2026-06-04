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
  it("renders large report collections progressively and reveals remaining reports on demand", async () => {
    const user = userEvent.setup();
    const reports = Array.from({ length: 30 }, (_, index) => reportCard(index + 1));

    render(<TripReportsExplorer reports={reports} />);

    expect(screen.getAllByRole("link")).toHaveLength(24);
    expect(screen.queryByRole("link", { name: /report 25/i })).not.toBeInTheDocument();
    expect(screen.getByText("Showing 24 of 30 reports")).toBeInTheDocument();

    const revealButton = screen.getByRole("button", { name: /show 6 more reports/i });
    expect(revealButton).toHaveAttribute("aria-expanded", "false");

    await user.click(revealButton);

    expect(screen.getAllByRole("link")).toHaveLength(30);
    expect(screen.getByRole("link", { name: /report 30/i })).toBeInTheDocument();
    expect(screen.getByText("Showing 30 of 30 reports")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /show first 24 reports/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("resets the visible window when users change grouping", async () => {
    const user = userEvent.setup();
    const reports = Array.from({ length: 30 }, (_, index) => reportCard(index + 1));

    render(<TripReportsExplorer reports={reports} />);

    await user.click(screen.getByRole("button", { name: /show 6 more reports/i }));
    expect(screen.getAllByRole("link")).toHaveLength(30);

    await user.click(screen.getByRole("tab", { name: /title/i }));

    expect(screen.getAllByRole("link")).toHaveLength(24);
    expect(screen.queryByRole("link", { name: /report 25/i })).not.toBeInTheDocument();
    expect(screen.getByText("Showing 24 of 30 reports")).toBeInTheDocument();
  });

  it("keeps the empty state without progressive controls", () => {
    render(<TripReportsExplorer reports={[]} />);

    expect(
      screen.getByRole("heading", { name: "No trip reports found" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Showing \d+ of \d+ reports/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show .* reports/i })).not.toBeInTheDocument();
  });
});
