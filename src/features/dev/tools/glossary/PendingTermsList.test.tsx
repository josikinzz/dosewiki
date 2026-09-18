import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PendingTermsList } from "./PendingTermsList";

const terms = Array.from({ length: 9 }, (_, index) => `Term ${index + 1}`);

describe("PendingTermsList", () => {
  it("renders nothing when no term is waiting", () => {
    render(<PendingTermsList terms={[]} />);
    expect(screen.queryByTestId("glossary-pending")).not.toBeInTheDocument();
  });

  it("shows the first eight terms and hides the ninth until expanded", async () => {
    const user = userEvent.setup();
    render(<PendingTermsList terms={terms} />);

    const list = screen.getByTestId("glossary-pending");
    expect(list).toHaveTextContent("Waiting for a retranslate: Term 1, Term 2, Term 3, Term 4, Term 5, Term 6, Term 7, Term 8");
    expect(screen.getByText(/Term 9/)).not.toBeVisible();

    const button = screen.getByRole("button", { name: /expand section/i });
    expect(button).toHaveTextContent("1 more term");
    await user.click(button);

    expect(screen.getByText(/Term 9/)).toBeVisible();
    expect(screen.getByRole("button", { name: /collapse section/i })).toHaveAttribute(
      "aria-controls",
      screen.getByText(/Term 9/).id,
    );
  });

  it("names the remainder count when several terms are folded away", () => {
    render(<PendingTermsList terms={terms} limit={5} />);
    expect(screen.getByRole("button")).toHaveTextContent("4 more terms");
  });

  it("shows every term inline when they fit, with no expand control", () => {
    render(<PendingTermsList terms={terms.slice(0, 3)} />);
    expect(screen.getByTestId("glossary-pending")).toHaveTextContent("Term 1, Term 2, Term 3");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
