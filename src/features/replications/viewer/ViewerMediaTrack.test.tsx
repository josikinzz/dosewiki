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

const pendingFrames = new Map<number, { video: HTMLVideoElement; callback: VideoFrameRequestCallback }>();
let frameId = 0;

function presentFrame(video: HTMLVideoElement) {
  for (const [id, frame] of pendingFrames) {
    if (frame.video !== video) continue;
    pendingFrames.delete(id);
    frame.callback(0, {} as VideoFrameCallbackMetadata);
  }
}

beforeAll(() => {
  Object.defineProperties(HTMLMediaElement.prototype, {
    play: { configurable: true, value: vi.fn().mockResolvedValue(undefined) },
    pause: { configurable: true, value: vi.fn() },
    load: { configurable: true, value: vi.fn() },
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  pendingFrames.clear();
  Object.defineProperties(HTMLVideoElement.prototype, {
    requestVideoFrameCallback: {
      configurable: true,
      value: vi.fn(function (this: HTMLVideoElement, callback: VideoFrameRequestCallback) {
        pendingFrames.set(++frameId, { video: this, callback });
        return frameId;
      }),
    },
    cancelVideoFrameCallback: {
      configurable: true,
      value: vi.fn((id: number) => pendingFrames.delete(id)),
    },
  });
});
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
    const { viewport, floor, handlers, view } = renderTrack({ allowNeighborPreload: true });
    const players = Array.from(view.container.querySelectorAll("video"));
    const sources = players.map((video) => video.src);
    const reload = vi.spyOn(HTMLMediaElement.prototype, "load");
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: axis === "x" ? 80 : 200, clientY: axis === "y" ? 280 : 400 });
    expect(floor.style.transform).toBe(`translate${axis.toUpperCase()}(-120px)`);
    fireEvent.pointerCancel(viewport, { pointerId: 1 });
    expect(floor.style.transform).toBe("");
    expect(handlers.onNavigateWork).not.toHaveBeenCalled();
    expect(handlers.onNavigateGroup).not.toHaveBeenCalled();
    expect(Array.from(view.container.querySelectorAll("video"))).toEqual(players);
    expect(players.map((video) => video.src)).toEqual(sources);
    expect(reload).not.toHaveBeenCalled();
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

  it("warms only the approached neighbor when the active runway is healthy", () => {
    const { viewport, view } = renderTrack({ allowNeighborPreload: true });
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
    expect(unrelated.preload).toBe("none");
    expect(incoming.preload).toBe("auto");
  });

  it("gives the active clip priority, then preloads one likely next work without playback", () => {
    const { view, rerender } = renderTrack({
      previousItem: item({ slug: "previous", url: "https://cdn.test/previous.mp4" }),
      previousGroupItem: item({ slug: "above", url: "https://cdn.test/above.mp4" }),
    });
    const videos = Array.from(view.container.querySelectorAll("video"));
    const active = view.container.querySelector<HTMLVideoElement>("[data-viewer-active-pane] video")!;
    expect(active.preload).toBe("auto");
    expect(videos.filter((video) => video !== active).map((video) => video.preload)).toEqual(["none", "none", "none", "none"]);
    rerender({ allowNeighborPreload: true });
    expect(videos.filter((video) => video !== active && video.preload === "auto").map((video) => video.src)).toEqual([next.replication.url]);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it.each(["unhealthy", "hidden", "saveData", "reducedMotion"] as const)("does not speculate when %s", (restriction) => {
    if (restriction === "hidden") vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    if (restriction === "saveData") vi.stubGlobal("navigator", { connection: { saveData: true } });
    if (restriction === "reducedMotion") {
      vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })));
    }
    const { viewport, view } = renderTrack({ allowNeighborPreload: restriction !== "unhealthy" });
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 200, clientY: 280 });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    const parked = view.container.querySelectorAll<HTMLVideoElement>("[data-viewer-pane]:not([data-viewer-active-pane]) video");
    expect(Array.from(parked).every((video) => video.preload === "none")).toBe(true);
  });

  it.each(["unhealthy", "hidden", "saveData", "reducedMotion"] as const)("stops an approached decoder when the viewer becomes %s without reloading any source", (restriction) => {
    const connection = Object.assign(new EventTarget(), { saveData: false });
    const motionQuery = Object.assign(new EventTarget(), { matches: false });
    const portraitQuery = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal("navigator", { connection });
    vi.stubGlobal("matchMedia", vi.fn((query: string) => query.includes("prefers-reduced-motion") ? motionQuery : portraitQuery));
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const { viewport, view, rerender } = renderTrack({ allowNeighborPreload: true });
    const incoming = view.container.querySelector<HTMLVideoElement>(`video[src="${below.replication.url}"]`)!;
    let paused = true;
    Object.defineProperties(incoming, {
      paused: { configurable: true, get: () => paused },
      play: { value: vi.fn(() => { paused = false; return Promise.resolve(); }) },
      pause: { value: vi.fn(() => { paused = true; }) },
    });
    const source = incoming.src;
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 200, clientY: 280 });
    expect(paused).toBe(false);
    if (restriction === "unhealthy") rerender({ allowNeighborPreload: false });
    else if (restriction === "hidden") {
      hidden.mockReturnValue(true);
      fireEvent(document, new Event("visibilitychange"));
    } else if (restriction === "saveData") {
      connection.saveData = true;
      act(() => connection.dispatchEvent(new Event("change")));
    } else {
      motionQuery.matches = true;
      act(() => motionQuery.dispatchEvent(new Event("change")));
    }
    expect(paused).toBe(true);
    expect(incoming.preload).toBe("none");
    expect(incoming.src).toBe(source);
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
  });

  it.each(["presented frame", "timeout"] as const)("bounds offscreen decoding by the first %s", (completion) => {
    vi.useFakeTimers();
    const { viewport, view } = renderTrack({ allowNeighborPreload: true });
    const incoming = view.container.querySelector<HTMLVideoElement>(`video[src="${below.replication.url}"]`)!;
    let paused = true;
    Object.defineProperties(incoming, {
      paused: { configurable: true, get: () => paused },
      play: { value: vi.fn(() => { paused = false; return Promise.resolve(); }) },
      pause: { value: vi.fn(() => { paused = true; }) },
    });
    incoming.loop = true;
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 200, clientY: 280 });
    expect(paused).toBe(false);
    expect(incoming.loop).toBe(false);
    act(() => {
      if (completion === "presented frame") presentFrame(incoming);
      else vi.advanceTimersByTime(1000);
    });
    expect(paused).toBe(true);
  });

  it("publishes a parked video's probed aspect on group activation", () => {
    const { view, ref, floor, handlers, rerender } = renderTrack({ rotateMode: true });
    const incoming = view.container.querySelector<HTMLVideoElement>(`video[src="${below.replication.url}"]`)!;
    Object.defineProperties(incoming, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 } });
    fireEvent.loadedMetadata(incoming);
    handlers.onNavigateGroup.mockImplementation(() => rerender({ activeItem: below, previousGroupItem: item(), nextGroupItem: null, positionKey: "below|below" }));
    act(() => { ref.current!.slideGroup(1); });
    fireEvent.transitionEnd(floor, { propertyName: "transform" });
    expect(view.container.querySelector("[data-viewer-active-pane] video")).toBe(incoming);
    expect(handlers.onProbeAspect).toHaveBeenLastCalledWith(1920 / 1080, 1);
  });

  it("prepares a parked still with its probed aspect and retains it on arrival", () => {
    const still = item({ slug: "still", type: "image", format: "jpg", url: "https://cdn.test/still.jpg" });
    const { view, ref, floor, handlers, rerender } = renderTrack({ rotateMode: true, nextGroupItem: still });
    const image = view.container.querySelector<HTMLImageElement>(`img[src="${still.replication.url}"]`)!;
    Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
    fireEvent.load(image);
    handlers.onNavigateGroup.mockImplementation(() => rerender({ activeItem: still, previousGroupItem: item(), nextGroupItem: null, positionKey: "still|still" }));
    act(() => { ref.current!.slideGroup(1); });
    fireEvent.transitionEnd(floor, { propertyName: "transform" });
    expect(view.container.querySelector("[data-viewer-active-pane] img")).toBe(image);
    expect(handlers.onProbeAspect).toHaveBeenLastCalledWith(1200 / 800, 1);
  });

  it("cancels an in-flight group commit when an external position replaces it", () => {
    vi.useFakeTimers();
    const { ref, handlers, rerender } = renderTrack();
    act(() => { ref.current!.slideGroup(1); });
    rerender({ activeItem: next, positionKey: "external|next" });
    act(() => vi.runAllTimers());
    expect(handlers.onNavigateGroup).not.toHaveBeenCalled();
  });

  it("uses a neighbor's poster to prepare orientation without loading its video", () => {
    const destination = item({ slug: "poster", url: "https://cdn.test/poster.mp4", thumbnail_url: "https://cdn.test/poster.jpg" });
    const { view, ref, floor, handlers, rerender } = renderTrack({ nextGroupItem: destination, rotateMode: true });
    const image = view.container.querySelector<HTMLImageElement>(`img[src="${destination.replication.thumbnail_url}"]`)!;
    const incoming = view.container.querySelector<HTMLVideoElement>(`video[src="${destination.replication.url}"]`)!;
    Object.defineProperties(image, { naturalWidth: { value: 1920 }, naturalHeight: { value: 1080 } });
    fireEvent.load(image);
    expect(incoming.preload).toBe("none");
    handlers.onNavigateGroup.mockImplementation(() => rerender({ activeItem: destination, previousGroupItem: item(), nextGroupItem: null, positionKey: "poster|poster" }));
    act(() => { ref.current!.slideGroup(1); });
    fireEvent.transitionEnd(floor, { propertyName: "transform" });
    expect(handlers.onProbeAspect).toHaveBeenLastCalledWith(1920 / 1080, 1);
    expect(view.container.querySelector("[data-viewer-active-pane] video")).toBe(incoming);
  });

  it("keeps the correct poster visible through metadata, then retains the frame during buffering", () => {
    const activeItem = item({ thumbnail_url: "https://cdn.test/clip.jpg" });
    const { view } = renderTrack({ activeItem });
    const video = view.container.querySelector<HTMLVideoElement>("[data-viewer-active-pane] video")!;
    const poster = view.container.querySelector<HTMLImageElement>(`img[src="${activeItem.replication.thumbnail_url}"]`)!.parentElement!;
    expect(poster).toBeVisible();
    fireEvent.loadedMetadata(video);
    expect(poster).toBeVisible();
    act(() => presentFrame(video));
    expect(poster).not.toBeVisible();
    fireEvent.waiting(video);
    expect(poster).not.toBeVisible();
    expect(video.src).toBe(activeItem.replication.url);
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
  });

  it("does not reveal a recycled slot's previous artwork or its stale frame callback", () => {
    const { view, rerender } = renderTrack({ activeItem: item({ thumbnail_url: "https://cdn.test/clip.jpg" }) });
    const video = view.container.querySelector<HTMLVideoElement>("[data-viewer-active-pane] video")!;
    const staleFrame = Array.from(pendingFrames.values()).find((frame) => frame.video === video)!.callback;
    act(() => presentFrame(video));
    const replacement = item({ slug: "replacement", url: "https://cdn.test/replacement.mp4", thumbnail_url: "https://cdn.test/replacement.jpg" });
    rerender({ activeItem: replacement, positionKey: "group|replacement" });
    const poster = view.container.querySelector<HTMLImageElement>('img[src="https://cdn.test/replacement.jpg"]')!.parentElement!;
    expect(view.container.querySelector('img[src="https://cdn.test/clip.jpg"]')).toBeNull();
    expect(poster).toBeVisible();
    act(() => staleFrame(0, {} as VideoFrameCallbackMetadata));
    expect(poster).toBeVisible();
    act(() => presentFrame(video));
    expect(poster).not.toBeVisible();
    rerender({ activeItem: item({ thumbnail_url: "https://cdn.test/clip.jpg" }), positionKey: "group|clip" });
    expect(view.container.querySelector<HTMLImageElement>('img[src="https://cdn.test/clip.jpg"]')!.parentElement).toBeVisible();
  });

  it("requires current data and a paint opportunity in the native frame fallback", () => {
    vi.useFakeTimers();
    Object.defineProperty(HTMLVideoElement.prototype, "requestVideoFrameCallback", { configurable: true, value: undefined });
    const { view } = renderTrack({ activeItem: item({ thumbnail_url: "https://cdn.test/clip.jpg" }) });
    const video = view.container.querySelector<HTMLVideoElement>("[data-viewer-active-pane] video")!;
    const poster = view.container.querySelector<HTMLImageElement>('img[src="https://cdn.test/clip.jpg"]')!.parentElement!;
    Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_METADATA });
    fireEvent.loadedMetadata(video);
    act(() => vi.advanceTimersByTime(100));
    expect(poster).toBeVisible();
    Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
    fireEvent.playing(video);
    expect(poster).toBeVisible();
    act(() => vi.advanceTimersByTime(100));
    expect(poster).not.toBeVisible();
  });

  it("cancels frame requests and releases every player on unmount", async () => {
    vi.useFakeTimers();
    const { view, viewport } = renderTrack({ allowNeighborPreload: true });
    const players = Array.from(view.container.querySelectorAll("video"));
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 200, clientY: 280 });
    expect(pendingFrames.size).toBe(3);
    await act(async () => {
      view.unmount();
      vi.runAllTimers();
    });
    expect(pendingFrames.size).toBe(0);
    expect(players.every((video) => !video.hasAttribute("src"))).toBe(true);
  });

  it("loads an audio work on its own player only after the reader presses play", () => {
    const clip = item({ slug: "hum", type: "audio", format: "ogg", url: "https://cdn.test/hum.ogg", preview_url: undefined });
    const { view } = renderTrack({ activeItem: clip, positionKey: "group|hum" });

    const player = view.getByRole("group", { name: "Audio player: Clip" }).querySelector("audio")!;
    expect(player).not.toHaveAttribute("src");
    // The clip belongs to neither pooled layer: as a video source it presents
    // no frame, and as an image source it never decodes.
    expect(view.container.querySelector('video[src="https://cdn.test/hum.ogg"]')).toBeNull();
    expect(view.container.querySelector('img[src="https://cdn.test/hum.ogg"]')).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Play Clip" }));

    expect(player).toHaveAttribute("src", clip.replication.url);
    expect(player.play).toHaveBeenCalled();
    fireEvent.play(player);
    expect(view.getByRole("button", { name: "Pause Clip" })).toBeInTheDocument();
  });

  it("stops a clip once its slide leaves the centre pane", () => {
    const clip = item({ slug: "hum", type: "audio", format: "ogg", url: "https://cdn.test/hum.ogg", preview_url: undefined });
    const { view, ref, floor, handlers, rerender } = renderTrack({ activeItem: clip, positionKey: "group|hum" });
    const player = view.getByRole("group", { name: "Audio player: Clip" }).querySelector("audio")!;
    fireEvent.click(view.getByRole("button", { name: "Play Clip" }));
    expect(player).toHaveAttribute("src", clip.replication.url);
    fireEvent.play(player);
    expect(view.getByRole("button", { name: "Pause Clip" })).toBeInTheDocument();
    const pause = vi.fn();
    Object.defineProperty(player, "pause", { configurable: true, value: pause });
    handlers.onNavigateWork.mockImplementation(() => rerender({
      activeItem: next,
      previousItem: clip,
      nextItem: null,
      positionKey: "group|next",
    }));
    expect(pause).not.toHaveBeenCalled();

    act(() => expect(ref.current!.slide(1)).toBe(true));
    fireEvent.transitionEnd(floor, { propertyName: "transform" });

    // Pooled slides stay mounted, so an unpaused clip would keep playing from
    // a pane the reader has already left.
    expect(pause).toHaveBeenCalled();
  });
});
