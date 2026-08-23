import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(
      screen.getByRole("button", { name: "Show information" }),
    ).toBeInTheDocument();
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
    expect(video).toHaveAttribute("loop");
  });

  it("keeps long ordinary videos finite", () => {
    const { container } = render(
      <ReplicationMediaStage
        item={item({ duration: 60 })}
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

    expect(container.querySelector("video")).not.toHaveAttribute("loop");
  });
});
