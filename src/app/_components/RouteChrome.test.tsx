import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isChromelessAddress,
  isSelfScrollingRoute,
  useResetScrollOnPathnameChange,
} from "./RouteChrome";

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

    const callsAtCommit = windowScrollTo.mock.calls.length;

    // Late layout still gets corrected...
    vi.advanceTimersByTime(150);

    expect(windowScrollTo.mock.calls.length).toBeGreaterThan(callsAtCommit);
    expect(scrollingElementScrollTo.mock.calls.length).toBeGreaterThan(callsAtCommit);

    // ...but nothing lands a second later, on top of a reader who is by then
    // several screens into the article.
    const callsAfterCorrections = windowScrollTo.mock.calls.length;

    vi.advanceTimersByTime(2000);

    expect(windowScrollTo.mock.calls.length).toBe(callsAfterCorrections);
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

  it("withholds the reset on a route that owns its own scrolling", () => {
    const windowScrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    const { rerender } = renderHook(
      ({ pathname }: { pathname: string }) =>
        useResetScrollOnPathnameChange(pathname, {
          disabled: isSelfScrollingRoute(pathname),
        }),
      { initialProps: { pathname: "/review/2c-b" } },
    );

    rerender({ pathname: "/review/2c-e" });

    expect(windowScrollTo).not.toHaveBeenCalled();
  });

  it("knows which routes own their own scrolling", () => {
    expect(isSelfScrollingRoute("/review")).toBe(true);
    expect(isSelfScrollingRoute("/review/2c-b")).toBe(true);
    expect(isSelfScrollingRoute("/reviews")).toBe(false);
    expect(isSelfScrollingRoute("/substances")).toBe(false);
  });

  it("stands down as soon as the reader scrolls", () => {
    vi.useFakeTimers();
    const windowScrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    const { rerender } = renderHook(
      ({ pathname }: { pathname: string }) => useResetScrollOnPathnameChange(pathname),
      { initialProps: { pathname: "/" } },
    );

    rerender({ pathname: "/substances" });

    const callsAtCommit = windowScrollTo.mock.calls.length;

    window.dispatchEvent(new Event("wheel"));
    vi.advanceTimersByTime(2000);

    expect(windowScrollTo.mock.calls.length).toBe(callsAtCommit);
  });
});

describe("isChromelessAddress", () => {
  it("stands the header down on the construction hosts' bare root", () => {
    // The rewrite means the server rendered `/under-construction` here, so its HTML has
    // no header. Hydration has to reach the same answer from the address `/` plus the
    // host, or the landing gets a second one stacked above its own.
    for (const host of ["dose.wiki", "www.dose.wiki", "dose.wiki:443"]) {
      expect(isChromelessAddress("/", "/", { host })).toBe(true);
    }

    expect(isChromelessAddress("/under-construction", "/under-construction", {})).toBe(true);
    expect(isChromelessAddress("/", "/", { homeConstructionMode: true })).toBe(true);
  });

  it("leaves the preview homepage its chrome on those same hosts", () => {
    // `/preview/home` models `/`, so an app-path check alone would strip the header from
    // the one address that exists to show the finished site.
    expect(isChromelessAddress("/preview/home", "/", { host: "dose.wiki" })).toBe(false);
    expect(isChromelessAddress("/preview/substances", "/substances", { host: "dose.wiki" })).toBe(
      false,
    );
  });

  it("keeps the header everywhere the gate does not apply", () => {
    expect(isChromelessAddress("/", "/", { host: "dosewiki-admin.vercel.app" })).toBe(false);
    expect(isChromelessAddress("/", "/", { host: null })).toBe(false);
    expect(isChromelessAddress("/fentanyl", "/fentanyl", { host: "dose.wiki" })).toBe(false);
  });

  it("still withholds it from the full-bleed editor surfaces", () => {
    for (const pathname of ["/mantras", "/review", "/review/fentanyl"]) {
      expect(isChromelessAddress(pathname, pathname, {})).toBe(true);
    }

    expect(isChromelessAddress("/reviews", "/reviews", {})).toBe(false);
  });
});
