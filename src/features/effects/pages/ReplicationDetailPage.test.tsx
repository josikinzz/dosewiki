import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplicationWithUrl } from "@/types/replications";
import type {
  ReplicationViewerItem,
  ReplicationViewerSet,
} from "@/features/replications/viewer/viewerModel";
import { ReplicationDetailPage, type ReplicationDetailPageProps } from "./ReplicationDetailPage";

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

const activeItem: ReplicationViewerItem = {
  replication,
  effectName: "Tracers",
  effectSlug: "tracers",
  effectCategories: [
    { slug: "visual-effects", name: "Visual Effects", icon: "lucide:eye" },
    { slug: "visual-distortions", name: "Visual Distortions", icon: "lucide:move" },
  ],
  artistProfileHref: "/contributors/chelsea",
  avatarUrl: null,
};

function makeItem(slug: string, title: string): ReplicationViewerItem {
  return {
    replication: {
      ...replication,
      _id: `rep-${slug}`,
      slug,
      title,
      url: `https://cdn.test/${slug}.webp`,
      thumbnail_url: `https://cdn.test/${slug}-thumb.webp`,
    },
    effectName: "Tracers",
    effectSlug: "tracers",
    effectCategories: activeItem.effectCategories,
    artistProfileHref: "/contributors/chelsea",
    avatarUrl: null,
  };
}

const viewerSet: ReplicationViewerSet = {
  scope: "artist",
  scopeLabel: "Chelsea Morgan",
  items: [makeItem("before", "Before"), activeItem, makeItem("after", "After")],
};

function renderPage(overrides: Partial<ReplicationDetailPageProps> = {}) {
  return render(
    <ReplicationDetailPage
      replication={replication}
      effectName="Tracers"
      effectSlug="tracers"
      artistProfileHref="/contributors/chelsea"
      avatarUrl={null}
      effectCategories={activeItem.effectCategories}
      viewerSet={viewerSet}
      {...overrides}
    />,
  );
}

