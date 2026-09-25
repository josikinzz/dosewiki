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

  it("never leaves the editor on Escape, wherever focus is", () => {
    const close = vi.fn();
    renderHook(() =>
      useDevChromeEnvironment({
        activeTab: "articles",
        close,
        hasPendingChanges: false,
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

  it("reports the shared draft to the unsaved-work registry so Leave asks, not a native confirm", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const close = vi.fn();
    const probe: { registry: ReturnType<typeof useUnsavedWorkRegistry> | null } = { registry: null };
    const { result } = renderHook(
      () => {
        probe.registry = useUnsavedWorkRegistry();
        return useDevChromeEnvironment({
          activeTab: "articles",
          close,
          hasPendingChanges: true,
          onTabNoticeClear: vi.fn(),
        });
      },
      { wrapper: UnsavedWorkProvider },
    );

    expect(probe.registry?.dirtyEntries.map((entry) => entry.label)).toEqual(["Draft edits not yet committed"]);

    // A rail switch keeps the shared draft, so it never blocks one.
    const switchTab = vi.fn();
    act(() => probe.registry?.confirmExit(switchTab, "tab"));
    expect(switchTab).toHaveBeenCalledTimes(1);

    // The chrome routes Leave through the registry; the hook's own leave is the bare close.
    const leave = vi.fn();
    act(() => probe.registry?.confirmExit(leave, "leave"));
    expect(leave).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(result.current.leaveEditor).toBe(close);
  });

  it("keeps the toolbar full width but caps the content column outside the wide tools", () => {
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
