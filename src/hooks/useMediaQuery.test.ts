import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "./useMediaQuery";

type Listener = () => void;

interface FakeList {
  matches: boolean;
  listeners: Set<Listener>;
}

/**
 * One fake `MediaQueryList` per media string. `legacy` drops the modern
 * `addEventListener` pair so only the deprecated `addListener` path exists.
 */
function stubMatchMedia(initial: Record<string, boolean>, { legacy = false } = {}) {
  const lists = new Map<string, FakeList>();
  window.matchMedia = vi.fn((media: string) => {
    let list = lists.get(media);
    if (!list) {
      list = { matches: initial[media] ?? false, listeners: new Set() };
      lists.set(media, list);
    }
    const { listeners } = list;
    const modern = legacy
      ? {}
      : {
          addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
          removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
        };
    return {
      get matches() {
        return lists.get(media)!.matches;
      },
      media,
      onchange: null,
      dispatchEvent: vi.fn(),
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
      ...modern,
    };
  }) as unknown as typeof window.matchMedia;

  const flip = (media: string, matches: boolean) => {
    const list = lists.get(media);
    if (!list) throw new Error(`no list for ${media}`);
    list.matches = matches;
    list.listeners.forEach((listener) => listener());
  };

  return { lists, flip };
}

describe("useMediaQuery", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("returns the initial match after mount", () => {
    stubMatchMedia({ "(pointer: coarse)": true });
    const { result } = renderHook(() => useMediaQuery("(pointer: coarse)"));
    expect(result.current).toBe(true);
  });

  it("updates when the query fires a change event", () => {
    const { flip } = stubMatchMedia({ "(pointer: fine)": true });
    const { result } = renderHook(() => useMediaQuery("(pointer: fine)"));
    expect(result.current).toBe(true);

    act(() => flip("(pointer: fine)", false));
    expect(result.current).toBe(false);
  });

  it("resubscribes when the query string changes", () => {
    const { lists, flip } = stubMatchMedia({ "(max-width: 767px)": false, "(min-width: 1024px)": true });
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: "(max-width: 767px)" },
    });
    expect(result.current).toBe(false);

    rerender({ query: "(min-width: 1024px)" });
    expect(result.current).toBe(true);
    expect(lists.get("(max-width: 767px)")!.listeners.size).toBe(0);
    expect(lists.get("(min-width: 1024px)")!.listeners.size).toBe(1);

    // The old query no longer drives state.
    act(() => flip("(max-width: 767px)", true));
    expect(result.current).toBe(true);
    act(() => flip("(min-width: 1024px)", false));
    expect(result.current).toBe(false);
  });

  it("falls back to addListener when addEventListener is unavailable", () => {
    const { flip } = stubMatchMedia({ "(hover: hover)": false }, { legacy: true });
    const { result, unmount } = renderHook(() => useMediaQuery("(hover: hover)"));
    expect(result.current).toBe(false);

    act(() => flip("(hover: hover)", true));
    expect(result.current).toBe(true);

    unmount();
    act(() => flip("(hover: hover)", false));
    expect(result.current).toBe(true);
  });

  it("stays false when matchMedia is missing", () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: undefined });
    const { result } = renderHook(() => useMediaQuery("(pointer: coarse)"));
    expect(result.current).toBe(false);
  });
});
