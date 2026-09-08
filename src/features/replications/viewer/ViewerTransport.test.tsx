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
  Object.defineProperties(video, {
    duration: { configurable: true, value: 30 },
    readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA },
    buffered: {
      configurable: true,
      value: { length: 1, start: () => 0, end: () => 30 },
    },
  });
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
  canRotate: false,
  fullscreenSupported: false,
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
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
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

  it.each(["toggleMuted", "togglePlayback"] as const)(
    "keeps surface taps chrome-only and restores refused audio through %s",
    async (restoreAudio) => {
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

    // Tapping hides chrome without changing the muted fallback.
    act(() => handle!.surfaceTap());
    expect(video.muted).toBe(true);
    expect(stage).not.toHaveAttribute("data-controls-visible");
    expect(screen.queryByRole("slider", { name: "Seek" })).not.toBeInTheDocument();

    // Explicit playback and unmute own restoration without revealing chrome.
    (video.play as Mock).mockResolvedValue(undefined);
    if (restoreAudio === "togglePlayback") act(() => handle!.togglePlayback());
    setPaused(video, true);
    act(() => handle![restoreAudio]());
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);
    if (restoreAudio === "toggleMuted") {
      expect(onMutedChange).toHaveBeenCalledWith(false);
    } else {
      expect(onMutedChange).not.toHaveBeenCalled();
    }
    expect(stage).not.toHaveAttribute("data-controls-visible");
    },
  );

  it("adopts an already-playing bound element without any play event", () => {
    const video = createVideo();
    setPaused(video, false);
    render(<ViewerTransport {...baseProps(video)} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("keeps the full source and playhead through sustained playback and ending", () => {
    vi.useFakeTimers();
    const video = createVideo();
    setDuration(video, 90);
    setPaused(video, false);
    video.currentTime = 25;
    render(
      <ViewerTransport
        {...baseProps(video, {
          item: item({
            duration: 90,
            preview_url: "https://cdn.test/tracers-preview.mp4",
          }),
        })}
      />,
    );

    fireEvent(video, new Event("loadedmetadata"));
    expect(video.loop).toBe(false);
    act(() => vi.advanceTimersByTime(10_000));
    expect(video.src).toBe("https://cdn.test/tracers.mp4");
    expect(video.currentTime).toBe(25);
    expect(video.load).not.toHaveBeenCalled();

    video.currentTime = 90;
    fireEvent(video, new Event("ended"));
    expect(video.src).toBe("https://cdn.test/tracers.mp4");
    expect(video.currentTime).toBe(90);
    expect(video.load).not.toHaveBeenCalled();
  });

  it("loops short full videos without consulting their preview duration", () => {
    const video = createVideo();
    setDuration(video, 30);
    render(
      <ViewerTransport
        {...baseProps(video, {
          item: item({ preview_url: "https://cdn.test/tracers-preview.mp4" }),
        })}
      />,
    );
    fireEvent(video, new Event("loadedmetadata"));
    expect(video.loop).toBe(true);
  });

  it("seeks across the full work without replacing its source", () => {
    const video = createVideo();
    setDuration(video, 30);
    render(
      <ViewerTransport
        {...baseProps(video, {
          item: item({ preview_url: "https://cdn.test/tracers-preview.mp4" }),
        })}
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

    // The complete work is available immediately, including beyond ten seconds.
    fireEvent.pointerDown(slider, { clientX: 90, button: 0, pointerId: 1 });
    expect(video.src).toBe("https://cdn.test/tracers.mp4");
    expect(video.load).not.toHaveBeenCalled();
    expect(video.currentTime).toBeCloseTo(27, 5);
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(video.currentTime).toBe(30);
    expect(video.src).toBe("https://cdn.test/tracers.mp4");
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

  it("keeps an explicit hide across next work, play, pause, and ended events", () => {
    const video = createVideo();
    let handle: ViewerTransportHandle | null = null;
    const onTransportHandle = (next: ViewerTransportHandle | null) => {
      handle = next;
    };
    const { rerender } = render(
      <ViewerTransport {...baseProps(video, { onTransportHandle })} />,
    );

    // Paused media must be just as hideable as playing media.
    act(() => handle!.toggleChrome());
    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "Seek" })).not.toBeInTheDocument();

    const nextVideo = createVideo("https://cdn.test/next.mp4");
    rerender(
      <ViewerTransport
        {...baseProps(nextVideo, {
          item: item({ slug: "next-work", title: "Next work", url: nextVideo.src }),
          onTransportHandle,
        })}
      />,
    );
    const stage = screen.getByRole("region", { name: "Next work media controls" });
    expect(stage).not.toHaveAttribute("data-controls-visible");
    act(() => handle!.togglePlayback());
    setPaused(nextVideo, false);
    fireEvent(nextVideo, new Event("play"));
    fireEvent(nextVideo, new Event("playing"));
    expect(stage).not.toHaveAttribute("data-controls-visible");
    act(() => handle!.togglePlayback());
    fireEvent(nextVideo, new Event("pause"));
    fireEvent(nextVideo, new Event("ended"));
    expect(stage).not.toHaveAttribute("data-controls-visible");

    act(() => handle!.toggleChrome());
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Seek" })).toBeInTheDocument();
  });

  it("returns focus to the viewer before hiding focused controls", () => {
    let handle: ViewerTransportHandle | null = null;
    render(
      <div role="dialog" aria-label="Viewer" tabIndex={-1}>
        <ViewerTransport
          {...baseProps(createVideo(), {
            onTransportHandle: (next) => { handle = next; },
          })}
        />
      </div>,
    );
    const play = screen.getByRole("button", { name: "Pause" });
    act(() => play.focus());
    expect(play).toHaveFocus();
    act(() => handle!.toggleChrome());
    expect(screen.getByRole("dialog", { name: "Viewer" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "Seek" })).not.toBeInTheDocument();
  });

  it("reveals error recovery without forgetting the hidden preference", () => {
    const video = createVideo();
    let handle: ViewerTransportHandle | null = null;
    render(
      <ViewerTransport
        {...baseProps(video, {
          onTransportHandle: (next) => { handle = next; },
        })}
      />,
    );
    act(() => handle!.toggleChrome());
    fireEvent(video, new Event("error"));
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent(video, new Event("play"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "Seek" })).not.toBeInTheDocument();
  });

  it("reveals blocked playback recovery, then returns to the hidden preference", async () => {
    const video = createVideo();
    (video.play as Mock).mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    let handle: ViewerTransportHandle | null = null;
    render(
      <ViewerTransport
        {...baseProps(video, {
          onTransportHandle: (next) => { handle = next; },
        })}
      />,
    );
    act(() => handle!.toggleChrome());
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();

    (video.play as Mock).mockResolvedValue(undefined);
    const play = screen.getByRole("button", { name: "Play" });
    act(() => play.focus());
    fireEvent.click(play);
    fireEvent(video, new Event("play"));
    expect(play).not.toHaveFocus();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "Seek" })).not.toBeInTheDocument();
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

  it("offers artwork rotation and information without a quality switch", () => {
    const video = createVideo();
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
      screen.queryByRole("button", { name: "Play original quality" }),
    ).not.toBeInTheDocument();
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

  it("auto-starts a stalled startup with ordinary chrome hidden and Pause cancels it", () => {
    vi.useFakeTimers();
    const video = createVideo();
    Object.defineProperty(video, "buffered", {
      configurable: true,
      value: { length: 0, start: () => 0, end: () => 0 },
    });
    let handle: ViewerTransportHandle | null = null;
    render(<ViewerTransport {...baseProps(video, {
      onTransportHandle: (next) => { handle = next; },
    })} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    act(() => handle!.toggleChrome());
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.queryByRole("slider", { name: "Seek" })).not.toBeInTheDocument();
    expect(video.play).toHaveBeenCalledOnce();
    act(() => handle!.togglePlayback());
    fireEvent(video, new Event("progress"));
    act(() => vi.advanceTimersByTime(5_000));
    expect(video.play).toHaveBeenCalledOnce();
  });

  it("does not resume the previous pooled work while its replacement node is being reported", () => {
    const previous = createVideo();
    previous.dataset.slug = "tracers-loop";
    const { rerender } = render(<ViewerTransport {...baseProps(previous)} />);
    (previous.play as Mock).mockClear();
    setPaused(previous, false);
    const nextItem = item({ slug: "next-work", url: "https://cdn.test/next.mp4" });
    rerender(<ViewerTransport {...baseProps(previous, { item: nextItem })} />);
    fireEvent(previous, new Event("canplay"));
    fireEvent(previous, new Event("progress"));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(previous.pause).toHaveBeenCalledOnce();
    expect(previous.play).not.toHaveBeenCalled();

    const next = createVideo(nextItem.replication.url);
    next.dataset.slug = "next-work";
    rerender(<ViewerTransport {...baseProps(next, { item: nextItem })} />);
    expect(next.play).toHaveBeenCalledOnce();
    expect(previous.play).not.toHaveBeenCalled();
  });
});
