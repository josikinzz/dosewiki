import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripReportsPage } from "./TripReportsPage";

describe("TripReportsPage", () => {
  it("owns the skip-link main landmark", () => {
    render(<TripReportsPage reports={[]} />);

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });
});
