import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResetScrollOnPathnameChange } from "./RouteChrome";

describe("useResetScrollOnPathnameChange", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("resets document scroll when the pathname changes", () => {
    vi.useFakeTimers();
    const windowScrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const scrollingElementScrollTo = vi.fn();
    const scrollingElement = {
      scrollTo: scrollingElementScrollTo,
    } as unknown as Element;

    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      get: () => scrollingElement,
    });

    const { rerender } = renderHook(
      ({ pathname }: { pathname: string }) => useResetScrollOnPathnameChange(pathname),
      { initialProps: { pathname: "/" } },
    );

    expect(windowScrollTo).not.toHaveBeenCalled();

    rerender({ pathname: "/substances" });

    expect(windowScrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
    expect(scrollingElementScrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });

    const callsAfterInitialReset = windowScrollTo.mock.calls.length;

    vi.advanceTimersByTime(1000);

    expect(windowScrollTo.mock.calls.length).toBeGreaterThan(callsAfterInitialReset);
    expect(scrollingElementScrollTo.mock.calls.length).toBeGreaterThan(callsAfterInitialReset);
  });

  it("leaves hash-target navigations alone", () => {
    window.history.replaceState(null, "", "/effects#visual");
    const windowScrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    const { rerender } = renderHook(
      ({ pathname }: { pathname: string }) => useResetScrollOnPathnameChange(pathname),
      { initialProps: { pathname: "/" } },
    );

    rerender({ pathname: "/effects" });

    expect(windowScrollTo).not.toHaveBeenCalled();
  });
});
