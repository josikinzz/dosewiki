import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import {
  ViewerTransport,
  type ViewerTransportHandle,
  type ViewerTransportProps,
} from "./ViewerTransport";
import type { ReplicationViewerMediaItem } from "./viewerModel";

const item = (
  overrides: Partial<ReplicationViewerMediaItem["replication"]> = {},
): ReplicationViewerMediaItem => ({
  replication: {
    slug: "tracers-loop",
    title: "Tracers loop",
    artist: "Chelsea Morgan",
    type: "video",
    format: "mp4",
    url: "https://cdn.test/tracers.mp4",
    thumbnail_url: "https://cdn.test/tracers.webp",
    width: 1600,
    height: 900,
    duration: 30,
    ...overrides,
  },
  effectName: "Tracers",
  effectSlug: "tracers",
  effectCategories: [],
  artistProfileHref: null,
  avatarUrl: null,
});

/** Elements created outside React, removed after each test. */
let pooledVideos: HTMLVideoElement[] = [];

/**
 * A pooled element the way ViewerMediaTrack hands one over: already in the
 * document (attemptPlay ignores rejections from detached elements), already
 * carrying a src, with jsdom's unimplemented media methods stubbed
 * per-element so each test counts its own element's calls.
 */
const createVideo = (
  src = "https://cdn.test/tracers.mp4",
): HTMLVideoElement => {
  const video = document.createElement("video");
  video.src = src;
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    writable: true,
    value: 0,
  });
  Object.defineProperty(video, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(video, "pause", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(video, "load", {
    configurable: true,
    value: vi.fn(),
  });
  document.body.appendChild(video);
  pooledVideos.push(video);
  return video;
};

const setPaused = (video: HTMLVideoElement, paused: boolean) => {
  Object.defineProperty(video, "paused", { configurable: true, value: paused });
};

const setDuration = (video: HTMLVideoElement, duration: number) => {
  Object.defineProperty(video, "duration", {
    configurable: true,
    value: duration,
  });
};

const baseProps = (
  video: HTMLVideoElement | null,
  overrides: Partial<ViewerTransportProps> = {},
): ViewerTransportProps => ({
  item: item(),
  video,
  muted: true,
  volume: 1,
  onMutedChange: vi.fn(),
  onVolumeChange: vi.fn(),
  quality: "preview",
  onQualityChange: vi.fn(),
  canRotate: false,
  rotated: false,
  fullscreenSupported: false,
  mediaAspect: 16 / 9,
  ...overrides,
});

beforeAll(() => {
  // Baseline for any media element a test forgets to stub per-element.
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "load", {
    configurable: true,
    value: vi.fn(),
  });
});

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const video of pooledVideos) video.remove();
  pooledVideos = [];
});

