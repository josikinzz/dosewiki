import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExpandButton } from "./ExpandButton";

describe("ExpandButton", () => {
  it("uses semantic control recipes for icon-only compact controls", () => {
    render(<ExpandButton isExpanded={false} onToggle={vi.fn()} variant="compact" />);

    const button = screen.getByRole("button", { name: /expand section/i });
    expect(button).toHaveClass("theme-control-pill-quiet");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps pill controls on the primary semantic recipe", () => {
    render(<ExpandButton isExpanded onToggle={vi.fn()} label="Details" />);

    const button = screen.getByRole("button", { name: /collapse section/i });
    expect(button).toHaveClass("theme-control-pill");
    expect(button).toHaveAttribute("aria-expanded", "true");
  });
});
