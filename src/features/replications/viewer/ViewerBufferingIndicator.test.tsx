import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    matches: false,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  });
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

describe("ViewerBufferingIndicator", () => {
  it("never flashes when buffering completes within the reveal delay", () => {
    const props = { mediaKey: "first", canPlayNow: false, onPlayNow: vi.fn() };
    const { rerender, container } = render(
      <ViewerBufferingIndicator {...props} phase="startup" />,
    );
    act(() => vi.advanceTimersByTime(200));
    rerender(<ViewerBufferingIndicator {...props} phase={null} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(container).toBeEmptyDOMElement();
  });

  it("reveals sustained buffering, then retires its passive status before the fade ends", () => {
    const props = { mediaKey: "first", canPlayNow: false, onPlayNow: vi.fn() };
    const { rerender, container } = render(
      <ViewerBufferingIndicator {...props} phase="startup" />,
    );
    act(() => vi.advanceTimersByTime(249));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toHaveTextContent("Loading video");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "off");

    rerender(<ViewerBufferingIndicator {...props} phase={null} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(159));
    expect(screen.getByText("Loading video")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("cancels a stale phase reveal and never carries a visible status to another work", () => {
    const props = { mediaKey: "first", canPlayNow: false, onPlayNow: vi.fn() };
    const { rerender, container } = render(
      <ViewerBufferingIndicator {...props} phase="startup" />,
    );
    act(() => vi.advanceTimersByTime(200));
    rerender(<ViewerBufferingIndicator {...props} phase="rebuffer" />);
    act(() => vi.advanceTimersByTime(50));
    expect(container).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole("status")).toHaveTextContent("Buffering");

    rerender(
      <ViewerBufferingIndicator {...props} mediaKey="second" phase="startup" />,
    );
    expect(container).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(250));
    expect(screen.getByRole("status")).toHaveTextContent("Loading video");
  });

  it("cancels the previous work's pending reveal and releases delayed work on unmount", () => {
    const props = { canPlayNow: false, onPlayNow: vi.fn() };
    const { rerender, unmount, container } = render(
      <ViewerBufferingIndicator {...props} mediaKey="first" phase="startup" />,
    );
    act(() => vi.advanceTimersByTime(200));
    rerender(
      <ViewerBufferingIndicator {...props} mediaKey="second" phase={null} />,
    );
    act(() => vi.advanceTimersByTime(50));
    expect(container).toBeEmptyDOMElement();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps loading text available with reduced motion and skips the completion fade", () => {
    reducedMotion = true;
    const props = { mediaKey: "first", canPlayNow: false, onPlayNow: vi.fn() };
    const { rerender, container } = render(
      <ViewerBufferingIndicator {...props} phase="startup" />,
    );
    act(() => vi.advanceTimersByTime(250));
    expect(screen.getByRole("status")).toHaveTextContent("Loading video");
    act(() => {
      reducedMotion = false;
      motionQuery.dispatchEvent(new Event("change"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Loading video");
    act(() => {
      reducedMotion = true;
      motionQuery.dispatchEvent(new Event("change"));
    });
    rerender(<ViewerBufferingIndicator {...props} phase={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("suspends the hidden tab's status and resumes only the current work", () => {
    const props = { canPlayNow: true, onPlayNow: vi.fn() };
    const { rerender } = render(
      <ViewerBufferingIndicator {...props} mediaKey="first" phase="startup" />,
    );
    act(() => vi.advanceTimersByTime(250));
    act(() => {
      pageHidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(
      <ViewerBufferingIndicator {...props} mediaKey="second" phase="rebuffer" />,
    );
    act(() => vi.advanceTimersByTime(250));
    act(() => {
      pageHidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Buffering");
    expect(screen.queryByText("Loading video")).not.toBeInTheDocument();
  });

  it("offers the ready action without forwarding input to viewer gestures or chrome", () => {
    const onPlayNow = vi.fn();
    const onViewerInput = vi.fn();
    const props = { mediaKey: "first", onPlayNow, phase: "startup" as const };
    const { rerender } = render(
      <div
        role="presentation"
        onClick={onViewerInput}
        onPointerDown={onViewerInput}
        onPointerUp={onViewerInput}
        onTouchStart={onViewerInput}
        onTouchEnd={onViewerInput}
        onKeyDown={onViewerInput}
        onKeyUp={onViewerInput}
      >
        <ViewerBufferingIndicator {...props} canPlayNow={false} />
      </div>,
    );
    act(() => vi.advanceTimersByTime(250));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(
      <div
        role="presentation"
        onClick={onViewerInput}
        onPointerDown={onViewerInput}
        onPointerUp={onViewerInput}
        onTouchStart={onViewerInput}
        onTouchEnd={onViewerInput}
        onKeyDown={onViewerInput}
        onKeyUp={onViewerInput}
      >
        <ViewerBufferingIndicator {...props} canPlayNow />
      </div>,
    );
    const action = screen.getByRole("button", { name: "Play now" });
    action.focus();
    expect(action).toHaveFocus();
    fireEvent.pointerDown(action);
    fireEvent.pointerUp(action);
    fireEvent.touchStart(action);
    fireEvent.touchEnd(action);
    fireEvent.keyDown(action, { key: "Enter" });
    fireEvent.keyUp(action, { key: "Enter" });
    fireEvent.click(action, { detail: 0 });
    expect(onPlayNow).toHaveBeenCalledTimes(1);
    expect(onViewerInput).not.toHaveBeenCalled();
  });
});
