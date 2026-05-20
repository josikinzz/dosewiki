import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DevModeTab } from "./devModePageUtils";
import { useDevChromeEnvironment } from "./useDevChromeEnvironment";

describe("useDevChromeEnvironment", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("tracks fine pointer media query support", () => {
    const listeners = new Set<() => void>();
    let matches = true;
    window.matchMedia = vi.fn(() => ({
      get matches() {
        return matches;
      },
      media: "(pointer: fine)",
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() =>
      useDevChromeEnvironment({
        activeTab: "articles",
        close: vi.fn(),
        onTabNoticeClear: vi.fn(),
      }),
    );

    expect(result.current.enableStickyPanels).toBe(true);

    act(() => {
      matches = false;
      listeners.forEach((listener) => listener());
    });

    expect(result.current.enableStickyPanels).toBe(false);
  });

  it("wires Escape to close", () => {
    const close = vi.fn();
    renderHook(() =>
      useDevChromeEnvironment({
        activeTab: "articles",
        close,
        onTabNoticeClear: vi.fn(),
      }),
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("returns wide layout classes for index layout and regular classes otherwise", () => {
    const props = {
      close: vi.fn(),
      onTabNoticeClear: vi.fn(),
    };
    const { result, rerender } = renderHook(
      ({ activeTab }) => useDevChromeEnvironment({ activeTab, ...props }),
      { initialProps: { activeTab: "articles" as DevModeTab } },
    );

    expect(result.current.mainClassName).toContain("max-w-6xl");
    expect(result.current.contentWrapperClass).toContain("max-w-6xl");

    rerender({ activeTab: "index-layout" });

    expect(result.current.mainClassName).not.toContain("max-w-6xl");
    expect(result.current.contentWrapperClass).toBe("mt-10 w-full");
  });

  it("clears tab notices when the active tab changes", () => {
    const onTabNoticeClear = vi.fn();
    const { rerender } = renderHook(
      ({ activeTab }) =>
        useDevChromeEnvironment({
          activeTab,
          close: vi.fn(),
          onTabNoticeClear,
        }),
      { initialProps: { activeTab: "articles" as DevModeTab } },
    );

    expect(onTabNoticeClear).toHaveBeenLastCalledWith("articles");

    rerender({ activeTab: "index-layout" });

    expect(onTabNoticeClear).toHaveBeenLastCalledWith("index-layout");
  });
});
