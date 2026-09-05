import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ViewerMediaTrack, type ViewerMediaTrackProps, type ViewerTrackHandle } from "./ViewerMediaTrack";
import type { ReplicationViewerMediaItem } from "./viewerModel";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src, className }: { src: string; className?: string }) => <img src={src} className={className} alt="" />,
}));

function item(
  overrides: Partial<ReplicationViewerMediaItem["replication"]> = {},
): ReplicationViewerMediaItem {
  return {
    replication: {
      slug: "clip",
      title: "Clip",
      artist: "Chelsea Morgan",
      type: "video",
      format: "mp4",
      url: "https://cdn.test/clip.mp4",
      preview_url: "https://cdn.test/clip-preview.mp4",
      ...overrides,
    },
    effectName: null,
    effectSlug: null,
    effectCategories: [],
    artistProfileHref: null,
    avatarUrl: null,
  };
}

const next = item({ slug: "next", url: "https://cdn.test/next.mp4" });
const below = item({ slug: "below", url: "https://cdn.test/below.mp4" });

function renderTrack(overrides: Partial<ViewerMediaTrackProps> = {}) {
  const ref = createRef<ViewerTrackHandle>();
  const handlers = {
    onActiveVideoChange: vi.fn(),
    onNavigateWork: vi.fn(),
    onNavigateGroup: vi.fn(),
    onSurfaceTap: vi.fn(),
    onProbeAspect: vi.fn(),
  };
  let props: ViewerMediaTrackProps = {
    previousItem: null,
    activeItem: item(),
    nextItem: next,
    previousGroupItem: null,
    nextGroupItem: below,
    positionKey: "group|clip",
    autoplayAllowed: true,
    rotateMode: false,
    controlsVisible: true,
    ...handlers,
    ...overrides,
  };
  const view = render(<ViewerMediaTrack ref={ref} {...props} />);
  const rerender = (updates: Partial<ViewerMediaTrackProps>) => {
    props = { ...props, ...updates };
    view.rerender(<ViewerMediaTrack ref={ref} {...props} />);
  };
  const floor = view.container.querySelector<HTMLElement>("[data-viewer-track-floor]")!;
  const viewport = view.container.querySelector<HTMLElement>("[data-replication-media-track]")!;
  Object.defineProperties(floor, {
    clientWidth: { configurable: true, value: 400 },
    clientHeight: { configurable: true, value: 800 },
  });
  return { ref, handlers, view, floor, viewport, rerender };
}

