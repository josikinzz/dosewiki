import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupRenderAdapters,
  renderWithTestAdapters,
  resetBrowserAdapters,
} from "@/test/adapters";

import { GlobalSearch, LIVE_RESULTS_SETTLE_MS } from "./GlobalSearch";

describe("GlobalSearch live results hardening", () => {
  beforeEach(() => {
    resetBrowserAdapters();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupRenderAdapters();
    resetBrowserAdapters();
    vi.useRealTimers();
  });

  it("commits a settled live search query even when route chrome is already optimistic", async () => {
    const onNavigate = vi.fn();
    const onReplaceNavigate = vi.fn();

    const rendered = renderWithTestAdapters(
      <GlobalSearch
        currentView={{ type: "search", query: "d" }}
        onNavigate={onNavigate}
        onReplaceNavigate={onReplaceNavigate}
        liveResultsMode
      />,
    );

    const input = screen.getByRole("searchbox", { name: /search the library/i });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "dm" } });

    rendered.rerender(
      <GlobalSearch
        currentView={{ type: "search", query: "dm" }}
        onNavigate={onNavigate}
        onReplaceNavigate={onReplaceNavigate}
        liveResultsMode
      />,
    );

    expect(input).toHaveValue("dm");
    expect(onReplaceNavigate).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(LIVE_RESULTS_SETTLE_MS - 1);
    });

    expect(onReplaceNavigate).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(onReplaceNavigate).toHaveBeenCalledWith({ type: "search", query: "dm" });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
