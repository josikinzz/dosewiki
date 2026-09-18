import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDirtyGuard, type DirtyGuardCopy } from "./useDirtyGuard";

function Harness({ dirty, proceed, options }: { dirty: boolean; proceed: () => void; options?: DirtyGuardCopy }) {
  const { guard, dialog } = useDirtyGuard(dirty, options);
  return (
    <>
      <button type="button" onClick={() => guard(proceed)}>
        Open other
      </button>
      {dialog}
    </>
  );
}

describe("useDirtyGuard", () => {
  it("runs proceed at once when the draft is clean", () => {
    const proceed = vi.fn();
    render(<Harness dirty={false} proceed={proceed} />);
    fireEvent.click(screen.getByRole("button", { name: "Open other" }));
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("blocks when dirty until Discard changes, and Keep editing cancels", async () => {
    const proceed = vi.fn();
    render(<Harness dirty proceed={proceed} />);

    fireEvent.click(screen.getByRole("button", { name: "Open other" }));
    let dialog = await screen.findByRole("dialog", { name: "Discard unsaved changes?" });
    expect(proceed).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(proceed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open other" }));
    dialog = await screen.findByRole("dialog", { name: "Discard unsaved changes?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard changes" }));
    expect(proceed).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the draft open on failed persistence and navigates only after a successful save", async () => {
    const proceed = vi.fn();
    const save = vi.fn().mockRejectedValueOnce(new Error("Draft storage is unavailable")).mockResolvedValueOnce(undefined);
    render(<Harness dirty proceed={proceed} options={{ onSave: save }} />);
    fireEvent.click(screen.getByRole("button", { name: "Open other" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save draft and continue" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(proceed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save draft and continue" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it("asks before the page unloads only while dirty", () => {
    const { rerender } = render(<Harness dirty proceed={() => {}} />);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    rerender(<Harness dirty={false} proceed={() => {}} />);
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });
});
