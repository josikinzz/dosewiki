import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ExpandButton, ExpandIndicator } from "./ExpandButton";

describe("ExpandButton", () => {
  it("names itself by its expanded state and toggles on click", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(
      <ExpandButton isExpanded={false} onToggle={onToggle} variant="inline" />,
    );

    const collapsed = screen.getByRole("button", { name: /expand section/i });
    expect(collapsed).toHaveAttribute("aria-expanded", "false");
    await user.click(collapsed);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<ExpandButton isExpanded onToggle={onToggle} variant="inline" />);
    expect(screen.getByRole("button", { name: /collapse section/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("shows a descriptive label and wires aria-controls to the disclosed region", () => {
    render(
      <>
        <ExpandButton isExpanded onToggle={vi.fn()} label="Details" ariaControls="details-panel" />
        <div id="details-panel">Panel</div>
      </>,
    );

    const button = screen.getByRole("button", { name: /collapse section/i });
    expect(button).toHaveTextContent("Details");
    expect(button).toHaveAttribute("aria-controls", "details-panel");
  });

  it("lets a caller override the accessible name", () => {
    render(
      <ExpandButton isExpanded={false} onToggle={vi.fn()} variant="card" ariaLabel="Show binding sites" />,
    );

    expect(screen.getByRole("button", { name: "Show binding sites" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
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
