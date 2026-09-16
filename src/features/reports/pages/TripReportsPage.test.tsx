import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripReportsPage } from "./TripReportsPage";

describe("TripReportsPage", () => {
  it("owns the skip-link main landmark", () => {
    render(<TripReportsPage browsingPage={{ groups: [], groupFacets: [], nextCursor: null, total: 0, filteredTotal: 0, authorCount: 0, substanceOptions: [], featured: [], recentlyAdded: [] }} />);

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });
});
