import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GalleryMediaTile } from "./GalleryMediaTile";
import type { GalleryReplication } from "@/types/replications";

const VIDEO: GalleryReplication = {
  _id: "k57geometryfrog",
  _creationTime: 0,
  slug: "geometry-frog-symmetric-vision",
  title: "Geometry Frog",
  artist: "Symmetric Vision",
  effect_slug: "geometry",
  type: "video",
  storage_id: "kg57geometryfrog",
  format: "mp4",
  created_at: "2024-01-01",
  url: "https://example.test/geometry-frog.mp4",
  thumbnail_url: "https://example.test/geometry-frog.jpg",
  width: 1280,
  height: 720,
};

const VIEWER_HREF = `/replications?viewer=${VIDEO.slug}`;

/**
 * jsdom ships no matchMedia, and the hover preview is gated on it. Report a
 * desktop mouse so the preview can mount at all — on any other pointer the
 * video never renders and there is nothing to assert.
 */
function stubDesktopPointer() {
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList =>
      ({
        matches: query.includes("hover: hover"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

/**
 * jsdom implements no media playback, so `play()` returns undefined where the
 * component expects the promise every browser returns.
 */
function stubPlayback() {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GalleryMediaTile", () => {
  it("links the whole frame to the work", () => {
    render(<GalleryMediaTile replication={VIDEO} viewerHref={VIEWER_HREF} />);

    expect(screen.getByRole("link")).toHaveAttribute("href", VIEWER_HREF);
  });

  it("lets a click on the hover preview reach the link underneath it", async () => {
    stubDesktopPointer();
    stubPlayback();
    const user = userEvent.setup();

    const { container } = render(
      <GalleryMediaTile replication={VIDEO} viewerHref={VIEWER_HREF} />,
    );
    await user.hover(screen.getByRole("link"));

    // The preview is the anchor's last child at inset-0, so it is the topmost
    // hit target across the entire tile, and a browser does not forward a media
    // element's click to an ancestor anchor the way it does for an image.
    // Without this guard every video tile stops navigating — which is how it
    // shipped once.
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveClass("pointer-events-none");
  });

  it("mounts no preview when the pointer is not a hover-capable mouse", async () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string): MediaQueryList =>
        ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    const user = userEvent.setup();

    const { container } = render(
      <GalleryMediaTile replication={VIDEO} viewerHref={VIEWER_HREF} />,
    );
    await user.hover(screen.getByRole("link"));

    // A touch device must never autoload video on tap.
    expect(container.querySelector("video")).toBeNull();
  });

  it("plays nothing at rest, even on a desktop pointer", () => {
    stubDesktopPointer();
    const preview = {
      ...VIDEO,
      preview_url: "https://example.test/geometry-frog-preview.mp4",
    };

    const { container } = render(
      <GalleryMediaTile replication={preview} viewerHref={VIEWER_HREF} />,
    );

    // Playback is hover-gated; an unhovered tile never mounts a video.
    expect(container.querySelector("video")).toBeNull();
  });

  it("hover plays the preview rendition, not the full source", async () => {
    stubDesktopPointer();
    stubPlayback();
    const user = userEvent.setup();
    const preview = {
      ...VIDEO,
      preview_url: "https://example.test/geometry-frog-preview.mp4",
    };

    const { container } = render(
      <GalleryMediaTile replication={preview} viewerHref={VIEWER_HREF} />,
    );
    await user.hover(screen.getByRole("link"));

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", preview.preview_url);
    expect(video).toHaveClass("pointer-events-none");

    // Mouse-out unmounts the preview again.
    await user.unhover(screen.getByRole("link"));
    expect(container.querySelector("video")).toBeNull();
  });

  it("stays static for reduced-motion readers but still labels the tile a video", async () => {
    // Report only the reduced-motion query as matching: the hover gate closes
    // even though the pointer could be a fine mouse.
    vi.stubGlobal(
      "matchMedia",
      (query: string): MediaQueryList =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    const user = userEvent.setup();
    const preview = {
      ...VIDEO,
      preview_url: "https://example.test/geometry-frog-preview.mp4",
    };

    const { container } = render(
      <GalleryMediaTile replication={preview} viewerHref={VIEWER_HREF} />,
    );
    await user.hover(screen.getByRole("link"));

    expect(container.querySelector("video")).toBeNull();
    // The chip is their signal that the still is actually a video.
    expect(screen.getByText("Video")).toBeInTheDocument();
  });

  it("shows a duration chip in m:ss on video tiles", () => {
    render(
      <GalleryMediaTile
        replication={{ ...VIDEO, duration: 83.4 }}
        viewerHref={VIEWER_HREF}
      />,
    );

    expect(screen.getByText("1:23")).toBeInTheDocument();
  });

  it("uses the static motion poster for GIF-like work", () => {
    const { container } = render(
      <GalleryMediaTile
        replication={{
          ...VIDEO,
          type: "image",
          format: "gif",
          url: "https://example.test/original.gif",
          thumbnail_url: "https://example.test/legacy-thumb.webp",
          motion_url: "https://example.test/motion.mp4",
          motion_poster_url: "https://example.test/motion.webp",
        }}
        viewerHref={VIEWER_HREF}
      />,
    );

    expect(
      container.querySelector('img[src="https://example.test/motion.webp"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('img[src="https://example.test/original.gif"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Animation")).toBeInTheDocument();
  });

  it("never mounts a raw GIF when the motion pair is absent", () => {
    const { container } = render(
      <GalleryMediaTile
        replication={{
          ...VIDEO,
          type: "image",
          format: "gif",
          url: "https://example.test/original.gif",
          thumbnail_url: "https://example.test/legacy-thumb.webp",
          motion_url: "https://example.test/orphaned-motion.mp4",
          motion_poster_url: undefined,
        }}
        viewerHref={VIEWER_HREF}
      />,
    );

    expect(
      container.querySelector('img[src="https://example.test/original.gif"]'),
    ).not.toBeInTheDocument();
    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(screen.queryByText("Animation")).not.toBeInTheDocument();
  });

  // jsdom never fetches images, so a fresh poster is "in flight" until the
  // test fires the element's own load or error event.
  it("shimmers over an in-flight poster and reveals it on load", async () => {
    const { container } = render(
      <GalleryMediaTile replication={VIDEO} viewerHref={VIEWER_HREF} />,
    );
    const poster = container.querySelector("img")!;

    expect(container.querySelector(".theme-skeleton-pulse")).toBeInTheDocument();
    expect(poster).toHaveClass("opacity-0");
    expect(poster).toHaveClass("text-transparent");

    await act(async () => {
      poster.dispatchEvent(new Event("load"));
    });

    expect(container.querySelector(".theme-skeleton-pulse")).toBeNull();
    expect(poster).toHaveClass("opacity-100");
  });

  it("falls back to the placeholder when the poster fails to fetch", async () => {
    const { container } = render(
      <GalleryMediaTile replication={VIDEO} viewerHref={VIEWER_HREF} />,
    );

    await act(async () => {
      container.querySelector("img")!.dispatchEvent(new Event("error"));
    });

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".theme-skeleton-pulse")).toBeNull();
    expect(screen.getAllByText("Geometry Frog").length).toBeGreaterThan(0);
  });
});

describe("GalleryMediaTile caption contract", () => {
  it("shows the title and byline by default", () => {
    render(<GalleryMediaTile replication={VIDEO} viewerHref={VIEWER_HREF} />);

    expect(screen.getByText("Geometry Frog")).toBeInTheDocument();
    expect(screen.getByText("by Symmetric Vision")).toBeInTheDocument();
  });

  it("normalizes unattributed corpus markers", () => {
    render(
      <GalleryMediaTile
        replication={{ ...VIDEO, artist: "Unknown" }}
        viewerHref={VIEWER_HREF}
      />,
    );

    expect(screen.getByText("Creator unknown")).toBeInTheDocument();
    expect(screen.queryByText("by Unknown")).not.toBeInTheDocument();
  });

  it("drops only the byline when showByline is false", () => {
    // Artist rails already name the artist in their heading; repeating it
    // under all fourteen tiles is the same words fourteen times.
    render(
      <GalleryMediaTile
        replication={VIDEO}
        viewerHref={VIEWER_HREF}
        showByline={false}
      />,
    );

    expect(screen.getByText("Geometry Frog")).toBeInTheDocument();
    expect(screen.queryByText("by Symmetric Vision")).toBeNull();
  });

  it("keeps a compact title and creator credit on narrow layouts", () => {
    const { container } = render(
      <GalleryMediaTile
        replication={VIDEO}
        viewerHref={VIEWER_HREF}
        mobileCompact
      />,
    );

    expect(screen.getByText("Geometry Frog")).toBeInTheDocument();
    expect(screen.getByText("by Symmetric Vision")).toBeInTheDocument();
    expect(container.querySelector("figcaption")).toHaveClass("max-md:mt-1");
    expect(container.querySelector("figcaption")).not.toHaveClass(
      "max-md:hidden",
    );
  });
});

describe("GalleryMediaTile onOpen", () => {
  it("routes clicks through onOpen while staying a crawlable anchor", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn((event: React.MouseEvent, _work: unknown) =>
      event.preventDefault(),
    );

    render(
      <GalleryMediaTile
        replication={VIDEO}
        viewerHref={VIEWER_HREF}
        onOpen={onOpen}
      />,
    );

    // Still a real link — new-tab and crawling must survive interception.
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", VIEWER_HREF);

    await user.click(link);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][1]).toEqual(VIDEO);
  });
});
