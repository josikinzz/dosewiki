import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MediaRail } from "./MediaRail";
import type { GalleryGroup } from "./galleryTypes";
import type { GalleryReplication } from "@/types/replications";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

const group = (overrides: Partial<GalleryGroup> = {}): GalleryGroup => ({
  key: "symmetric vision",
  label: "Symmetric Vision",
  count: 0,
  imageCount: 0,
  videoCount: 0,
  audioCount: 0,
  items: [],
  ...overrides,
});

const WORK: GalleryReplication = {
  _id: "k57geometryfrog",
  _creationTime: 0,
  slug: "geometry-frog-symmetric-vision",
  title: "Geometry Frog",
  artist: "Symmetric Vision",
  effect_slug: "geometry",
  type: "image",
  storage_id: "kg57geometryfrog",
  format: "jpg",
  created_at: "2024-01-01",
  url: "https://example.test/geometry-frog.jpg",
  width: 1280,
  height: 720,
};

const viewerHrefFor = (work: GalleryReplication) =>
  `/replications/artist/symmetric-vision?viewer=${work.slug}`;

describe("MediaRail heading", () => {
  it("sends the artist's name to their profile, not their own site", () => {
    render(
      <MediaRail
        group={group({
          href: "/contributors/symmetricvision",
          externalUrl: "https://sv.test",
        })}
        viewAllHref="/replications/artist/symmetric-vision"
        viewerHrefFor={viewerHrefFor}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Symmetric Vision" }),
    ).toHaveAttribute("href", "/contributors/symmetricvision");
  });

  it("keeps the personal site reachable as its own link", () => {
    render(
      <MediaRail
        group={group({
          href: "/contributors/symmetricvision",
          externalUrl: "https://sv.test",
        })}
        viewAllHref="/replications/artist/symmetric-vision"
        viewerHrefFor={viewerHrefFor}
      />,
    );

    // Nineteen artists carry a site that is not on their profile, so this must
    // not simply disappear when the name starts pointing inward.
    const site = screen.getByRole("link", { name: /own site/ });
    expect(site).toHaveAttribute("href", "https://sv.test");
    expect(site).toHaveAttribute("target", "_blank");
  });

  it("leaves an artist with no profile on exactly their old behaviour", () => {
    render(
      <MediaRail
        group={group({ externalUrl: "https://nobody.test" })}
        viewAllHref="/replications/artist/symmetric-vision"
        viewerHrefFor={viewerHrefFor}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Symmetric Vision" }),
    ).toHaveAttribute("href", "https://nobody.test");
  });

  it("renders a plain name when there is nowhere to send the reader", () => {
    render(
      <MediaRail
        group={group()}
        viewAllHref="/replications/artist/symmetric-vision"
        viewerHrefFor={viewerHrefFor}
      />,
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Symmetric Vision")).toBeInTheDocument();
  });

  it("stars an approved replicator inside their name link, and names the star", () => {
    render(
      <MediaRail
        group={group({
          href: "/replications/artist/symmetric-vision",
          approvedReplicator: true,
        })}
        viewAllHref="/replications/artist/symmetric-vision"
        viewerHrefFor={viewerHrefFor}
      />,
    );

    const star = screen.getByTestId("approved-replicator-star");
    // One focus stop: the star is part of the name, not a second link.
    expect(star.closest("a")).toBe(
      screen.getByRole("link", { name: /Symmetric Vision.*Approved replicator/ }),
    );
    expect(star).toHaveAttribute("title", "Approved replicator");
  });

  it("leaves an ordinary artist unstarred", () => {
    render(
      <MediaRail
        group={group({ href: "/replications/artist/symmetric-vision" })}
        viewAllHref="/replications/artist/symmetric-vision"
        viewerHrefFor={viewerHrefFor}
      />,
    );

    expect(screen.queryByTestId("approved-replicator-star")).toBeNull();
    expect(screen.getByRole("link", { name: "Symmetric Vision" })).toBeInTheDocument();
  });
});

describe("MediaRail identity portrait", () => {
  it("leads an artist heading with their profile image inside the name link", () => {
    const { container } = render(
      <MediaRail
        group={group({ href: "/replications/artist/symmetric-vision" })}
        avatarUrl="https://cdn.test/sv.webp"
        viewAllHref="/replications/artist/symmetric-vision"
        viewerHrefFor={viewerHrefFor}
      />,
    );

    const link = screen.getByRole("link", { name: "Symmetric Vision" });
    expect(link).toContainElement(
      container.querySelector('img[src="https://cdn.test/sv.webp"]'),
    );
  });

  it("holds the slot with a monogram when no profile claims the credit", () => {
    // An artist without a claimed profile still gets the frame, so names in a
    // browse column all start on the same left edge.
    render(
      <MediaRail
        group={group({ href: "/replications/artist/symmetric-vision" })}
        avatarUrl={null}
        viewAllHref="/replications/artist/symmetric-vision"
        viewerHrefFor={viewerHrefFor}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Symmetric Vision" }),
    ).toContainElement(screen.getByText("SV"));
  });

  it("gives a heading that names no person no portrait at all", () => {
    // Effect groups and the unattributed bucket pass nothing; a monogram there
    // would invent a face for a name that is not a person.
    const { container } = render(
      <MediaRail
        group={group({ label: "Unattributed" })}
        viewAllHref="/replications/artist/unknown"
        viewerHrefFor={viewerHrefFor}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByText("U")).toBeNull();
  });
});

describe("MediaRail view-all affordance", () => {
  it("does not present a loaded-page count as the complete artist total", () => {
    render(
      <MediaRail
        group={group({ count: 2 })}
        countIsComplete={false}
        viewAllHref="/replications/artist/symmetric-vision"
        viewerHrefFor={viewerHrefFor}
      />,
    );

    expect(screen.getAllByRole("link", { name: "View all" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "View all 2" })).toBeNull();
  });

  it('renders "View all" as a real focus URL, not client state', () => {
    // Two works, none inline (an empty preview keeps jsdom clear of the media
    // tile's matchMedia needs): both the header affordance and the rail-end
    // tile must be crawlable anchors to the group's focus route.
    render(
      <MediaRail
        group={group({ count: 2 })}
        viewAllHref="/replications/artist/symmetric-vision?type=video"
        viewerHrefFor={viewerHrefFor}
      />,
    );

    const links = screen.getAllByRole("link", { name: /View all 2/ });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute(
        "href",
        "/replications/artist/symmetric-vision?type=video",
      );
    }
  });


});

