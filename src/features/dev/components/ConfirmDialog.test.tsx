import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useConfirm } from "./ConfirmDialog";

function Harness({ onConfirm, affected }: { onConfirm: () => void; affected?: string[] }) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          confirm({
            title: "Reject this report?",
            description: "The author will not be told why.",
            confirmLabel: "Reject",
            destructive: true,
            affected,
            onConfirm,
          })
        }
      >
        Reject
      </button>
      {dialog}
    </>
  );
}

describe("useConfirm / ConfirmDialog", () => {
  it("runs onConfirm only after the confirm button, and not on cancel", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    let dialog = await screen.findByRole("dialog", { name: "Reject this report?" });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    dialog = await screen.findByRole("dialog", { name: "Reject this report?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("lists the first eight affected rows and counts the rest", async () => {
    const affected = Array.from({ length: 11 }, (_, index) => `row-${index + 1}`);
    render(<Harness onConfirm={() => {}} affected={affected} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await screen.findByRole("dialog");

    expect(screen.getByText("row-8")).toBeInTheDocument();
    expect(screen.queryByText("row-9")).not.toBeInTheDocument();
    expect(screen.getByText("and 3 more")).toBeInTheDocument();
  });
});
