import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExpandButton, ExpandIndicator } from "./ExpandButton";

describe("ExpandButton", () => {
  it("keeps inline icon controls free of nested pill container styling", () => {
    render(<ExpandButton isExpanded={false} onToggle={vi.fn()} variant="inline" />);

    const button = screen.getByRole("button", { name: /expand section/i });
    expect(button).not.toHaveClass("theme-control-pill");
    expect(button).not.toHaveClass("theme-control-pill-quiet");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps floating controls on the primary semantic recipe", () => {
    render(<ExpandButton isExpanded onToggle={vi.fn()} label="Details" />);

    const button = screen.getByRole("button", { name: /collapse section/i });
    expect(button).toHaveClass("theme-control-pill");
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps card controls on the quiet contained recipe", () => {
    render(<ExpandButton isExpanded={false} onToggle={vi.fn()} variant="card" />);

    const button = screen.getByRole("button", { name: /expand section/i });
    expect(button).toHaveClass("theme-control-pill-quiet");
  });

  it("renders count controls without an ellipsis icon", () => {
    const { container } = render(
      <ExpandButton isExpanded={false} onToggle={vi.fn()} variant="count" count={3} />,
    );

    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(container.querySelector("[data-expand-indicator]")).not.toBeInTheDocument();
  });

  it("renders expanded count controls with a minus count", () => {
    render(
      <ExpandButton isExpanded onToggle={vi.fn()} variant="count" count={3} />,
    );

    expect(screen.getByRole("button", { name: /collapse section/i })).toHaveTextContent(
      "-3",
    );
  });

  it("renders contextual content inside count controls", () => {
    render(
      <ExpandButton isExpanded={false} onToggle={vi.fn()} variant="count" count={9}>
        <span>Receptor Affinities</span>
      </ExpandButton>,
    );

    expect(screen.getByRole("button", { name: /expand section/i })).toHaveTextContent(
      "Receptor Affinities+9",
    );
  });

  it("provides a non-button indicator for expandable rows", () => {
    const { container } = render(<ExpandIndicator isExpanded />);

    expect(container.querySelector("button")).not.toBeInTheDocument();
    expect(container.querySelector("[data-expand-indicator]")).toBeInTheDocument();
  });
});
