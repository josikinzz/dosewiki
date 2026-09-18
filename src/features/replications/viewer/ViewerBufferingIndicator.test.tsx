import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ViewerBufferingIndicator } from "./ViewerBufferingIndicator";

let reducedMotion = false;
let pageHidden = false;
let motionQuery: MediaQueryList;

beforeEach(() => {
  vi.useFakeTimers();
  reducedMotion = false;
  pageHidden = false;
  const queryEvents = new EventTarget();
  motionQuery = Object.assign(queryEvents, {
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: queryEvents.dispatchEvent.bind(queryEvents),
  }) as unknown as MediaQueryList;
  Object.defineProperty(motionQuery, "matches", {
    get: () => reducedMotion,
  });
  vi.stubGlobal("matchMedia", vi.fn(() => motionQuery));
  vi.spyOn(document, "hidden", "get").mockImplementation(() => pageHidden);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const phaseOf = (container: HTMLElement) =>
  container.firstElementChild?.getAttribute("data-phase") ?? null;

describe("ViewerBufferingIndicator", () => {
  it("never flashes when buffering completes within the reveal delay", () => {
    const props = { mediaKey: "first" };
    const { rerender, container } = render(
      <ViewerBufferingIndicator {...props} phase="startup" />,
    );
    act(() => vi.advanceTimersByTime(200));
    rerender(<ViewerBufferingIndicator {...props} phase={null} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(container).toBeEmptyDOMElement();
  });

  it("reveals sustained buffering, then retires its passive status before the fade ends", () => {
    const props = { mediaKey: "first" };
    const { rerender, container } = render(
      <ViewerBufferingIndicator {...props} phase="startup" />,
    );
    act(() => vi.advanceTimersByTime(249));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "off");

    rerender(<ViewerBufferingIndicator {...props} phase={null} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(159));
    expect(screen.getByText("Loading")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("cancels a stale phase reveal and never carries a visible status to another work", () => {
    const props = { mediaKey: "first" };
    const { rerender, container } = render(
      <ViewerBufferingIndicator {...props} phase="startup" />,
    );
    act(() => vi.advanceTimersByTime(200));
    rerender(<ViewerBufferingIndicator {...props} phase="rebuffer" />);
    act(() => vi.advanceTimersByTime(50));
    expect(container).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(200));
    expect(phaseOf(container)).toBe("rebuffer");

    rerender(
      <ViewerBufferingIndicator {...props} mediaKey="second" phase="startup" />,
    );
    expect(container).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(250));
    expect(phaseOf(container)).toBe("startup");
  });

  it("cancels the previous work's pending reveal and releases delayed work on unmount", () => {
    const { rerender, unmount, container } = render(
      <ViewerBufferingIndicator mediaKey="first" phase="startup" />,
    );
    act(() => vi.advanceTimersByTime(200));
    rerender(<ViewerBufferingIndicator mediaKey="second" phase={null} />);
    act(() => vi.advanceTimersByTime(50));
    expect(container).toBeEmptyDOMElement();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps loading text available with reduced motion and skips the completion fade", () => {
    reducedMotion = true;
    const props = { mediaKey: "first" };
    const { rerender, container } = render(
      <ViewerBufferingIndicator {...props} phase="startup" />,
    );
    act(() => vi.advanceTimersByTime(250));
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    act(() => {
      reducedMotion = false;
      motionQuery.dispatchEvent(new Event("change"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    act(() => {
      reducedMotion = true;
      motionQuery.dispatchEvent(new Event("change"));
    });
    rerender(<ViewerBufferingIndicator {...props} phase={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("suspends the hidden tab's status and resumes only the current work", () => {
    const { rerender, container } = render(
      <ViewerBufferingIndicator mediaKey="first" phase="startup" />,
    );
    act(() => vi.advanceTimersByTime(250));
    act(() => {
      pageHidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    rerender(<ViewerBufferingIndicator mediaKey="second" phase="rebuffer" />);
    act(() => vi.advanceTimersByTime(250));
    act(() => {
      pageHidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(phaseOf(container)).toBe("rebuffer");
  });

  it("leans the loading text with rotated stage media and reads as plain text", () => {
    const { rerender, container } = render(
      <ViewerBufferingIndicator mediaKey="first" phase="startup" />,
    );
    act(() => vi.advanceTimersByTime(250));
    expect(container.firstElementChild).toHaveAttribute("data-rotated", "false");
    // The breathing dots are decoration; assistive tech reads only the word.
    expect(screen.getByRole("status").textContent).toBe("Loading...");
    const dots = screen.getAllByText(".");
    expect(dots).toHaveLength(3);
    expect(dots[0].parentElement).toHaveAttribute("aria-hidden", "true");

    rerender(
      <ViewerBufferingIndicator mediaKey="first" phase="startup" rotated />,
    );
    expect(container.firstElementChild).toHaveAttribute("data-rotated", "true");
  });
});
