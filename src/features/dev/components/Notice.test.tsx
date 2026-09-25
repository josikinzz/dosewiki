import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NOTICE_AUTO_CLEAR_MS, Notice, type NoticePlacement, type NoticeTone } from "./Notice";

function Harness({ tone, placement }: { tone: NoticeTone; placement: NoticePlacement }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <Notice tone={tone} placement={placement} dismiss={() => setOpen(false)}>
      {tone === "danger" ? "The save failed." : "Saved."}
    </Notice>
  ) : (
    <p>Cleared</p>
  );
}

describe("Notice", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each<NoticePlacement>(["page", "inline"])("announces only errors as alerts (%s)", (placement) => {
    const { rerender } = render(<Notice tone="loading" placement={placement}>Loading the article</Notice>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Loading the article");

    for (const tone of ["neutral", "info", "success", "warning"] as const) {
      rerender(<Notice tone={tone} placement={placement}>Status text</Notice>);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    }

    rerender(<Notice tone="danger" placement={placement}>The save failed.</Notice>);
    expect(screen.getByRole("alert")).toHaveTextContent("The save failed.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each<NoticePlacement>(["page", "inline"])("keeps an error until it is dismissed (%s)", async (placement) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness tone="danger" placement={placement} />);

    act(() => {
      vi.advanceTimersByTime(NOTICE_AUTO_CLEAR_MS * 5);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("The save failed.");

    await user.click(screen.getByRole("button", { name: "Dismiss notice" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Cleared")).toBeInTheDocument();
  });

  it.each<NoticePlacement>(["page", "inline"])("clears a success on its own (%s)", (placement) => {
    vi.useFakeTimers();
    render(<Harness tone="success" placement={placement} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");

    act(() => {
      vi.advanceTimersByTime(NOTICE_AUTO_CLEAR_MS);
    });
    expect(screen.getByText("Cleared")).toBeInTheDocument();
  });

  it("keeps a success that carries an action, so the button does not vanish under the pointer", () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    render(
      <Notice tone="success" dismiss={dismiss} actions={<button type="button">View proposal</button>}>
        Submitted.
      </Notice>,
    );

    act(() => {
      vi.advanceTimersByTime(NOTICE_AUTO_CLEAR_MS * 5);
    });
    expect(dismiss).not.toHaveBeenCalled();
  });
});
