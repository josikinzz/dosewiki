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
  preview_url: "https://example.test/geometry-frog-preview.mp4",
  thumbnail_url: "https://example.test/geometry-frog.jpg",
  width: 1280,
  height: 720,
};

const AUDIO: GalleryReplication = {
  _id: "k57audioenhancement",
  _creationTime: 0,
  slug: "auditory-enhancement-emex",
  title: "Auditory enhancement",
  artist: "EmEx",
  effect_slug: "auditory-enhancement",
  type: "audio",
  format: "ogg",
  created_at: "2016-01-30",
  url: "https://example.test/audio-enhancement.ogg",
  duration: 45,
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

  it("keeps the frame link navigable while its hover preview is mounted", async () => {
    stubDesktopPointer();
    stubPlayback();
    const user = userEvent.setup();

    const { container } = render(
      <GalleryMediaTile replication={VIDEO} viewerHref={VIEWER_HREF} />,
    );
    const link = screen.getByRole("link");
    const navigate = vi.fn((event: MouseEvent) => {
      event.preventDefault();
      return (event.currentTarget as HTMLAnchorElement).getAttribute("href");
    });
    link.addEventListener("click", navigate);
    await user.hover(link);

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", VIDEO.preview_url);

    // The pointer-transparent preview leaves the anchor as the browser's hit
    // target. jsdom cannot hit-test; targeting the video directly instead
    // blurs the anchor and removes the preview before the click can occur.
    await user.click(link);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveReturnedWith(VIEWER_HREF);
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

    const { container } = render(
      <GalleryMediaTile replication={VIDEO} viewerHref={VIEWER_HREF} />,
    );

    // Playback is hover-gated; an unhovered tile never mounts a video.
    expect(container.querySelector("video")).toBeNull();
  });

  it("hover plays the preview rendition, not the full source", async () => {
    stubDesktopPointer();
    stubPlayback();
    const user = userEvent.setup();

    const { container } = render(
      <GalleryMediaTile replication={VIDEO} viewerHref={VIEWER_HREF} />,
    );
    await user.hover(screen.getByRole("link"));

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", VIDEO.preview_url);

    // Mouse-out unmounts the preview again.
    await user.unhover(screen.getByRole("link"));
    expect(container.querySelector("video")).toBeNull();
  });

  it("keeps a video without a preview static instead of loading its full source", async () => {
    stubDesktopPointer();
    const user = userEvent.setup();
    const { container } = render(
      <GalleryMediaTile
        replication={{ ...VIDEO, preview_url: undefined }}
        viewerHref={VIEWER_HREF}
      />,
    );

    await user.hover(screen.getByRole("link"));

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

    const { container } = render(
      <GalleryMediaTile replication={VIDEO} viewerHref={VIEWER_HREF} />,
    );
    await user.hover(screen.getByRole("link"));

    expect(container.querySelector("video")).toBeNull();
    // The chip is their signal that the still is actually a video.
    expect(screen.getByText(/Video/)).toBeInTheDocument();
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
    expect(screen.getByText(/Animation/)).toBeInTheDocument();
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
    // The corner chip names the medium, so a GIF still reads as an animation
    // even when no motion rendition exists to play: the marker describes the
    // artifact, and the absence of a <video> above is what proves nothing
    // plays.
    expect(screen.getByText(/Animation/)).toBeInTheDocument();
  });

  it("serves a still's own thumbnail rendition rather than its master", () => {
    // The corpus stores 640px renditions beside multi-megabyte masters; a
    // grid column is ~190px wide, so a tile that reaches for `url` downloads
    // and decodes several times the picture it can show.
    const { container } = render(
      <GalleryMediaTile
        replication={{
          ...VIDEO,
          type: "image",
          format: "jpg",
          url: "https://example.test/master.jpg",
          thumbnail_url: "https://example.test/rendition.webp",
        }}
        viewerHref={VIEWER_HREF}
      />,
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.test/rendition.webp",
    );
  });

  it("falls back to a still's master when it has no rendition", () => {
    const { container } = render(
      <GalleryMediaTile
        replication={{
          ...VIDEO,
          type: "image",
          format: "jpg",
          url: "https://example.test/master.jpg",
          thumbnail_url: undefined,
        }}
        viewerHref={VIEWER_HREF}
      />,
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.test/master.jpg",
    );
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

describe("GalleryMediaTile audio", () => {
  it("draws its own frame instead of handing the clip to the image layer", () => {
    const { container } = render(
      <GalleryMediaTile replication={AUDIO} viewerHref="/replications?viewer=auditory-enhancement-emex" />,
    );

    // The clip URL in an <img> is a permanently broken image, and the tile
    // would sit under a shimmer waiting for bytes that never decode.
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".theme-skeleton-pulse")).toBeNull();
    expect(
      container.querySelectorAll(".theme-replication-waveform-bar").length,
    ).toBeGreaterThan(0);
  });

  it("stays a plain link to the viewer, with an audio chip and the clip length", () => {
    const { container } = render(
      <GalleryMediaTile replication={AUDIO} viewerHref="/replications?viewer=auditory-enhancement-emex" />,
    );

    // Nothing on the tile competes with opening the work: no transport here.
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/replications?viewer=auditory-enhancement-emex",
    );
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("audio")).toBeNull();
    expect(screen.getByText(/Audio/)).toBeInTheDocument();
    expect(screen.getByText("0:45")).toBeInTheDocument();
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
    // The caption is dense at every breakpoint now, and never hidden: a title
    // only a hover reveals is a title touch readers never get.
    expect(container.querySelector("figcaption")).toHaveClass("mt-1");
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
