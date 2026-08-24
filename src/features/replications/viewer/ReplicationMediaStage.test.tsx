import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ReplicationMediaStage } from "./ReplicationMediaStage";
import type { ReplicationViewerMediaItem } from "./viewerModel";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

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

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
});

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ReplicationMediaStage", () => {
  it("presents one accessible transport on desktop and phone layouts", () => {
    const onMutedChange = vi.fn();
    const onVolumeChange = vi.fn();
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const onInfo = vi.fn();
    const onFullscreen = vi.fn();

    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={0.6}
        onMutedChange={onMutedChange}
        onVolumeChange={onVolumeChange}
        onPrevious={onPrevious}
        onNext={onNext}
        onInfo={onInfo}
        infoOpen
        infoControls="replication-info"
        onFullscreen={onFullscreen}
        fullscreenLabel="Fullscreen"
        previousLabel="Previous work"
        nextLabel="Next work"
      />,
    );

    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("0.6");
    expect(
      screen.getByRole("button", { name: "Rotate to fill screen" }),
    ).toBeInTheDocument();
    const informationButton = screen.getByRole("button", {
      name: "Show information",
    });
    expect(informationButton).toHaveAttribute("aria-expanded", "true");
    expect(informationButton).toHaveAttribute(
      "aria-controls",
      "replication-info",
    );
    expect(
      screen.getByRole("button", { name: "Fullscreen" }),
    ).toBeInTheDocument();
    expect(container.querySelector("video")).toHaveAttribute("loop");

    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
      target: { value: "0.25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rotate to fill screen" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous work" }));
    fireEvent.click(screen.getByRole("button", { name: "Next work" }));
    fireEvent.click(screen.getByRole("button", { name: "Show information" }));
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));

    expect(onMutedChange).toHaveBeenCalledWith(false);
    expect(onVolumeChange).toHaveBeenCalledWith(0.25);
    expect(
      screen.getByRole("button", { name: "Rotate back upright" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
    expect(onInfo).toHaveBeenCalledOnce();
    expect(onFullscreen).toHaveBeenCalledOnce();
  });

  it("auto-hides transport after playback starts without another pointer event", () => {
    vi.useFakeTimers();
    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    const stage = screen.getByRole("region", { name: "Tracers loop media" });
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "paused", {
      configurable: true,
      value: false,
    });

    fireEvent.play(video);
    expect(stage).toHaveAttribute("data-controls-visible", "true");
    act(() => vi.advanceTimersByTime(2601));
    expect(stage).not.toHaveAttribute("data-controls-visible");
    vi.useRealTimers();
  });

  it("does not autoplay when reduced motion is requested", () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });

  it("retries muted without flipping the shared control, then the next tap restores sound", async () => {
    const onMutedChange = vi.fn();
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    play.mockClear();
    play.mockImplementation(function (this: HTMLMediaElement) {
      return this.muted
        ? Promise.resolve()
        : Promise.reject(new DOMException("denied", "NotAllowedError"));
    });

    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted={false}
        volume={1}
        onMutedChange={onMutedChange}
        onVolumeChange={vi.fn()}
      />,
    );

    await act(async () => {});

    const video = container.querySelector("video") as HTMLVideoElement;
    // The element retried muted so the work keeps moving…
    expect(video.muted).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
    // …but the reader's stated preference is preserved, not overwritten.
    expect(onMutedChange).not.toHaveBeenCalled();
    fireEvent.play(video);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();

    // The next tap on the stage runs inside user activation, where the
    // browser accepts the unmute — it repays the sound IOU instead of
    // toggling pause, so one tap never needs a second one.
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    pause.mockClear();
    play.mockImplementation(() => Promise.resolve());
    fireEvent.click(video);
    await act(async () => {});
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);
    expect(pause).not.toHaveBeenCalled();

    play.mockReset();
    play.mockResolvedValue(undefined);
  });

  it("keeps one media element alive across works so its playback blessing survives", async () => {
    const first = item();
    const { container, rerender } = render(
      <ReplicationMediaStage
        item={first}
        muted={false}
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    await act(async () => {});
    const video = container.querySelector("video") as HTMLVideoElement;

    rerender(
      <ReplicationMediaStage
        item={item({
          slug: "afterimages",
          title: "Afterimages",
          url: "https://cdn.test/afterimages.mp4",
        })}
        muted={false}
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    await act(async () => {});

    // Same element, new source: iOS Safari's unmuted-playback blessing is
    // per-element, so a swipe must swap src instead of remounting.
    expect(container.querySelector("video")).toBe(video);
    expect(video).toHaveAttribute("src", "https://cdn.test/afterimages.mp4");
  });

  it("uses a controllable motion rendition for GIF rows without losing the poster", () => {
    const { container } = render(
      <ReplicationMediaStage
        item={item({
          type: "image",
          format: "gif",
          url: "https://cdn.test/original.gif",
          motion_url: "https://cdn.test/motion.mp4",
          motion_poster_url: "https://cdn.test/motion.webp",
          duration: 120,
        })}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        fullscreenLabel="Fullscreen"
        previousLabel="First work"
        nextLabel="Final work"
      />,
    );

    const video = container.querySelector("video");
    expect(video).toHaveAttribute("src", "https://cdn.test/motion.mp4");
    expect(video).toHaveAttribute("poster", "https://cdn.test/motion.webp");
    expect(
      screen.queryByRole("button", { name: "First work" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Final work" }),
    ).not.toBeInTheDocument();
  });

  it("does not load a raw GIF when its controllable rendition is absent", () => {
    const { container } = render(
      <ReplicationMediaStage
        item={item({
          type: "image",
          format: "gif",
          url: "https://cdn.test/original.gif",
          thumbnail_url: "https://cdn.test/legacy-thumb.webp",
          motion_url: "https://cdn.test/orphaned-motion.mp4",
          motion_poster_url: undefined,
        })}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "Tracers loop" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Animation unavailable until its controllable rendition is ready.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Play" }),
    ).not.toBeInTheDocument();
  });

  it("keeps multi-work endpoint controls visible and disabled", () => {
    render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onNext={vi.fn()}
        previousLabel="First work"
        nextLabel="Next work"
      />,
    );

    expect(screen.getByRole("button", { name: "First work" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next work" })).toBeEnabled();
  });

  it("lets a still image tap hide and restore its controls", () => {
    render(
      <ReplicationMediaStage
        item={item({
          type: "image",
          format: "jpg",
          url: "https://cdn.test/still.jpg",
        })}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onInfo={vi.fn()}
      />,
    );

    const stage = screen.getByRole("region", { name: "Tracers loop media" });
    fireEvent.click(screen.getByRole("button", { name: "Hide controls" }));
    expect(stage).not.toHaveAttribute("data-controls-visible");
    fireEvent.click(screen.getByRole("button", { name: "Show controls" }));
    expect(stage).toHaveAttribute("data-controls-visible", "true");
  });

  it("renders no badge or sound controls over a still image", () => {
    render(
      <ReplicationMediaStage
        item={item({
          type: "image",
          format: "jpg",
          url: "https://cdn.test/still.jpg",
        })}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("Still image")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unmute" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Play" }),
    ).not.toBeInTheDocument();
  });

  it("hides sound controls for silent GIF-derived motion", () => {
    render(
      <ReplicationMediaStage
        item={item({
          type: "image",
          format: "gif",
          motion_url: "https://cdn.test/motion.mp4",
          motion_poster_url: "https://cdn.test/poster.webp",
        })}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unmute" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Volume")).not.toBeInTheDocument();
  });

  it("withdraws sound controls once a video probes silent", () => {
    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
    const video = container.querySelector("video") as HTMLVideoElement & {
      mozHasAudio?: boolean;
    };
    video.mozHasAudio = false;
    fireEvent.loadedMetadata(video);
    expect(
      screen.queryByRole("button", { name: "Unmute" }),
    ).not.toBeInTheDocument();
  });

  it("keeps sound controls for a video that probes audible", () => {
    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    const video = container.querySelector("video") as HTMLVideoElement & {
      mozHasAudio?: boolean;
    };
    video.mozHasAudio = true;
    fireEvent.loadedMetadata(video);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
  });

  it("renders the accent playback meter only for ordinary videos", () => {
    const { container, rerender } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    expect(
      container.querySelector(".theme-media-playback-fill"),
    ).toBeInTheDocument();

    rerender(
      <ReplicationMediaStage
        item={item({
          type: "image",
          format: "gif",
          motion_url: "https://cdn.test/motion.mp4",
          motion_poster_url: "https://cdn.test/poster.webp",
        })}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    expect(
      container.querySelector(".theme-media-playback-fill"),
    ).not.toBeInTheDocument();
  });

  it("exposes the video progress bar as a labelled slider only for ordinary videos", () => {
    const { rerender } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    const slider = screen.getByRole("slider", { name: "Seek" });
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "30");
    expect(slider).toHaveAttribute("aria-valuenow", "0");

    rerender(
      <ReplicationMediaStage
        item={item({
          type: "image",
          format: "gif",
          motion_url: "https://cdn.test/motion.mp4",
          motion_poster_url: "https://cdn.test/poster.webp",
        })}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("slider", { name: "Seek" }),
    ).not.toBeInTheDocument();
  });

  it("seeks by press and drag on the slider without toggling playback", () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    pause.mockClear();

    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      writable: true,
      value: 0,
    });
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
    const playCallsBeforeScrub = play.mock.calls.length;

    // The catalogued 30s duration stands in for jsdom's NaN video.duration.
    fireEvent.pointerDown(slider, { clientX: 25, button: 0, pointerId: 1 });
    expect(video.currentTime).toBeCloseTo(7.5, 5);
    fireEvent.pointerMove(slider, { clientX: 50, pointerId: 1 });
    expect(video.currentTime).toBeCloseTo(15, 5);
    fireEvent.pointerUp(slider, { clientX: 80, pointerId: 1 });
    expect(video.currentTime).toBeCloseTo(24, 5);

    // The accent fill and thumb followed the pointer, ahead of the rAF tick.
    const fill = container.querySelector(
      ".theme-media-playback-fill",
    ) as HTMLElement;
    expect(fill.style.transform).toBe("scaleX(0.8)");
    const thumb = container.querySelector(
      ".theme-media-playback-thumb",
    ) as HTMLElement;
    expect(thumb.style.left).toBe("80%");

    // A scrub is never read as a stage tap: playback state was untouched.
    expect(pause).not.toHaveBeenCalled();
    expect(play.mock.calls.length).toBe(playCallsBeforeScrub);

    // A stray move with no press held does not seek.
    fireEvent.pointerMove(slider, { clientX: 10, pointerId: 1 });
    expect(video.currentTime).toBeCloseTo(24, 5);
  });

  it("seeks five seconds with arrow keys on the focused slider", () => {
    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      writable: true,
      value: 0,
    });
    const slider = screen.getByRole("slider", { name: "Seek" });

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(video.currentTime).toBe(5);
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(video.currentTime).toBe(10);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(video.currentTime).toBe(5);

    video.currentTime = 28;
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(video.currentTime).toBe(30);
    video.currentTime = 2;
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(video.currentTime).toBe(0);
  });

  it("paints the buffered stretch around the playhead and mirrors it to aria", async () => {
    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 30,
    });
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      writable: true,
      value: 6,
    });
    Object.defineProperty(video, "buffered", {
      configurable: true,
      value: { length: 1, start: () => 0, end: () => 12 },
    });

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    });

    const buffered = container.querySelector(
      ".theme-media-progress-buffered",
    ) as HTMLElement;
    expect(buffered.style.left).toBe("0%");
    expect(buffered.style.width).toBe("40%");
    const slider = screen.getByRole("slider", { name: "Seek" });
    expect(slider).toHaveAttribute("aria-valuenow", "6");
    expect(slider).toHaveAttribute("aria-valuemax", "30");
  });

  it("auto-hides still-image chrome after inactivity", () => {
    vi.useFakeTimers();
    render(
      <ReplicationMediaStage
        item={item({
          type: "image",
          format: "jpg",
          url: "https://cdn.test/still.jpg",
        })}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    const stage = screen.getByRole("region", { name: "Tracers loop media" });

    expect(stage).toHaveAttribute("data-controls-visible", "true");
    act(() => vi.advanceTimersByTime(2601));
    expect(stage).not.toHaveAttribute("data-controls-visible");
    vi.useRealTimers();
  });

  it("loops long ordinary videos so exploration never dead-ends", () => {
    const { container } = render(
      <ReplicationMediaStage
        item={item({ duration: 600 })}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        fullscreenLabel="Fullscreen"
        previousLabel="First work"
        nextLabel="Final work"
      />,
    );

    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("autoplay");
  });
  it("rotates only the stage media and un-rotates when the next work is not landscape", () => {
    const { container, rerender } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Rotate to fill screen" }),
    );
    const video = container.querySelector("video")!;
    expect(video.className).toContain("rotate-90");
    // Chrome stays upright: the stage section itself never transforms.
    expect(
      screen.getByRole("region", { name: "Tracers loop media" }).className,
    ).not.toContain("rotate-90");

    // Advancing to a portrait work drops the control and paints upright.
    rerender(
      <ReplicationMediaStage
        item={item({ slug: "tall-loop", width: 900, height: 1600 })}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Rotate/ }),
    ).not.toBeInTheDocument();
    expect(container.querySelector("video")!.className).not.toContain(
      "rotate-90",
    );
  });

  it("keeps a rotation from leaking onto the next landscape work", () => {
    const { container, rerender } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Rotate to fill screen" }),
    );
    expect(container.querySelector("video")!.className).toContain("rotate-90");

    rerender(
      <ReplicationMediaStage
        item={item({ slug: "wide-two", title: "Second wide" })}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    expect(container.querySelector("video")!.className).not.toContain(
      "rotate-90",
    );
    expect(
      screen.getByRole("button", { name: "Rotate to fill screen" }),
    ).toBeInTheDocument();
  });

  it("offers no rotate control outside the portrait phone layout", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Rotate/ }),
    ).not.toBeInTheDocument();
  });
});
