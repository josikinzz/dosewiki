import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  ViewerMediaTrack,
  type ViewerTrackHandle,
} from "./ViewerMediaTrack";
import type { ReplicationViewerMediaItem } from "./viewerModel";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src }: { src: string }) => <img src={src} alt="" />,
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

function renderTrack(
  props: Partial<Parameters<typeof ViewerMediaTrack>[0]> = {},
) {
  const ref = createRef<ViewerTrackHandle>();
  const handlers = {
    onActiveVideoChange: vi.fn(),
    onNavigateWork: vi.fn(),
    onNavigateGroup: vi.fn(),
    onSurfaceTap: vi.fn(),
    onPointerActivity: vi.fn(),
    onProbeAspect: vi.fn(),
  };
  const view = render(
    <ViewerMediaTrack
      ref={ref}
      previousItem={null}
      activeItem={item()}
      nextItem={item({ slug: "next", title: "Next", url: "https://cdn.test/next.mp4", preview_url: "https://cdn.test/next-preview.mp4" })}
      positionKey="group|clip"
      activeQuality="preview"
      autoplayAllowed
      activeMediaClassName="inset-0 h-full w-full"
      controlsVisible
      {...handlers}
      {...props}
    />,
  );
  return { ref, handlers, view };
}

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

describe("ViewerMediaTrack", () => {
  it("blesses parked pool elements once inside a gesture, then re-parks them", async () => {
    const { ref } = renderTrack();
    const neighbor = document.querySelector<HTMLVideoElement>(
      'video[src="https://cdn.test/next-preview.mp4"]',
    );
    expect(neighbor).not.toBeNull();
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    Object.defineProperty(neighbor!, "play", { value: play });
    Object.defineProperty(neighbor!, "pause", { value: pause });

    ref.current!.blessPool();
    expect(play).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    // The blessing play() is immediately parked again — it only exists to
    // mark the element user-activated for later unmuted playback.
    expect(pause).toHaveBeenCalled();
    expect(neighbor!.muted).toBe(true);

    ref.current!.blessPool();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("commits a vertical swipe as group navigation", () => {
    const { handlers } = renderTrack();
    const viewport = document.querySelector(
      "[data-replication-media-track]",
    ) as HTMLElement;
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 200, clientY: 280 });
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 200, clientY: 280 });
    expect(handlers.onNavigateGroup).toHaveBeenCalledWith(1);
    expect(handlers.onNavigateWork).not.toHaveBeenCalled();
  });

  it("carries playback position across a preview-to-full quality swap", () => {
    const { view } = renderTrack();
    const active = document.querySelector<HTMLVideoElement>(
      'video[src="https://cdn.test/clip-preview.mp4"]',
    );
    expect(active).not.toBeNull();
    let time = 7.5;
    Object.defineProperty(active!, "currentTime", {
      configurable: true,
      get: () => time,
      set: (value: number) => {
        time = value;
      },
    });
    Object.defineProperty(active!, "paused", {
      configurable: true,
      value: false,
    });

    view.rerender(
      <ViewerMediaTrack
        previousItem={null}
        activeItem={item()}
        nextItem={null}
        positionKey="group|clip"
        activeQuality="full"
        autoplayAllowed
        activeMediaClassName="inset-0 h-full w-full"
        controlsVisible
        onActiveVideoChange={vi.fn()}
        onNavigateWork={vi.fn()}
        onNavigateGroup={vi.fn()}
        onSurfaceTap={vi.fn()}
        onPointerActivity={vi.fn()}
        onProbeAspect={vi.fn()}
      />,
    );

    expect(active!.src).toBe("https://cdn.test/clip.mp4");
    expect(active!.currentTime).toBe(7.5);
    // The same pooled element was reused, not replaced.
    expect(
      document.querySelector('video[src="https://cdn.test/clip.mp4"]'),
    ).toBe(active);
  });

  it("silences and stills the outgoing element when a slide commits", () => {
    const { ref, handlers } = renderTrack();
    const outgoing = document.querySelector<HTMLVideoElement>(
      'video[src="https://cdn.test/clip-preview.mp4"]',
    )!;
    outgoing.muted = false;
    const pause = vi.fn();
    Object.defineProperty(outgoing, "pause", { value: pause });
    Object.defineProperty(outgoing, "paused", {
      configurable: true,
      value: false,
    });

    // jsdom reports zero width, so the slide commits synchronously — the
    // same path a finished swipe animation takes.
    expect(ref.current!.slide(1)).toBe(true);

    expect(handlers.onNavigateWork).toHaveBeenCalledWith(1);
    expect(outgoing.muted).toBe(true);
    expect(pause).toHaveBeenCalled();
  });
});
