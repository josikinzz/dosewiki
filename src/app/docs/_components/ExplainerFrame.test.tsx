import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExplainerFrame } from "./ExplainerFrame";

class ResizeObserverMock implements ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function installMatchMediaMock(matches: boolean) {
  window.matchMedia = vi.fn(() => ({
    matches,
    media: "(max-width: 767px), (hover: none) and (pointer: coarse)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("ExplainerFrame", () => {
  const originalMatchMedia = window.matchMedia;
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    globalThis.ResizeObserver = originalResizeObserver;
    vi.restoreAllMocks();
  });

  it("keeps desktop docs in parent-page scroll mode", () => {
    installMatchMediaMock(false);

    render(<ExplainerFrame src="/docs/how.html" title="How dose.wiki articles are made" />);

    const iframe = screen.getByTitle("How dose.wiki articles are made");

    expect(iframe).toHaveAttribute("scrolling", "no");
    expect(iframe).toHaveAttribute("data-internal-scroll", "false");
  });

  it("uses an internally scrollable iframe for mobile touch devices", async () => {
    installMatchMediaMock(true);

    render(<ExplainerFrame src="/docs/how.html" title="How dose.wiki articles are made" />);

    const iframe = screen.getByTitle("How dose.wiki articles are made");

    await waitFor(() => {
      expect(iframe).toHaveAttribute("scrolling", "auto");
    });
    expect(iframe).toHaveAttribute("data-internal-scroll", "true");
  });
});
