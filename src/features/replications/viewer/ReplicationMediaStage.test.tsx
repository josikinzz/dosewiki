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
    const onFullFrameChange = vi.fn();
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const onInfo = vi.fn();
    const onFullscreen = vi.fn();

    const { container } = render(
      <ReplicationMediaStage
        item={item()}
        muted
        volume={0.6}
        fullFrame={false}
        onMutedChange={onMutedChange}
        onVolumeChange={onVolumeChange}
        onFullFrameChange={onFullFrameChange}
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
      screen.getByRole("button", { name: "Full frame" }),
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
    fireEvent.click(screen.getByRole("button", { name: "Full frame" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous work" }));
    fireEvent.click(screen.getByRole("button", { name: "Next work" }));
    fireEvent.click(screen.getByRole("button", { name: "Show information" }));
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));

    expect(onMutedChange).toHaveBeenCalledWith(false);
    expect(onVolumeChange).toHaveBeenCalledWith(0.25);
    expect(onFullFrameChange).toHaveBeenCalledWith(true);
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
        fullFrame={false}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onFullFrameChange={vi.fn()}
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
        fullFrame={false}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onFullFrameChange={vi.fn()}
      />,
    );

    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });

  it("falls back to muted playback when unmuted autoplay is rejected", async () => {
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
        fullFrame={false}
        onMutedChange={onMutedChange}
        onVolumeChange={vi.fn()}
        onFullFrameChange={vi.fn()}
      />,
    );

    await act(async () => {});

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(onMutedChange).toHaveBeenCalledWith(true);
    expect(play).toHaveBeenCalledTimes(2);
    fireEvent.play(video);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();

    play.mockReset();
    play.mockResolvedValue(undefined);
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
        fullFrame={false}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onFullFrameChange={vi.fn()}
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
        fullFrame={false}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onFullFrameChange={vi.fn()}
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
        fullFrame={false}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onFullFrameChange={vi.fn()}
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
        fullFrame={false}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onFullFrameChange={vi.fn()}
        onInfo={vi.fn()}
      />,
    );

    const stage = screen.getByRole("region", { name: "Tracers loop media" });
    fireEvent.click(screen.getByRole("button", { name: "Hide controls" }));
    expect(stage).not.toHaveAttribute("data-controls-visible");
    fireEvent.click(screen.getByRole("button", { name: "Show controls" }));
    expect(stage).toHaveAttribute("data-controls-visible", "true");
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
        fullFrame={false}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onFullFrameChange={vi.fn()}
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
        fullFrame={false}
        onMutedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onFullFrameChange={vi.fn()}
        fullscreenLabel="Fullscreen"
        previousLabel="First work"
        nextLabel="Final work"
      />,
    );

    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("autoplay");
  });
});
