import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoadErrorState } from "./LoadErrorState";

describe("LoadErrorState", () => {
  it("shows the message and calls onRetry from the one retry button", () => {
    const onRetry = vi.fn();
    render(<LoadErrorState message="The contributor list did not load." onRetry={onRetry} />);

    expect(screen.getByText("The contributor list did not load.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("locks the button while a retry is in flight", () => {
    render(<LoadErrorState message="Still loading." onRetry={() => {}} busy />);
    expect(screen.getByRole("button", { name: "Retrying" })).toBeDisabled();
  });
});