describe("ViewerTransport", () => {
  it("presents one accessible transport and hides sound controls for silent rows", () => {
    const video = createVideo();
    const { unmount } = render(
      <ViewerTransport
        {...baseProps(video, {
          item: item({ has_audio: true }),
          onPrevious: vi.fn(),
          onNext: vi.fn(),
          onInfo: vi.fn(),
          infoOpen: true,
          infoControls: "replication-info",
          onFullscreen: vi.fn(),
        })}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Tracers loop media controls" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
    const volume = screen.getByRole("slider", { name: "Volume" });
    expect(volume).toHaveValue("0"); // muted presents as zero
    expect(volume).toHaveAttribute("id", "replication-volume-tracers-loop");
    unmount();

    const silent = createVideo();
    render(
      <ViewerTransport
        {...baseProps(silent, { item: item({ has_audio: false }) })}
      />,
    );
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unmute" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("slider", { name: "Volume" }),
    ).not.toBeInTheDocument();
  });

  it("togglePlayback plays a paused element and pauses a playing one", () => {
    // Reduced motion suppresses the mount autoplay so the verb owns every call.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const video = createVideo();
    let handle: ViewerTransportHandle | null = null;
    render(
      <ViewerTransport
        {...baseProps(video, {
          onTransportHandle: (next) => {
            handle = next;
          },
        })}
      />,
    );
    expect(handle).not.toBeNull();
    expect(video.play).not.toHaveBeenCalled();

    act(() => handle!.togglePlayback());
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.pause).not.toHaveBeenCalled();

    setPaused(video, false);
    act(() => handle!.togglePlayback());
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.play).toHaveBeenCalledOnce();
  });

  it("retries a refused unmuted play muted, then a surface tap repays the sound IOU", async () => {
    const video = createVideo();
    (video.play as Mock).mockImplementation(function (this: HTMLVideoElement) {
      return this.muted
        ? Promise.resolve()
        : Promise.reject(new DOMException("denied", "NotAllowedError"));
    });
    const onMutedChange = vi.fn();
    let handle: ViewerTransportHandle | null = null;
    render(
      <ViewerTransport
        {...baseProps(video, {
          muted: false,
          onMutedChange,
          onTransportHandle: (next) => {
            handle = next;
          },
        })}
      />,
    );
    await act(async () => {});

    // The element retried muted so the work keeps moving…
    expect(video.muted).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(2);
    // …without flipping the reader's shared mute control.
    expect(onMutedChange).not.toHaveBeenCalled();

    setPaused(video, false);
    fireEvent(video, new Event("play"));
    const stage = screen.getByRole("region", {
      name: "Tracers loop media controls",
    });
    expect(stage).toHaveAttribute("data-controls-visible", "true");

    // The tap repays the debt instead of toggling the chrome away.
    act(() => handle!.surfaceTap());
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);
    expect(stage).toHaveAttribute("data-controls-visible", "true");

    // With no debt outstanding the same tap is a plain chrome toggle.
    act(() => handle!.surfaceTap());
    expect(stage).not.toHaveAttribute("data-controls-visible");
  });

  it("adopts an already-playing bound element without any play event", () => {
    const video = createVideo();
    setPaused(video, false);
    render(<ViewerTransport {...baseProps(video)} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("continues a truncated preview into the full file on ended instead of looping it", () => {
    const preview = item({
      preview_url: "https://cdn.test/tracers-preview.mp4",
    });
    const video = createVideo("https://cdn.test/tracers-preview.mp4");
    setDuration(video, 10);
    setPaused(video, false);
    const onQualityChange = vi.fn();
    const { unmount } = render(
      <ViewerTransport
        {...baseProps(video, { item: preview, onQualityChange })}
      />,
    );

    // A preview 20s short of the catalogued work must not loop.
    fireEvent(video, new Event("loadedmetadata"));
    expect(video.loop).toBe(false);

    (video.play as Mock).mockClear();
    fireEvent(video, new Event("ended"));
    expect(video.src).toBe("https://cdn.test/tracers.mp4");
    expect(onQualityChange).toHaveBeenCalledWith("full");
    expect(video.currentTime).toBe(10); // picks up where the preview ended
    expect(video.play).toHaveBeenCalledOnce();
    unmount();

    // A preview as long as the catalogued work loops like any other video.
    const complete = createVideo("https://cdn.test/tracers-preview.mp4");
    setDuration(complete, 30);
    render(<ViewerTransport {...baseProps(complete, { item: preview })} />);
    fireEvent(complete, new Event("loadedmetadata"));
    expect(complete.loop).toBe(true);
  });

  it("sharpens a settled work to the full file after sustained playback", () => {
    vi.useFakeTimers();
    const preview = item({
      preview_url: "https://cdn.test/tracers-preview.mp4",
    });
    const video = createVideo("https://cdn.test/tracers-preview.mp4");
    setDuration(video, 10);
    setPaused(video, false);
    const onQualityChange = vi.fn();
    render(
      <ViewerTransport
        {...baseProps(video, { item: preview, onQualityChange })}
      />,
    );

    // A fling moves on before the dwell elapses; nothing fires early.
    act(() => vi.advanceTimersByTime(900));
    expect(onQualityChange).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(200));
    expect(onQualityChange).toHaveBeenCalledWith("full");
    expect(video.src).toBe("https://cdn.test/tracers.mp4");
    vi.useRealTimers();
  });

  it("upgrades to the full file from the HQ button, preserving the playhead", () => {
    const preview = item({
      preview_url: "https://cdn.test/tracers-preview.mp4",
    });
    const video = createVideo("https://cdn.test/tracers-preview.mp4");
    video.currentTime = 5;
    const onQualityChange = vi.fn();
    const { rerender, unmount } = render(
      <ViewerTransport
        {...baseProps(video, { item: preview, onQualityChange })}
      />,
    );

    const hq = screen.getByRole("button", { name: "Play original quality" });
    expect(hq).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(hq);
    expect(onQualityChange).toHaveBeenCalledWith("full");
    expect(video.src).toBe("https://cdn.test/tracers.mp4");
    expect(video.currentTime).toBe(5);

    // aria-pressed mirrors the owning overlay's quality prop.
    rerender(
      <ViewerTransport
        {...baseProps(video, {
          item: preview,
          onQualityChange,
          quality: "full",
        })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Switch to preview quality" }),
    ).toHaveAttribute("aria-pressed", "true");
    unmount();

    // No distinct preview, no HQ escape.
    render(<ViewerTransport {...baseProps(createVideo())} />);
    expect(
      screen.queryByRole("button", { name: "Play original quality" }),
    ).not.toBeInTheDocument();
  });

  it("escalates a seek past the truncated preview's end to the full file", () => {
    const preview = item({
      preview_url: "https://cdn.test/tracers-preview.mp4",
    });
    const video = createVideo("https://cdn.test/tracers-preview.mp4");
    setDuration(video, 10);
    const onQualityChange = vi.fn();
    render(
      <ViewerTransport
        {...baseProps(video, { item: preview, onQualityChange })}
      />,
    );

    const slider = screen.getByRole("slider", { name: "Seek" });
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 100,
      top: 0,
      right: 100,
      bottom: 20,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    // The advertised timeline is the catalogued 30s: x=90 targets 27s, far
    // beyond the 10s preview — swap files rather than clamp.
    fireEvent.pointerDown(slider, { clientX: 90, button: 0, pointerId: 1 });
    expect(video.src).toBe("https://cdn.test/tracers.mp4");
    expect(onQualityChange).toHaveBeenCalledWith("full");
    expect(video.currentTime).toBeCloseTo(27, 5);
  });

  it("surfaces a retryable error card that re-runs the load inside the click", () => {
    const video = createVideo();
    render(<ViewerTransport {...baseProps(video)} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent(video, new Event("error"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This media could not be loaded",
    );

    (video.play as Mock).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(video.load).toHaveBeenCalledOnce();
    expect(video.play).toHaveBeenCalledOnce();
  });

  it("keeps the chrome up through playback and idle time; only a surface tap hides it", () => {
    vi.useFakeTimers();
    const video = createVideo();
    setPaused(video, false);
    let handle: ViewerTransportHandle | null = null;
    render(
      <ViewerTransport
        {...baseProps(video, {
          onTransportHandle: (next) => {
            handle = next;
          },
        })}
      />,
    );
    const stage = screen.getByRole("region", {
      name: "Tracers loop media controls",
    });

    fireEvent(video, new Event("play"));
    expect(stage).toHaveAttribute("data-controls-visible", "true");
    act(() => vi.advanceTimersByTime(60_000));
    expect(stage).toHaveAttribute("data-controls-visible", "true");

    // A surface tap toggles the chrome down, and back up again.
    act(() => handle!.surfaceTap());
    expect(stage).not.toHaveAttribute("data-controls-visible");

    // Pointer travel over the stage is not a reveal mechanism.
    fireEvent.pointerMove(stage, { clientX: 40, clientY: 40 });
    act(() => vi.advanceTimersByTime(100));
    expect(stage).not.toHaveAttribute("data-controls-visible");

    act(() => handle!.surfaceTap());
    expect(stage).toHaveAttribute("data-controls-visible", "true");
  });

  it("keeps the chrome up over stills; toggleChrome hides and re-reveals it without a fade", () => {
    vi.useFakeTimers();
    let handle: ViewerTransportHandle | null = null;
    render(
      <ViewerTransport
        {...baseProps(null, {
          onTransportHandle: (next) => {
            handle = next;
          },
        })}
      />,
    );
    const stage = screen.getByRole("region", {
      name: "Tracers loop media controls",
    });

    expect(stage).toHaveAttribute("data-controls-visible", "true");
    act(() => vi.advanceTimersByTime(60_000));
    expect(stage).toHaveAttribute("data-controls-visible", "true");

    act(() => handle!.toggleChrome());
    expect(stage).not.toHaveAttribute("data-controls-visible");
    act(() => handle!.toggleChrome());
    expect(stage).toHaveAttribute("data-controls-visible", "true");
    act(() => vi.advanceTimersByTime(60_000));
    expect(stage).toHaveAttribute("data-controls-visible", "true");
  });

  it("pins the chrome while paused and while keyboard focus is inside", () => {
    const video = createVideo();
    let handle: ViewerTransportHandle | null = null;
    render(
      <ViewerTransport
        {...baseProps(video, {
          onTransportHandle: (next) => {
            handle = next;
          },
        })}
      />,
    );
    const stage = screen.getByRole("region", {
      name: "Tracers loop media controls",
    });

    // Paused video: an explicit hide is overridden by the pause pin.
    act(() => handle!.toggleChrome());
    expect(stage).toHaveAttribute("data-controls-visible", "true");

    // Playing: the pin lifts, so an explicit hide takes effect.
    setPaused(video, false);
    fireEvent(video, new Event("play"));
    act(() => handle!.toggleChrome());
    expect(stage).not.toHaveAttribute("data-controls-visible");

    // Tab landing on a control reveals the chrome and pins it while focused.
    const play = screen.getByRole("button", { name: "Pause" });
    fireEvent.focus(play);
    expect(stage).toHaveAttribute("data-controls-visible", "true");

    // Focus leaving keeps the chrome up: there is no idle fade to resume.
    fireEvent.blur(play);
    expect(stage).toHaveAttribute("data-controls-visible", "true");
  });

  it("reports transport visibility changes to the overlay", () => {
    vi.useFakeTimers();
    const video = createVideo();
    setPaused(video, false);
    const onTransportVisibleChange = vi.fn();
    let handle: ViewerTransportHandle | null = null;
    render(
      <ViewerTransport
        {...baseProps(video, {
          onTransportVisibleChange,
          onTransportHandle: (next) => {
            handle = next;
          },
        })}
      />,
    );
    expect(onTransportVisibleChange).toHaveBeenLastCalledWith(true);

    fireEvent(video, new Event("play"));
    act(() => handle!.toggleChrome());
    expect(onTransportVisibleChange).toHaveBeenLastCalledWith(false);

    act(() => handle!.toggleChrome());
    expect(onTransportVisibleChange).toHaveBeenLastCalledWith(true);
  });

  it("gates the fullscreen control on platform support", () => {
    const video = createVideo();
    const onFullscreen = vi.fn();
    const { rerender } = render(
      <ViewerTransport
        {...baseProps(video, { onFullscreen, fullscreenSupported: true })}
      />,
    );
    const fullscreen = screen.getByRole("button", { name: "Fullscreen" });
    fireEvent.click(fullscreen);
    expect(onFullscreen).toHaveBeenCalledOnce();

    rerender(
      <ViewerTransport
        {...baseProps(video, { onFullscreen, fullscreenSupported: false })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Fullscreen" }),
    ).not.toBeInTheDocument();
  });

  it("collects the work-level modes — HQ, rotate, info — in the dock", () => {
    const video = createVideo("https://cdn.test/tracers-preview.mp4");
    render(
      <ViewerTransport
        {...baseProps(video, {
          item: item({ preview_url: "https://cdn.test/tracers-preview.mp4" }),
          canRotate: true,
          onRotateModeChange: vi.fn(),
          onInfo: vi.fn(),
        })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Play original quality" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rotate to fill screen" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show information" }),
    ).toBeInTheDocument();
  });

  it("keeps the seek bar horizontal and screen-anchored while the media is rotated", () => {
    const video = createVideo();
    setDuration(video, 30);
    render(
      <ViewerTransport
        {...baseProps(video, {
          canRotate: true,
          rotated: true,
          rotateMode: true,
          onRotateModeChange: vi.fn(),
        })}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Seek" });
    expect(slider).not.toHaveAttribute("aria-orientation");

    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 100,
      top: 0,
      right: 100,
      bottom: 20,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    // Horizontal pointer math still owns the seek: x=50 of 100 → 15s of 30.
    fireEvent.pointerDown(slider, { clientX: 50, button: 0, pointerId: 1 });
    expect(video.currentTime).toBeCloseTo(15, 5);
  });
});
