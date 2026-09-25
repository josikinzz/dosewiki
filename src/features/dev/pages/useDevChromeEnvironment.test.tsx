import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnsavedWorkProvider, useUnsavedWorkRegistry } from "../components/unsavedWork";
import { DEV_TAB_REGISTRY, type DevModeTab } from "./devTabRegistry";
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

  it("never leaves the editor on Escape, wherever focus is", () => {
    const close = vi.fn();
    renderHook(() =>
      useDevChromeEnvironment({
        activeTab: "articles",
        close,
        onTabNoticeClear: vi.fn(),
      }),
    );

    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    act(() => {
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    button.remove();

    expect(close).not.toHaveBeenCalled();
  });

  it("leaves the editor without reading the staged working set, and registers no unsaved work of its own", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const close = vi.fn();
    const probe: { registry: ReturnType<typeof useUnsavedWorkRegistry> | null } = { registry: null };
    const { result } = renderHook(
      () => {
        probe.registry = useUnsavedWorkRegistry();
        return useDevChromeEnvironment({
          activeTab: "articles",
          close,
          onTabNoticeClear: vi.fn(),
        });
      },
      { wrapper: UnsavedWorkProvider },
    );

    // The staged set reports through useStagedSetUnsavedWork; this hook takes
    // no pending-changes input and adds no entry.
    expect(probe.registry?.dirtyEntries).toEqual([]);
    expect(result.current.leaveEditor).toBe(close);
    act(() => result.current.leaveEditor());
    expect(close).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("keeps the toolbar full width but caps the content column outside the wide tools", () => {
    const props = {
      close: vi.fn(),
      onTabNoticeClear: vi.fn(),
    };
    const { result, rerender } = renderHook(
      ({ activeTab }) => useDevChromeEnvironment({ activeTab, ...props }),
      { initialProps: { activeTab: "articles" as DevModeTab } },
    );

    expect(result.current.mainClassName).not.toContain("max-w-");
    expect(result.current.contentWrapperClass).toBe("mx-auto mt-6 w-full max-w-6xl");

    // The width follows the descriptor's `layout`, never a list of tab ids.
    for (const tab of DEV_TAB_REGISTRY) {
      rerender({ activeTab: tab.id });

      expect(result.current.mainClassName).not.toContain("max-w-");
      expect(result.current.contentWrapperClass).toBe(
        tab.layout === "full-bleed" ? "mt-6 w-full" : "mx-auto mt-6 w-full max-w-6xl",
      );
    }
    expect(DEV_TAB_REGISTRY.filter((tab) => tab.layout === "full-bleed").map((tab) => tab.id)).toEqual([
      "trip-report-submissions",
      "banners",
      "replications",
      "index-layout",
    ]);
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
