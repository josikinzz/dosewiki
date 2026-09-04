import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useScrollToDetail } from "./useScrollToDetail";

const BELOW_QUERY = "(max-width: 1023px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function stubMatchMedia(matching: Record<string, boolean>) {
  window.matchMedia = vi.fn((query: string) => ({ matches: matching[query] ?? false })) as unknown as typeof window.matchMedia;
}

function renderScroll(initialKey: string | null) {
  const element = document.createElement("div");
  const scrollIntoView = vi.fn();
  element.scrollIntoView = scrollIntoView;
  const ref = { current: element };
  const hook = renderHook(({ key }) => useScrollToDetail(ref, key, BELOW_QUERY), {
    initialProps: { key: initialKey },
  });
  return { ...hook, scrollIntoView };
}

describe("useScrollToDetail", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scrolls the detail into view when the selection changes below the breakpoint", () => {
    stubMatchMedia({ [BELOW_QUERY]: true });
    const { rerender, scrollIntoView } = renderScroll(null);

    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender({ key: "lsd" });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("does not scroll when the selection is cleared or unchanged", () => {
    stubMatchMedia({ [BELOW_QUERY]: true });
    const { rerender, scrollIntoView } = renderScroll("lsd");

    rerender({ key: "lsd" });
    rerender({ key: null });

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not scroll above the breakpoint", () => {
    stubMatchMedia({ [BELOW_QUERY]: false });
    const { rerender, scrollIntoView } = renderScroll(null);

    rerender({ key: "lsd" });

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("jumps instantly for reduced-motion users", () => {
    stubMatchMedia({ [BELOW_QUERY]: true, [REDUCED_MOTION_QUERY]: true });
    const { rerender, scrollIntoView } = renderScroll(null);

    rerender({ key: "lsd" });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });
});
