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
        hasPendingChanges: false,
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
        hasPendingChanges: false,
        onTabNoticeClear: vi.fn(),
      }),
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape when the event was already handled or targets an editable element", () => {
    const close = vi.fn();
    renderHook(() =>
      useDevChromeEnvironment({
        activeTab: "articles",
        close,
        hasPendingChanges: false,
        onTabNoticeClear: vi.fn(),
      }),
    );

    act(() => {
      const handled = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
      handled.preventDefault();
      window.dispatchEvent(handled);
    });

    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    input.remove();

    expect(close).not.toHaveBeenCalled();
  });

  it("leaves Escape alone on the review workbench", () => {
    // The workbench is a standalone surface, so `close()` would push the
    // reviewer to /substances instead of dismissing anything.
    const close = vi.fn();
    renderHook(() =>
      useDevChromeEnvironment({
        activeTab: "review",
        close,
        hasPendingChanges: false,
        onTabNoticeClear: vi.fn(),
      }),
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(close).not.toHaveBeenCalled();
  });

  it("asks for confirmation before closing with pending changes", () => {
    const close = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderHook(() =>
      useDevChromeEnvironment({
        activeTab: "articles",
        close,
        hasPendingChanges: true,
        onTabNoticeClear: vi.fn(),
      }),
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("returns full-width layout classes for every tab", () => {
    const props = {
      close: vi.fn(),
      hasPendingChanges: false,
      onTabNoticeClear: vi.fn(),
    };
    const { result, rerender } = renderHook(
      ({ activeTab }) => useDevChromeEnvironment({ activeTab, ...props }),
      { initialProps: { activeTab: "articles" as DevModeTab } },
    );

    expect(result.current.mainClassName).not.toContain("max-w-");
    expect(result.current.contentWrapperClass).toBe("mt-6 w-full");

    rerender({ activeTab: "index-layout" });

    expect(result.current.mainClassName).not.toContain("max-w-");
    expect(result.current.contentWrapperClass).toBe("mt-6 w-full");
  });

  it("clears tab notices when the active tab changes", () => {
    const onTabNoticeClear = vi.fn();
    const { rerender } = renderHook(
      ({ activeTab }) =>
        useDevChromeEnvironment({
          activeTab,
          close: vi.fn(),
          hasPendingChanges: false,
          onTabNoticeClear,
        }),
      { initialProps: { activeTab: "articles" as DevModeTab } },
    );

    expect(onTabNoticeClear).toHaveBeenLastCalledWith("articles");

    rerender({ activeTab: "index-layout" });

    expect(onTabNoticeClear).toHaveBeenLastCalledWith("index-layout");
  });
});
