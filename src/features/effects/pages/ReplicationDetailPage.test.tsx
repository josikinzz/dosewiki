import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ReplicationWithUrl } from "@/types/replications";
import {
  ReplicationDetailPage,
  type ReplicationDetailPageProps,
} from "./ReplicationDetailPage";

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

const replication: ReplicationWithUrl = {
  _id: "rep-1",
  _creationTime: 0,
  slug: "tracers-chelsea-morgan",
  title: "Tracers",
  artist: "Chelsea Morgan",
  artist_url: "https://chelsea.example/",
  type: "image",
  storage_id: "storage-1",
  effect_slug: "tracers",
  format: "webp",
  created_at: "2024-01-01T00:00:00.000Z",
  url: "https://cdn.test/tracers.webp",
};

const props: ReplicationDetailPageProps = {
  replication,
  effectName: "Tracers",
  effectSlug: "tracers",
  effectCategories: [
    {
      slug: "visual-effects",
      name: "Visual effects",
      icon: "lucide:eye",
    },
  ],
  artistProfileHref: "/replications/artist/chelsea-morgan",
};

describe("ReplicationDetailPage", () => {
  it("renders a stable provenance page and opens playback in the source collection", () => {
    const { container } = render(<ReplicationDetailPage {...props} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Tracers" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Chelsea Morgan" }),
    ).toHaveAttribute("href", "/replications/artist/chelsea-morgan");
    expect(
      screen.getByRole("link", { name: "Open in Tracers replications" }),
    ).toHaveAttribute("href", "/effects/tracers?viewer=tracers-chelsea-morgan");
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.test/tracers.webp",
    );
    expect(container.querySelector("video")).toBeNull();
  });

  it("keeps the preview as a sighted-only shortcut without a second accessible route", () => {
    const { container } = render(<ReplicationDetailPage {...props} />);

    const previewLink = container.querySelector('figure a[aria-hidden="true"]');
    expect(previewLink).toHaveAttribute(
      "href",
      "/effects/tracers?viewer=tracers-chelsea-morgan",
    );
    expect(previewLink).toHaveAttribute("tabindex", "-1");
    // Exactly one accessible viewer entry: the header button.
    expect(
      screen.getAllByRole("link", { name: "Open in Tracers replications" }),
    ).toHaveLength(1);
  });

  it("uses a video's poster without creating a second playback surface", () => {
    const video = {
      ...replication,
      type: "video" as const,
      format: "mp4",
      url: "https://cdn.test/tracers.mp4",
      thumbnail_url: "https://cdn.test/tracers-poster.webp",
    };
    const { container } = render(
      <ReplicationDetailPage {...props} replication={video} />,
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.test/tracers-poster.webp",
    );
    expect(container.querySelector("video")).toBeNull();
  });

  it("keeps GIF provenance static even when its poster is unavailable", () => {
    const gif = {
      ...replication,
      format: "gif",
      url: "https://cdn.test/tracers.gif",
      motion_poster_url: "https://cdn.test/tracers-poster.webp",
    };
    const { container, rerender } = render(
      <ReplicationDetailPage {...props} replication={gif} />,
    );

    expect(container.querySelector("img")).toHaveAttribute("src", gif.motion_poster_url);
    expect(screen.getByRole("link", { name: "Open full size" })).toHaveAttribute("href", gif.url);

    rerender(
      <ReplicationDetailPage {...props} replication={{ ...gif, motion_poster_url: undefined }} />,
    );
    expect(container.querySelector("img, video")).toBeNull();
    expect(screen.getByRole("link", { name: "Open in Tracers replications" })).toHaveAttribute(
      "href",
      "/effects/tracers?viewer=tracers-chelsea-morgan",
    );
    expect(screen.getByRole("link", { name: "Open full size" })).toHaveAttribute("href", gif.url);
  });

  it("falls back to the gallery collection when no effect owns the work", () => {
    render(
      <ReplicationDetailPage {...props} effectName={null} effectSlug={null} />,
    );

    expect(
      screen.getByRole("link", { name: "Open in viewer" }),
    ).toHaveAttribute("href", "/replications?viewer=tracers-chelsea-morgan");
  });

  it("states the rights posture exactly once when nothing is licensed", () => {
    render(<ReplicationDetailPage {...props} />);

    expect(
      screen.getAllByText(/Rights remain with the creator or rightsholder/),
    ).toHaveLength(1);
    // No attribution well without a licence to satisfy.
    expect(screen.queryByText("Attribution")).toBeNull();
  });

  it("keeps the licence row and the copyable attribution line for licensed works", () => {
    render(
      <ReplicationDetailPage
        {...props}
        replication={{
          ...replication,
          license_name: "CC BY-SA 4.0",
          license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
    // The attribution sentence still names the artist — that is rights text
    // a reuser copies whole, not a byline.
    expect(
      screen.getByText(
        "Tracers by Chelsea Morgan, licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the rights holder as its own row only when the record carries one", () => {
    const { rerender } = render(<ReplicationDetailPage {...props} />);
    expect(screen.queryByText("Rights holder")).toBeNull();

    rerender(
      <ReplicationDetailPage
        {...props}
        replication={{ ...replication, rightsholder: "Effect Index" }}
      />,
    );
    expect(screen.getByText("Rights holder")).toBeInTheDocument();
    expect(screen.getByText("Effect Index")).toBeInTheDocument();
  });

  it("shows poster provenance without implying an unresolved repost", () => {
    render(
      <ReplicationDetailPage
        {...props}
        identityAttribution={{
          poster: {
            display_name: "ChelseaPoster",
            profile_key: "CHELSEA",
            profile_url: "https://reddit.com/user/ChelseaPoster",
            platform: "Reddit",
            posted_at: Date.UTC(2025, 0, 1),
          },
          creator: { display_name: "ChelseaPoster", profile_key: "CHELSEA" },
          proven_different_creator: false,
        }}
      />,
    );

    expect(screen.getByText("Posted by")).toBeInTheDocument();
    expect(screen.getAllByText("ChelseaPoster")).toHaveLength(2);
    expect(screen.queryByText("Creator")).toBeNull();
    expect(screen.queryByText(/repost/i)).toBeNull();
  });

  it("separates a proven creator from the poster", () => {
    render(
      <ReplicationDetailPage
        {...props}
        identityAttribution={{
          poster: {
            display_name: "ArchivePoster",
            profile_key: null,
            profile_url: null,
            platform: "Reddit",
            posted_at: Date.UTC(2025, 0, 1),
          },
          creator: { display_name: "Documented Creator", profile_key: "CREATOR" },
          proven_different_creator: true,
        }}
      />,
    );

    expect(screen.getByText("Posted by")).toBeInTheDocument();
    expect(screen.getByText("Creator")).toBeInTheDocument();
    expect(screen.getAllByText("Documented Creator")).toHaveLength(2);
  });

  it("labels an external source by host while linking the full URL", () => {
    render(
      <ReplicationDetailPage
        {...props}
        replication={{
          ...replication,
          source_url: "https://gallery.example/works/tracers?size=large",
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "gallery.example" }),
    ).toHaveAttribute(
      "href",
      "https://gallery.example/works/tracers?size=large",
    );
  });

  it("plays an audio work here instead of describing it as an image", () => {
    // The page used to branch `type === "video"` with an image fallback, so an
    // audio row rendered `<AppImage src="….mp3">` under a pill reading "Image".
    // It now renders the same transport the effect article and audio index
    // use, and the viewer button stays: the immersive viewer stages a clip on
    // that same player.
    const { container } = render(
      <ReplicationDetailPage
        {...props}
        replication={{
          ...replication,
          slug: "a-recording",
          title: "A recording",
          type: "audio",
          format: "mp3",
          url: "https://cdn.test/a-recording.mp3",
        }}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Audio player: A recording" }),
    ).toBeInTheDocument();
    // The player loads the clip only once the reader presses play.
    expect(container.querySelector("audio")).not.toHaveAttribute("src");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Audio")).toBeInTheDocument();
    expect(screen.queryByText("Image")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open in Tracers replications" }),
    ).toHaveAttribute("href", "/effects/tracers?viewer=a-recording");
    expect(
      screen.getByRole("link", { name: "Open audio file" }),
    ).toHaveAttribute("href", "https://cdn.test/a-recording.mp3");
  });
});
