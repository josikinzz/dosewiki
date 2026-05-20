import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDevModeSaveNotices } from "./useDevModeSaveNotices";

describe("useDevModeSaveNotices", () => {
  it("adapts save notices onto independent lifecycle channels", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useDevModeSaveNotices());

    act(() => {
      result.current.setGithubNotice(
        { type: "success", message: "Committed changes to GitHub." },
        { clearAfterMs: 5000 },
      );
      result.current.setConvexNotice({ type: "pending", message: "Saving to Convex..." });
    });

    expect(result.current.githubNotice).toEqual({
      type: "success",
      message: "Committed changes to GitHub.",
      actionHref: undefined,
      actionLabel: undefined,
    });
    expect(result.current.convexNotice).toEqual({
      type: "pending",
      message: "Saving to Convex...",
      actionHref: undefined,
      actionLabel: undefined,
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.githubNotice).toBeNull();
    expect(result.current.convexNotice?.message).toBe("Saving to Convex...");

    unmount();
    vi.useRealTimers();
  });
});

