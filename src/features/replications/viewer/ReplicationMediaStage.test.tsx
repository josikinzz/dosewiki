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
  ReplicationMediaStage,
  type ReplicationStageTransportHandle,
} from "./ReplicationMediaStage";
import type { ReplicationViewerMediaItem } from "./viewerModel";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    className?: string;
  }) => <img src={src} alt={alt} className={className} />,
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
  Object.defineProperty(HTMLMediaElement.prototype, "load", {
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
    const onRotateModeChange = vi.fn();
    const onFullscreen = vi.fn();

    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        rotateMode={false}
        onRotateModeChange={onRotateModeChange}
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

    const playButton = screen.getByRole("button", { name: "Play" });
    const unmuteButton = screen.getByRole("button", { name: "Unmute" });
    expect(playButton).toBeInTheDocument();
    expect(unmuteButton).toBeInTheDocument();
    // Tailwind's size-11 utility makes both coarse-pointer hit boxes 44 CSS px square.
    expect(playButton).toHaveClass("[@media(pointer:coarse)]:size-11");
    expect(unmuteButton).toHaveClass("[@media(pointer:coarse)]:size-11");
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("0");
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
    fireEvent.click(
      screen.getByRole("button", { name: "Rotate to fill screen" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Previous work" }));
    fireEvent.click(screen.getByRole("button", { name: "Next work" }));
    fireEvent.click(screen.getByRole("button", { name: "Show information" }));
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));

    expect(onMutedChange).toHaveBeenCalledWith(false);
    expect(onVolumeChange).toHaveBeenCalledWith(0.25);
    expect(onRotateModeChange).toHaveBeenCalledWith(true);
    expect(
      screen.getByRole("button", { name: "Rotate to fill screen" }),
    ).toHaveAttribute("aria-pressed", "false");
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

  it("shows the loading icon immediately but delays and stabilizes the copy", () => {
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
    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "paused", {
      configurable: true,
      value: false,
    });

    fireEvent.play(video);
    fireEvent.waiting(video);
    expect(screen.getByRole("img", { name: "Buffering" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1999));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Playback is taking longer than expected.",
    );

    fireEvent.playing(video);
    expect(
      screen.queryByRole("img", { name: "Buffering" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1499));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("releases the media pipeline when the stage's video detaches", async () => {
    const { container, unmount } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).toHaveAttribute("src");
    const load = HTMLMediaElement.prototype.load as Mock;
    load.mockClear();

    unmount();
    // The release defers one microtask to survive StrictMode's simulated
    // remount (detach + immediate re-attach without unmounting the DOM).
    await Promise.resolve();

    // Detached elements keep their media player (and any in-flight fetch)
    // alive until GC; browsers cap live players per page and then silently
    // refuse new loads. The empty-source load frees the player immediately.
    expect(video.hasAttribute("src")).toBe(false);
    expect(load).toHaveBeenCalled();
  });

  it("retries a silently stalled load once, then surfaces the retryable error card", () => {
    vi.useFakeTimers();
    render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    const load = HTMLMediaElement.prototype.load as Mock;
    load.mockClear();

    // jsdom's readyState stays HAVE_NOTHING: no metadata, no error event —
    // exactly the silent stall a capped-out browser produces.
    act(() => vi.advanceTimersByTime(5000));
    expect(load).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This media could not be loaded",
    );

    load.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledOnce();
  });

  it("bridges brief recovery events without flashing the buffering copy", () => {
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
    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "paused", {
      configurable: true,
      value: false,
    });

    fireEvent.waiting(video);
    act(() => vi.advanceTimersByTime(1200));
    fireEvent.playing(video);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.stalled(video);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1500));

    fireEvent.playing(video);
    act(() => vi.advanceTimersByTime(500));
    fireEvent.waiting(video);
    expect(screen.getByRole("status")).toBeInTheDocument();

    fireEvent.playing(video);
    act(() => vi.advanceTimersByTime(749));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    Object.defineProperty(video, "paused", {
      configurable: true,
      value: true,
    });
    fireEvent.pause(video);
    fireEvent.waiting(video);
    expect(
      screen.queryByRole("img", { name: "Buffering" }),
    ).not.toBeInTheDocument();
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

  it("fades a GIF rendition poster once a frame is decodable, not on playback progress", () => {
    const { container } = render(
      <ReplicationMediaStage
        item={item({
          type: "image",
          format: "gif",
          url: "https://cdn.test/tracers.gif",
          motion_url: "https://cdn.test/tracers.mp4",
          motion_poster_url: "https://cdn.test/tracers-poster.webp",
        })}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    const underlay = container.querySelector(
      'img[src="https://cdn.test/tracers-poster.webp"]',
    )?.parentElement as HTMLElement;
    expect(underlay.className).toContain("opacity-100");

    // Playback progress alone no longer gates the fade…
    fireEvent.timeUpdate(video);
    expect(underlay.className).toContain("opacity-100");

    // …a decodable first frame does. canplay is the fallback signal where
    // requestVideoFrameCallback is unavailable, as in jsdom.
    fireEvent.canPlay(video);
    expect(underlay.className).toContain("opacity-0");
  });

  it("does not present an editorial video thumbnail as its first frame", () => {
    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    expect(container.querySelector("video")).not.toHaveAttribute("poster");
    expect(
      container.querySelector('img[src="https://cdn.test/tracers.webp"]'),
    ).not.toBeInTheDocument();
  });

  it("lets media-stage taps pass through the transport pill gaps", () => {
    render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    const play = screen.getByRole("button", { name: "Play" });
    expect(play.parentElement).toHaveClass("pointer-events-none");
    expect(play).toHaveClass("pointer-events-auto");
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

  it("keeps a playing video playing on tap and toggles the chrome instead", () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
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
    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "paused", {
      configurable: true,
      value: false,
    });
    fireEvent.play(video);
    pause.mockClear();
    const playCallsBeforeTaps = play.mock.calls.length;

    // Tap = reveal/dismiss chrome, never pause (the still-stage grammar).
    expect(stage).toHaveAttribute("data-controls-visible", "true");
    fireEvent.click(video);
    expect(stage).not.toHaveAttribute("data-controls-visible");
    fireEvent.click(video);
    expect(stage).toHaveAttribute("data-controls-visible", "true");
    expect(pause).not.toHaveBeenCalled();
    expect(play.mock.calls.length).toBe(playCallsBeforeTaps);

    // Pause lives exclusively on the play button.
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(pause).toHaveBeenCalledOnce();
  });

  it("anchors the playback cluster to the media box's bottom-left corner", () => {
    // Landscape 16:9 — spare space sits above/below; left hugs the stage.
    const { rerender } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    // The pill node survives rerenders: React keeps the DOM element while
    // only its style/class props change, so one capture observes every step.
    const pill = screen
      .getByRole("button", { name: "Play" })
      .closest("div") as HTMLElement;
    expect(pill.className).toContain("left-[var(--media-box-left)]");
    expect(pill.className).toContain("bottom-[var(--media-box-bottom)]");
    expect(pill.style.getPropertyValue("--media-box-left")).toBe(
      `calc((100cqw - min(100cqw, 100cqh * ${16 / 9})) / 2 + 0.75rem)`,
    );
    expect(pill.style.getPropertyValue("--media-box-bottom")).toBe(
      `calc((100cqh - min(100cqh, 100cqw / ${16 / 9})) / 2 + 0.75rem)`,
    );

    // Rotate mode turns the landscape media box sideways: it presents the
    // inverted aspect, the cluster follows the turned box's corner, and the
    // left inset widens to clear the vertical seek bar's 20px hit zone.
    rerender(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        rotateMode
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    expect(pill.style.getPropertyValue("--media-box-left")).toBe(
      `calc((100cqw - min(100cqw, 100cqh * ${9 / 16})) / 2 + 1.75rem)`,
    );
    expect(pill.style.getPropertyValue("--media-box-bottom")).toBe(
      `calc((100cqh - min(100cqh, 100cqw / ${9 / 16})) / 2 + 0.75rem)`,
    );

    // Portrait 9:16 stays upright even while the mode holds.
    rerender(
      <ReplicationMediaStage
        item={item({ slug: "tall-loop", width: 900, height: 1600 })}
        muted
        volume={1}
        rotateMode
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    expect(pill.style.getPropertyValue("--media-box-left")).toBe(
      `calc((100cqw - min(100cqw, 100cqh * ${9 / 16})) / 2 + 0.75rem)`,
    );
    expect(pill.style.getPropertyValue("--media-box-bottom")).toBe(
      `calc((100cqh - min(100cqh, 100cqw / ${9 / 16})) / 2 + 0.75rem)`,
    );

    // Square.
    rerender(
      <ReplicationMediaStage
        item={item({ slug: "square-loop", width: 1200, height: 1200 })}
        muted
        volume={1}
        rotateMode
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    expect(pill.style.getPropertyValue("--media-box-left")).toBe(
      "calc((100cqw - min(100cqw, 100cqh * 1)) / 2 + 0.75rem)",
    );
    expect(pill.style.getPropertyValue("--media-box-bottom")).toBe(
      "calc((100cqh - min(100cqh, 100cqw / 1)) / 2 + 0.75rem)",
    );
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
  it("rotates only the stage media and stays sticky across landscape works", () => {
    const { container, rerender } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        rotateMode
        onRotateModeChange={vi.fn()}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    const video = container.querySelector("video")!;
    expect(video.className).toContain("rotate-90");
    // Chrome stays upright: the stage section itself never transforms.
    expect(
      screen.getByRole("region", { name: "Tracers loop media" }).className,
    ).not.toContain("rotate-90");
    expect(
      screen.getByRole("button", { name: "Rotate back upright" }),
    ).toHaveAttribute("aria-pressed", "true");

    // The mode survives advancing: the next landscape work turns unasked.
    rerender(
      <ReplicationMediaStage
        item={item({ slug: "wide-two", title: "Second wide" })}
        muted
        volume={1}
        rotateMode
        onRotateModeChange={vi.fn()}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    expect(container.querySelector("video")!.className).toContain("rotate-90");
  });

  it("lands portrait works upright while the pressed toggle keeps the mode", () => {
    const { container, rerender } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        rotateMode
        onRotateModeChange={vi.fn()}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    expect(container.querySelector("video")!.className).toContain("rotate-90");

    rerender(
      <ReplicationMediaStage
        item={item({ slug: "tall-loop", width: 900, height: 1600 })}
        muted
        volume={1}
        rotateMode
        onRotateModeChange={vi.fn()}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    expect(container.querySelector("video")!.className).not.toContain(
      "rotate-90",
    );
    expect(
      screen.getByRole("button", { name: "Rotate back upright" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("leans control icons with the rotated work and eases them back upright", () => {
    const onRotatedChange = vi.fn();
    const { rerender } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        rotateMode
        onRotateModeChange={vi.fn()}
        onRotatedChange={onRotatedChange}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    const playIcon = screen
      .getByRole("button", { name: "Play" })
      .querySelector("[data-rotating-icon]")!;
    expect(playIcon.className).toContain("rotate-90");
    expect(onRotatedChange).toHaveBeenLastCalledWith(true);

    rerender(
      <ReplicationMediaStage
        item={item({ slug: "tall-loop", width: 900, height: 1600 })}
        muted
        volume={1}
        rotateMode
        onRotateModeChange={vi.fn()}
        onRotatedChange={onRotatedChange}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Play" })
        .querySelector("[data-rotating-icon]")!.className,
    ).not.toContain("rotate-90");
    expect(onRotatedChange).toHaveBeenLastCalledWith(false);
  });

  it("offers no rotate control and never rotates outside the portrait phone layout", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        rotateMode
        onRotateModeChange={vi.fn()}
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

  it("never re-forces the shared sound choice onto the element while a sound IOU is outstanding", async () => {
    // The autoplay regression: the video ref callback used to be inline, so
    // every re-render re-ran it and stamped `muted={false}` back onto the
    // element after attemptPlay's muted retry had armed the IOU. Outside a
    // gesture WebKit answers that forced unmute by pausing the video — a
    // swipe-arrival landed paused. The rotate work guaranteed such arrival
    // re-renders (portrait seed, onRotatedChange report), surfacing it on
    // every navigation for sound-on sessions.
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    play.mockImplementation(function (this: HTMLMediaElement) {
      return this.muted
        ? Promise.resolve()
        : Promise.reject(new DOMException("denied", "NotAllowedError"));
    });

    const { container, rerender } = render(
      <ReplicationMediaStage
        item={item()}
        muted={false}
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    await act(async () => {});

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.muted).toBe(true); // IOU armed: element retried muted

    // An internal state re-render (playback starting)…
    fireEvent.play(video);
    expect(video.muted).toBe(true);

    // …and an external prop-identical re-render both leave the element
    // muted; only a live gesture may repay the IOU.
    rerender(
      <ReplicationMediaStage
        item={item()}
        muted={false}
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    expect(video.muted).toBe(true);

    play.mockReset();
    play.mockResolvedValue(undefined);
  });

  it("holds a dimensionless work invisible until its aspect settles, then reveals it in the settled orientation", () => {
    const { container } = render(
      <ReplicationMediaStage
        item={item({ width: null, height: null })}
        muted
        volume={1}
        rotateMode
        onRotateModeChange={vi.fn()}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    // The 16:9 guess would paint rotated; nothing may show until the probe.
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.className).toContain("opacity-0");
    expect(
      container.querySelector('img[src="https://cdn.test/tracers.webp"]'),
    ).not.toBeInTheDocument();

    // The probe lands portrait: reveal upright, no rotate flash ever shown.
    Object.defineProperty(video, "videoWidth", {
      configurable: true,
      value: 900,
    });
    Object.defineProperty(video, "videoHeight", {
      configurable: true,
      value: 1600,
    });
    fireEvent.loadedMetadata(video);
    expect(video.className).not.toContain("opacity-0");
    expect(video.className).not.toContain("rotate-90");
  });

  it("settles a dimensionless still through its decoded image instead of holding it invisible forever", () => {
    const { container } = render(
      <ReplicationMediaStage
        item={item({
          type: "image",
          format: "jpg",
          url: "https://cdn.test/still.jpg",
          width: null,
          height: null,
        })}
        muted
        volume={1}
        rotateMode
        onRotateModeChange={vi.fn()}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );

    const image = container.querySelector(
      'img[src="https://cdn.test/still.jpg"]',
    ) as HTMLImageElement;
    expect(image.className).toContain("opacity-0");

    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 1600,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 900,
    });
    fireEvent.load(image);
    expect(image.className).not.toContain("opacity-0");
    expect(image.className).toContain("rotate-90");
  });

  it("paints catalogued landscape work rotated and visible from the start", () => {
    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        rotateMode
        onRotateModeChange={vi.fn()}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.className).toContain("rotate-90");
    expect(video.className).not.toContain("opacity-0");
  });

  it("stands the seek bar up along the left edge while rotated and maps pointer Y to the timeline", () => {
    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        rotateMode
        onRotateModeChange={vi.fn()}
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
    // The same bar, turned with the media: vertical, flush left.
    expect(slider).toHaveAttribute("aria-orientation", "vertical");
    expect(slider.className).toContain("inset-y-0");
    expect(slider.className).toContain("left-0");
    expect(slider.className).not.toContain("bottom-0");
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 20,
      top: 0,
      bottom: 100,
      height: 100,
      right: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    // Progress runs top-to-bottom, so the pointer's Y drives the seek; its
    // X (here far right of the track) must be ignored.
    fireEvent.pointerDown(slider, {
      clientX: 300,
      clientY: 25,
      button: 0,
      pointerId: 1,
    });
    expect(video.currentTime).toBeCloseTo(7.5, 5);
    fireEvent.pointerMove(slider, { clientX: 5, clientY: 50, pointerId: 1 });
    expect(video.currentTime).toBeCloseTo(15, 5);
    fireEvent.pointerUp(slider, { clientX: 0, clientY: 80, pointerId: 1 });
    expect(video.currentTime).toBeCloseTo(24, 5);

    // The accent fill grows downward and the thumb rides the vertical axis.
    const fill = container.querySelector(
      ".theme-media-playback-fill",
    ) as HTMLElement;
    expect(fill.style.transform).toBe("scaleY(0.8)");
    expect(fill.className).toContain("origin-top");
    const thumb = container.querySelector(
      ".theme-media-playback-thumb",
    ) as HTMLElement;
    expect(thumb.style.top).toBe("80%");
    expect(thumb.style.left).toBe("");

    // Down/Up seek along the turned timeline.
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    expect(video.currentTime).toBe(29);
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    expect(video.currentTime).toBe(24);
  });

  it("keeps the upright seek bar horizontal along the bottom edge", () => {
    render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={1}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Seek" });
    expect(slider).not.toHaveAttribute("aria-orientation");
    expect(slider.className).toContain("inset-x-0");
    expect(slider.className).toContain("bottom-0");
  });

  it("shows the buffering icon when a cold load paints nothing within 300ms", () => {
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
    const video = container.querySelector("video") as HTMLVideoElement;
    // jsdom's readyState 0 models a cold network load: nothing decodable.
    expect(
      screen.queryByRole("img", { name: "Buffering" }),
    ).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole("img", { name: "Buffering" })).toBeInTheDocument();

    // First decodable data settles it through the ordinary buffering path.
    fireEvent.canPlay(video);
    expect(
      screen.queryByRole("img", { name: "Buffering" }),
    ).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("skips the cold-load icon when frames arrive before the delay", () => {
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
    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "readyState", {
      configurable: true,
      value: HTMLMediaElement.HAVE_CURRENT_DATA,
    });
    act(() => vi.advanceTimersByTime(300));
    expect(
      screen.queryByRole("img", { name: "Buffering" }),
    ).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("registers gesture-safe transport verbs and reports transport visibility", () => {
    vi.useFakeTimers();
    const onMutedChange = vi.fn();
    const onTransportVisibleChange = vi.fn();
    let handle: ReplicationStageTransportHandle | null = null;
    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={0.6}
        onMutedChange={onMutedChange}
        onVolumeChange={vi.fn()}
        onTransportVisibleChange={onTransportVisibleChange}
        onTransportHandle={(next) => {
          handle = next;
        }}
      />,
    );
    expect(handle).not.toBeNull();
    expect(onTransportVisibleChange).toHaveBeenLastCalledWith(true);

    const video = container.querySelector("video") as HTMLVideoElement;
    const play = video.play as Mock;
    const playCallsBefore = play.mock.calls.length;
    // Paused element: the playback verb asks it to play.
    act(() => handle!.togglePlayback());
    expect(play.mock.calls.length).toBe(playCallsBefore + 1);

    // The sound verb flips the element inside the gesture and reports out.
    act(() => handle!.toggleMuted());
    expect(video.muted).toBe(false);
    expect(onMutedChange).toHaveBeenCalledWith(false);

    // Once playback runs unattended, the idle hide reaches the overlay too.
    Object.defineProperty(video, "paused", {
      configurable: true,
      value: false,
    });
    fireEvent.play(video);
    act(() => vi.advanceTimersByTime(2601));
    expect(onTransportVisibleChange).toHaveBeenLastCalledWith(false);
    vi.useRealTimers();
  });
});
