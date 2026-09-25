import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { useConfirm } from "./ConfirmDialog";
import { useTriageShortcuts, type TriageShortcutHandlers } from "./useTriageShortcuts";

function Harness(handlers: TriageShortcutHandlers) {
  const { helpDialog } = useTriageShortcuts(handlers);
  const { confirm, dialog } = useConfirm();
  return (
    <div>
      <label>
        Note
        <textarea />
      </label>
      <button
        type="button"
        onClick={() => confirm({ title: "Sure?", description: "Check.", confirmLabel: "Yes", onConfirm: () => {} })}
      >
        Ask
      </button>
      {helpDialog}
      {dialog}
    </div>
  );
}

function handlers() {
  return {
    onMove: vi.fn(),
    onAccept: vi.fn(),
    onReject: vi.fn(),
    onSpam: vi.fn(),
    onNote: vi.fn(),
    onUndo: vi.fn(),
  };
}

describe("useTriageShortcuts", () => {
  it("maps j, k, a, r, s, n and u to their handlers", async () => {
    const user = userEvent.setup();
    const spies = handlers();
    render(<Harness {...spies} />);

    await user.keyboard("jkarsnu");
    expect(spies.onMove.mock.calls).toEqual([[1], [-1]]);
    expect(spies.onAccept).toHaveBeenCalledTimes(1);
    expect(spies.onReject).toHaveBeenCalledTimes(1);
    expect(spies.onSpam).toHaveBeenCalledTimes(1);
    expect(spies.onNote).toHaveBeenCalledTimes(1);
    expect(spies.onUndo).toHaveBeenCalledTimes(1);
  });

  it("never fires while typing in a field", async () => {
    const user = userEvent.setup();
    const spies = handlers();
    render(<Harness {...spies} />);

    await user.type(screen.getByLabelText("Note"), "jars");
    expect(screen.getByLabelText("Note")).toHaveValue("jars");
    expect(spies.onMove).not.toHaveBeenCalled();
    expect(spies.onAccept).not.toHaveBeenCalled();
    expect(spies.onReject).not.toHaveBeenCalled();
  });

  it("never fires while a dialog is open", async () => {
    const user = userEvent.setup();
    const spies = handlers();
    render(<Harness {...spies} />);

    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByRole("dialog", { name: "Sure?" });
    fireEvent.keyDown(document.body, { key: "a" });
    expect(spies.onAccept).not.toHaveBeenCalled();
  });

  it("skips a key another handler already took, and keys with a modifier", () => {
    const spies = handlers();
    render(<Harness {...spies} />);
    const event = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    event.preventDefault();
    window.dispatchEvent(event);
    expect(spies.onAccept).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "a", metaKey: true });
    expect(spies.onAccept).not.toHaveBeenCalled();
  });

  it("lists only the bound keys under ?", async () => {
    const user = userEvent.setup();
    render(<Harness onMove={vi.fn()} onAccept={vi.fn()} labels={{ accept: "Resolve" }} />);

    await user.keyboard("?");
    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByText("Resolve")).toBeInTheDocument();
    expect(within(dialog).getByText("j / k")).toBeInTheDocument();
    expect(within(dialog).queryByText("Mark as spam")).not.toBeInTheDocument();
  });
});