describe("ReplicationDetailPage", () => {
  // Navigation tests mutate the shared jsdom URL and title; start each test
  // where a real arrival starts — on the active item's own permalink.
  beforeEach(() => {
    window.history.replaceState({}, "", "/replications/tracers-chelsea-morgan");
  });

  it("headlines the active item with a real h1", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Tracers" })).toBeInTheDocument();
  });

  it("points the top-line byline at the artist's page when the credit resolves to one", () => {
    renderPage();

    // The byline comes from the active walk item; it is the name's one home.
    expect(screen.getByRole("link", { name: "Chelsea Morgan" })).toHaveAttribute(
      "href",
      "/contributors/chelsea",
    );
  });

  it("shows the claiming profile's avatar beside the name in the top line", () => {
    renderPage({
      viewerSet: {
        ...viewerSet,
        items: viewerSet.items.map((item) =>
          item.replication.slug === replication.slug
            ? { ...item, avatarUrl: "https://cdn.test/chelsea-avatar.webp" }
            : item,
        ),
      },
    });

    const byline = screen.getByRole("link", { name: "Chelsea Morgan" });
    // Decorative beside the visible name: it adds nothing to the accessible
    // name, so the link still answers to plain "Chelsea Morgan".
    expect(byline.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.test/chelsea-avatar.webp",
    );
  });

  it("renders no avatar slot when no claiming profile provides one", () => {
    renderPage();

    expect(screen.getByRole("link", { name: "Chelsea Morgan" }).querySelector("img")).toBeNull();
  });

  it("renders the display name exactly once above the fold", () => {
    renderPage();

    // The credit card dropped its standalone name row; the attribution
    // sentence still contains the name, but only inside the rights text.
    expect(screen.getAllByText("Chelsea Morgan")).toHaveLength(1);
  });

  it("offers a back control to the gallery in the compact top line", () => {
    renderPage();

    expect(screen.getByRole("link", { name: "Back to replications" })).toHaveAttribute(
      "href",
      "/replications",
    );
  });

  it("falls back to the row's external site when no profile claims the credit", () => {
    renderPage({
      viewerSet: {
        ...viewerSet,
        items: viewerSet.items.map((item) =>
          item.replication.slug === replication.slug ? { ...item, artistProfileHref: null } : item,
        ),
      },
    });

    expect(screen.getByRole("link", { name: "Chelsea Morgan" })).toHaveAttribute(
      "href",
      "https://chelsea.example/",
    );
  });

  it("renders no byline link at all when there is neither a profile nor a site", () => {
    renderPage({
      viewerSet: {
        ...viewerSet,
        items: viewerSet.items.map((item) =>
          item.replication.slug === replication.slug
            ? {
                ...item,
                artistProfileHref: null,
                replication: { ...item.replication, artist_url: undefined },
              }
            : item,
        ),
      },
    });

    // A dead link is worse than plain text: it promises somewhere to go.
    expect(screen.queryByRole("link", { name: "Chelsea Morgan" })).toBeNull();
    // Still credited, just as plain text — the top line is the name's one home.
    expect(screen.getAllByText("Chelsea Morgan")).toHaveLength(1);
  });

  it("names the effect and its categories beneath the work", () => {
    renderPage();

    const categories = screen.getByRole("list", { name: "Tracers categories" });
    expect(categories).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visual Distortions" })).toHaveAttribute(
      "href",
      "/effects/category/visual-distortions",
    );
  });

  it("keeps the licence card and the copyable attribution line", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Credit & licence" })).toBeInTheDocument();
    // The row has no explicit licence, so the line states the default posture.
    expect(
      screen.getByText(
        "Tracers by Chelsea Morgan. Rights remain with the creator or rightsholder; contact them before reuse.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the whole walk as a filmstrip named after the set", () => {
    renderPage();

    const strip = screen.getByRole("navigation", { name: "More by Chelsea Morgan" });
    // One thumb per walk member, each a real permalink.
    expect(within(strip).getByRole("link", { name: "Before" })).toHaveAttribute(
      "href",
      "/replications/before",
    );
    expect(within(strip).getByRole("link", { name: "After" })).toHaveAttribute(
      "href",
      "/replications/after",
    );
    expect(within(strip).getByRole("link", { name: "Tracers" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("counts the position within whichever set it announced", () => {
    renderPage();

    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("offers prev and next as real anchors with rel semantics", () => {
    renderPage();

    expect(screen.getByRole("link", { name: "Previous: Before" })).toHaveAttribute("rel", "prev");
    expect(screen.getByRole("link", { name: "Next: After" })).toHaveAttribute("rel", "next");
  });

  it("navigates client-side: a chevron click updates the work, the URL, and the title", () => {
    renderPage();

    // A plain left click is intercepted — jsdom would loudly "navigate"
    // otherwise, so reaching the neighbor at all proves pushState was used.
    fireEvent.click(screen.getByRole("link", { name: "Next: After" }));

    expect(screen.getByRole("heading", { level: 1, name: "After" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/replications/after");
    expect(document.title).toBe("After by Chelsea Morgan");
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    // The end of the finite walk offers no further "next".
    expect(screen.queryByRole("link", { name: /^Next:/ })).toBeNull();
  });

  it("pages with plain arrow keys but leaves modified or field-bound keys alone", () => {
    renderPage();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByRole("heading", { level: 1, name: "Before" })).toBeInTheDocument();

    // Modifier chords stay browser shortcuts (history navigation on macOS).
    fireEvent.keyDown(window, { key: "ArrowRight", metaKey: true });
    expect(screen.getByRole("heading", { level: 1, name: "Before" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("heading", { level: 1, name: "Tracers" })).toBeInTheDocument();
  });

  it("restores the item named by the URL when history traversal fires popstate", () => {
    renderPage();

    // Simulate the browser landing back on an entry this viewer pushed.
    window.history.replaceState({}, "", "/replications/before");
    fireEvent.popState(window);

    expect(screen.getByRole("heading", { level: 1, name: "Before" })).toBeInTheDocument();
    expect(document.title).toBe("Before by Chelsea Morgan");
  });

  it("degrades to a one-item walk when the set somehow omits the active item", () => {
    renderPage({
      viewerSet: {
        scope: "artist",
        scopeLabel: "Somebody Else",
        items: [makeItem("unrelated", "Unrelated")],
      },
    });

    // The page must never show another work under this URL's title/licence.
    expect(screen.getByRole("heading", { level: 1, name: "Tracers" })).toBeInTheDocument();
    // A singleton walk advertises no navigation.
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
