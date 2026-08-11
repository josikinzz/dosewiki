import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReplicationWithUrl } from "@/types/replications";
import type { ReplicationNeighborSet } from "../gallery/replicationDetailModel";
import { ReplicationDetailPage, type ReplicationDetailPageProps } from "./ReplicationDetailPage";

// Binds arrow keys through the app router, which is not mounted under jsdom and
// has nothing to do with what this file asserts.
vi.mock("./ReplicationNeighborKeys", () => ({
  ReplicationNeighborKeys: () => null,
}));

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  ),
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

const neighbors: ReplicationNeighborSet = {
  previous: { slug: "before", title: "Before", type: "image" },
  next: { slug: "after", title: "After", type: "image" },
  position: 2,
  total: 3,
  scope: "artist",
  scopeLabel: "Chelsea Morgan",
};

function renderPage(overrides: Partial<ReplicationDetailPageProps> = {}) {
  return render(
    <ReplicationDetailPage
      replication={replication}
      effectName="Tracers"
      effectSlug="tracers"
      artistProfileHref="/contributors/chelsea"
      effectCategories={[
        { slug: "visual-effects", name: "Visual Effects", icon: "lucide:eye" },
        { slug: "visual-distortions", name: "Visual Distortions", icon: "lucide:move" },
      ]}
      neighbors={neighbors}
      {...overrides}
    />,
  );
}

describe("ReplicationDetailPage", () => {
  it("points the byline at the artist's profile when one claims the credit", () => {
    renderPage();

    expect(screen.getByRole("link", { name: "Chelsea Morgan" })).toHaveAttribute(
      "href",
      "/contributors/chelsea",
    );
  });

  it("falls back to the row's external site when no profile claims the credit", () => {
    renderPage({ artistProfileHref: null });

    expect(screen.getByRole("link", { name: "Chelsea Morgan" })).toHaveAttribute(
      "href",
      "https://chelsea.example/",
    );
  });

  it("renders no byline link at all when there is neither a profile nor a site", () => {
    renderPage({
      artistProfileHref: null,
      replication: { ...replication, artist_url: undefined },
    });

    // A dead link is worse than plain text: it promises somewhere to go.
    expect(screen.queryByRole("link", { name: "Chelsea Morgan" })).toBeNull();
    // Still credited, just as plain text — the credit row keeps naming them too.
    expect(screen.getAllByText("Chelsea Morgan").length).toBeGreaterThan(0);
  });

  it("names the effect and its categories beneath the work", () => {
    renderPage();

    const categories = screen.getByRole("list", { name: "Tracers categories" });
    expect(categories).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visual Distortions" })).toHaveAttribute(
      "href",
      "/effects/category/visual-distortions",
    );
    // The subject is stated once, against the work, not repeated in the rights card.
    expect(screen.getAllByRole("link", { name: "Tracers" })).toHaveLength(2);
  });

  it("names the artist's body of work when that is the set being walked", () => {
    renderPage();

    expect(
      screen.getByRole("navigation", { name: "More by Chelsea Morgan" }),
    ).toBeInTheDocument();
  });

  it("names the effect instead when the walk fell back to the effect's works", () => {
    renderPage({
      neighbors: { ...neighbors, scope: "effect", scopeLabel: "Tracers" },
    });

    expect(
      screen.getByRole("navigation", { name: "More replications of Tracers" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "More by Chelsea Morgan" })).toBeNull();
  });

  it("counts the position within whichever set it announced", () => {
    renderPage({
      neighbors: { ...neighbors, scope: "effect", scopeLabel: "Tracers", position: 5, total: 9 },
    });

    expect(screen.getByText("5 / 9")).toBeInTheDocument();
  });
});
