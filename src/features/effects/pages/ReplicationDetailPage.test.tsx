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
  avatarUrl: null,
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
    expect(screen.getByRole("img", { name: "Tracers" })).toHaveAttribute(
      "src",
      "https://cdn.test/tracers.webp",
    );
    expect(container.querySelector("video")).toBeNull();
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

    expect(screen.getByRole("img", { name: "Tracers" })).toHaveAttribute(
      "src",
      "https://cdn.test/tracers-poster.webp",
    );
    expect(
      screen.getByText("Video playback opens in the shared viewer."),
    ).toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
  });

  it("falls back to the gallery collection when no effect owns the work", () => {
    render(
      <ReplicationDetailPage {...props} effectName={null} effectSlug={null} />,
    );

    expect(
      screen.getByRole("link", { name: "Open in viewer" }),
    ).toHaveAttribute("href", "/replications?viewer=tracers-chelsea-morgan");
  });
});