describe("MediaRail tile forwarding", () => {
  it("forwards byline, compact and open handling to its tiles", async () => {
    const user = userEvent.setup();
    const onTileOpen = vi.fn((event: React.MouseEvent, _work: unknown) =>
      event.preventDefault(),
    );

    const { container } = render(
      <MediaRail
        group={group({ count: 1, imageCount: 1, items: [WORK] })}
        viewAllHref="/replications/artist/symmetric-vision"
        viewerHrefFor={viewerHrefFor}
        tileBylines={false}
        mobileCompact
        onTileOpen={onTileOpen}
      />,
    );

    // showByline={tileBylines}: the heading already names the artist.
    expect(screen.getByText("Geometry Frog")).toBeInTheDocument();
    expect(screen.queryByText("by Symmetric Vision")).toBeNull();
    // mobileCompact reaches the tile's denser, still-visible caption.
    expect(container.querySelector("figcaption")).toHaveClass("mt-1");
    expect(container.querySelector("figcaption")).not.toHaveClass(
      "max-md:hidden",
    );

    await user.click(screen.getByRole("link", { name: /Geometry Frog/ }));
    expect(onTileOpen).toHaveBeenCalledTimes(1);
    expect(onTileOpen.mock.calls[0][1]).toEqual(WORK);
  });

  it("prints no image/video breakdown beside the heading", () => {
    // The breakdown chip was redundant with "View all N" and is gone.
    render(
      <MediaRail
        group={group({ count: 255, imageCount: 2, videoCount: 253 })}
        viewAllHref="/replications/artist/symmetric-vision"
        viewerHrefFor={viewerHrefFor}
      />,
    );

    expect(screen.queryByText(/images? ·/)).toBeNull();
  });
});
