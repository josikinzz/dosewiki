import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReplicationThumb } from "./ReplicationThumb";
import type { StudioRow } from "./replicationStudioModel";

const VIDEO: StudioRow = {
  id: "video-1",
  slug: "geometry-preview",
  title: "Geometry preview",
  artist: "Preview Artist",
  artist_url: null,
  role: "replication",
  type: "video",
  effect_slug: "geometry",
  effect_name: "Geometry",
  effect_tags: [],
  credit_line: null,
  url: "https://example.test/full-video.mp4",
  thumbnail_url: "https://example.test/poster.jpg",
  preview_url: "https://example.test/compressed-preview.mp4",
  format: "mp4",
  duration: 12,
  file_size: 8_000_000,
  created_at: "2026-01-01T00:00:00.000Z",
};

function stubMediaQueries({ hover = true, reducedMotion = false } = {}) {
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList =>
      ({
        matches: query.includes("prefers-reduced-motion") ? reducedMotion : hover,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

function stubEverythingInView() {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      disconnect() {}
    },
  );
}
function stubPreviewFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const segments = String(input).split("/");
    const slug = decodeURIComponent(segments[segments.length - 2] ?? "");
    return Response.json({ ok: true, previewUrl: `https://example.test/${slug}-preview.mp4` });
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ReplicationThumb playlist video previews", () => {
  it("plays the compressed rendition on hover instead of the full source", async () => {
    stubMediaQueries();
    stubPreviewFetch();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { container } = render(<ReplicationThumb row={VIDEO} enableVideoPreview />);

    await user.hover(container.firstElementChild as HTMLElement);

    const video = await waitFor(() => {
      const element = container.querySelector("video");
      expect(element).not.toBeNull();
      return element as HTMLVideoElement;
    });
    expect(video).toHaveAttribute("src", `https://example.test/${VIDEO.slug}-preview.mp4`);
    expect(video).not.toHaveAttribute("src", VIDEO.url);
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video.muted).toBe(true);

    await user.unhover(container.firstElementChild as HTMLElement);
    await waitFor(() => expect(container.querySelector("video")).toBeNull());
  });

  it("limits in-view playlist playback to four videos", async () => {
    stubMediaQueries();
    stubEverythingInView();
    stubPreviewFetch();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    const { container } = render(
      <>
        {Array.from({ length: 5 }, (_, index) => (
          <ReplicationThumb
            key={index}
            row={{ ...VIDEO, slug: `video-${index}` }}
            enableVideoPreview
          />
        ))}
      </>,
    );

    await waitFor(() => expect(container.querySelectorAll("video")).toHaveLength(4));
  });

  it("keeps the poster still for reduced-motion users", async () => {
    stubMediaQueries({ reducedMotion: true });
    stubEverythingInView();
    const user = userEvent.setup();
    const { container } = render(<ReplicationThumb row={VIDEO} enableVideoPreview />);

    await user.hover(container.firstElementChild as HTMLElement);

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", VIDEO.thumbnail_url);
  });

  it("does not add playback work outside explicitly enabled playlist thumbnails", async () => {
    stubMediaQueries();
    stubEverythingInView();
    const user = userEvent.setup();
    const { container } = render(<ReplicationThumb row={VIDEO} />);

    await user.hover(container.firstElementChild as HTMLElement);

    expect(container.querySelector("video")).toBeNull();
  });
});