beforeAll(() => {
  Object.defineProperties(HTMLMediaElement.prototype, {
    play: { configurable: true, value: vi.fn().mockResolvedValue(undefined) },
    pause: { configurable: true, value: vi.fn() },
    load: { configurable: true, value: vi.fn() },
  });
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ViewerMediaTrack", () => {
  it.each(["work", "group"] as const)("retains the incoming %s player and source after animation commits", (axis) => {
    const { ref, handlers, view, floor, rerender } = renderTrack();
    const destination = axis === "work" ? next : below;
    const navigation = axis === "work" ? handlers.onNavigateWork : handlers.onNavigateGroup;
    const pool = Array.from(view.container.querySelectorAll("video"));
    const incoming = view.container.querySelector<HTMLVideoElement>(`video[src="${destination.replication.url}"]`)!;
    const outgoing = view.container.querySelector<HTMLVideoElement>('video[src="https://cdn.test/clip.mp4"]')!;
    incoming.currentTime = 7.5;
    outgoing.muted = false;
    const pause = vi.fn();
    Object.defineProperties(outgoing, { paused: { configurable: true, value: false }, pause: { value: pause } });
    const srcAssignments = vi.spyOn(incoming, "src", "set");
    const load = vi.fn();
    Object.defineProperty(incoming, "load", { value: load });
    navigation.mockImplementation(() => rerender({
      activeItem: destination,
      positionKey: `${axis}|${destination.replication.slug}`,
      previousItem: axis === "work" ? item() : null,
      nextItem: null,
      previousGroupItem: axis === "group" ? item() : null,
      nextGroupItem: null,
    }));

    act(() => expect(axis === "work" ? ref.current!.slide(1) : ref.current!.slideGroup(1)).toBe(true));
    expect(navigation).not.toHaveBeenCalled();
    expect(ref.current!.slideGroup(1)).toBe(false);
    fireEvent.transitionEnd(floor, { propertyName: "transform" });

    expect(navigation).toHaveBeenCalledExactlyOnceWith(1);
    expect(view.container.querySelector("[data-viewer-active-pane] video")).toBe(incoming);
    expect(incoming.src).toBe(destination.replication.url);
    expect(incoming.currentTime).toBe(7.5);
    expect(srcAssignments).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(Array.from(view.container.querySelectorAll("video"))).toEqual(pool);
    expect(pool).toHaveLength(5);
    expect(outgoing.muted).toBe(true);
    expect(pause).toHaveBeenCalled();
    expect(floor.style.transform).toBe("");
  });

  it.each(["x", "y"] as const)("follows the finger on %s and cancels without navigating", (axis) => {
    const { viewport, floor, handlers } = renderTrack();
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: axis === "x" ? 80 : 200, clientY: axis === "y" ? 280 : 400 });
    expect(floor.style.transform).toBe(`translate${axis.toUpperCase()}(-120px)`);
    fireEvent.pointerCancel(viewport, { pointerId: 1 });
    expect(floor.style.transform).toBe("");
    expect(handlers.onNavigateWork).not.toHaveBeenCalled();
    expect(handlers.onNavigateGroup).not.toHaveBeenCalled();
  });

  it("resists a missing group endpoint and does not commit it", () => {
    const { viewport, floor, handlers, ref } = renderTrack();
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 200, clientY: 520 });
    expect(floor.style.transform).toBe("translateY(40px)");
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 200, clientY: 520 });
    expect(floor.style.transform).toBe("");
    expect(ref.current!.slideGroup(-1)).toBe(false);
    expect(handlers.onNavigateGroup).not.toHaveBeenCalled();
  });

  it("commits a vertical finger swipe only after its transition ends", () => {
    const { viewport, floor, handlers } = renderTrack();
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 200, clientY: 280 });
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 200, clientY: 280 });
    expect(floor.style.transform).toBe("translateY(-100%)");
    expect(handlers.onNavigateGroup).not.toHaveBeenCalled();
    fireEvent.transitionEnd(floor, { propertyName: "transform" });
    expect(handlers.onNavigateGroup).toHaveBeenCalledExactlyOnceWith(1);
    expect(handlers.onNavigateWork).not.toHaveBeenCalled();
  });

  it("continues a touch swipe when capture transfers from media to the viewport", () => {
    const { viewport, floor, handlers } = renderTrack();
    const video = viewport.querySelector("[data-viewer-active-pane] video")!;
    fireEvent.pointerDown(video, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 100, clientY: 400 });
    fireEvent.lostPointerCapture(video, { pointerId: 1 });
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 100, clientY: 400 });
    fireEvent.transitionEnd(floor, { propertyName: "transform" });
    expect(handlers.onNavigateWork).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("warms only the approached neighbor and leaves other full sources at metadata", () => {
    const { viewport, view } = renderTrack();
    const incoming = view.container.querySelector<HTMLVideoElement>(`video[src="${below.replication.url}"]`)!;
    const unrelated = view.container.querySelector<HTMLVideoElement>(`video[src="${next.replication.url}"]`)!;
    const warm = vi.fn().mockResolvedValue(undefined);
    const unrelatedPlay = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(incoming, "play", { value: warm });
    Object.defineProperty(unrelated, "play", { value: unrelatedPlay });
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 400 });
    expect(warm).not.toHaveBeenCalled();
    expect(unrelatedPlay).not.toHaveBeenCalled();
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 200, clientY: 280 });
    expect(warm).toHaveBeenCalledOnce();
    expect(unrelatedPlay).not.toHaveBeenCalled();
    expect(unrelated.preload).toBe("metadata");
  });

  it("does not warm originals under data saving", () => {
    vi.stubGlobal("navigator", { connection: { saveData: true } });
    const { viewport, view } = renderTrack();
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 200, clientY: 280 });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(Array.from(view.container.querySelectorAll("video")).every((video) => video.preload === "metadata")).toBe(true);
  });

  it("prepares unknown neighbor orientation before group activation without changing geometry on arrival", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query.includes("orientation: portrait"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    const { view, ref, floor, handlers, rerender } = renderTrack({ rotateMode: true });
    const incoming = view.container.querySelector<HTMLVideoElement>(`video[src="${below.replication.url}"]`)!;
    expect(incoming.classList.contains("opacity-0")).toBe(true);
    Object.defineProperties(incoming, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 } });
    fireEvent.loadedMetadata(incoming);
    expect(incoming.classList.contains("opacity-0")).toBe(false);
    expect(incoming.classList.contains("rotate-90")).toBe(true);
    const preparedGeometry = incoming.className;
    handlers.onNavigateGroup.mockImplementation(() => rerender({ activeItem: below, previousGroupItem: item(), nextGroupItem: null, positionKey: "below|below" }));
    act(() => { ref.current!.slideGroup(1); });
    fireEvent.transitionEnd(floor, { propertyName: "transform" });
    expect(view.container.querySelector("[data-viewer-active-pane] video")).toBe(incoming);
    expect(incoming.className).toBe(preparedGeometry);
    expect(handlers.onProbeAspect).toHaveBeenLastCalledWith(1920 / 1080, 1);
  });

  it("prepares a parked still with its probed geometry and retains it on arrival", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query.includes("orientation: portrait"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    const still = item({ slug: "still", type: "image", format: "jpg", url: "https://cdn.test/still.jpg" });
    const { view, ref, floor, handlers, rerender } = renderTrack({ rotateMode: true, nextGroupItem: still });
    const image = view.container.querySelector<HTMLImageElement>(`img[src="${still.replication.url}"]`)!;
    const geometry = image.parentElement!.parentElement!;
    expect(geometry.classList.contains("opacity-0")).toBe(true);
    Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
    fireEvent.load(image);
    expect(geometry.classList.contains("opacity-0")).toBe(false);
    expect(geometry.classList.contains("rotate-90")).toBe(true);
    handlers.onNavigateGroup.mockImplementation(() => rerender({ activeItem: still, previousGroupItem: item(), nextGroupItem: null, positionKey: "still|still" }));
    act(() => { ref.current!.slideGroup(1); });
    fireEvent.transitionEnd(floor, { propertyName: "transform" });
    expect(view.container.querySelector("[data-viewer-active-pane] img")).toBe(image);
    expect(image.parentElement!.parentElement).toBe(geometry);
  });

  it("cancels an in-flight group commit when an external position replaces it", () => {
    vi.useFakeTimers();
    const { ref, handlers, rerender } = renderTrack();
    act(() => { ref.current!.slideGroup(1); });
    rerender({ activeItem: next, positionKey: "external|next" });
    act(() => vi.runAllTimers());
    expect(handlers.onNavigateGroup).not.toHaveBeenCalled();
  });
});
