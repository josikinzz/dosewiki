import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShowcaseWork } from "../components/showcaseModel";
import type {
  ReplicationViewerCollection,
  ReplicationViewerMediaItem,
} from "../viewer/viewerModel";
import { ArtistShowcase } from "./ArtistShowcase";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

vi.mock("@/features/replications/viewer/ReplicationViewerOverlay", () => ({
  ReplicationViewerOverlay: ({
    collection,
    initialSlug,
    onOpenChange,
  }: {
    collection: { label: string; groups: { items: unknown[] }[] };
    initialSlug: string;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div
      data-testid="replication-viewer"
      data-collection-label={collection.label}
      data-initial-slug={initialSlug}
      data-item-count={collection.groups.reduce(
        (count, group) => count + group.items.length,
        0,
      )}
    >
      <button type="button" onClick={() => onOpenChange(false)}>
        Close viewer
      </button>
    </div>
  ),
}));

const work = (slug: string, effectSlug: string): ShowcaseWork => ({
  slug,
  title: `Work ${slug}`,
  type: "image",
  url: `https://cdn.test/${slug}.webp`,
  byline: "by Chelsea Morgan",
  artistName: "Chelsea Morgan",
  artistHref: null,
  artistHrefExternal: false,
  effectSlug,
  effectName: `Effect ${effectSlug}`,
});

const viewerItem = (slug: string, effectSlug: string): ReplicationViewerMediaItem => ({
  replication: {
    slug,
    title: `Work ${slug}`,
    artist: "Chelsea Morgan",
    type: "image",
    format: "webp",
    url: `https://cdn.test/${slug}.webp`,
  },
  effectName: `Effect ${effectSlug}`,
  effectSlug,
  effectCategories: [],
  artistProfileHref: null,
  avatarUrl: null,
});

const SOURCE_PATH = "/replications/artist/chelsea-morgan";

/**
 * Ten works staged, the collection carrying two more (`overflow-1`,
 * `overflow-2`) beyond the filmstrip, mirroring a body of work capped by
 * SHOWCASE_WORK_CAP.
 */
function fixtures() {
  const works: ShowcaseWork[] = Array.from({ length: 10 }, (_, index) =>
    work(`w${index}`, `effect-${index}`),
  );
  const collection: ReplicationViewerCollection = {
    sourcePath: SOURCE_PATH,
    label: "Works by Chelsea Morgan",
    kind: "artist",
    grouping: "none",
    groups: [
      {
        key: "__artist-works__",
        label: "All works",
        items: [
          ...works.map((item, index) => viewerItem(item.slug, `effect-${index}`)),
          viewerItem("overflow-1", "effect-0"),
          viewerItem("overflow-2", "effect-0"),
        ],
      },
    ],
  };
  return { works, collection };
}

function renderShowcase() {
  const { works, collection } = fixtures();
  return render(
    <ArtistShowcase
      label="Works by Chelsea Morgan"
      works={works}
      totalCount={12}
      collection={collection}
      sourcePath={SOURCE_PATH}
    />,
  );
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("ArtistShowcase", () => {
  it("stages every work in one carousel with one rights footnote", () => {
    renderShowcase();

    expect(
      screen.getAllByText("Works by Chelsea Morgan", {
        selector: "[data-replication-collection-heading]",
      }),
    ).toHaveLength(1);
    // One filmstrip tab per staged work plus the "+N more" affordance — no
    // per-effect sections, no "Show more sections" pagination.
    expect(screen.getAllByRole("tab")).toHaveLength(10);
    expect(
      screen.getByRole("link", {
        name: "2 more replications in this collection",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Show .* more sections/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("licensing terms")).toHaveLength(1);
  });

  it("opens the shared viewer over the page and writes the viewer URL", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    window.history.replaceState({}, "", SOURCE_PATH);
    renderShowcase();

    fireEvent.click(
      screen.getByRole("button", { name: "Open Work w0 in viewer" }),
    );

    const viewer = screen.getByTestId("replication-viewer");
    expect(viewer).toHaveAttribute("data-initial-slug", "w0");
    expect(viewer).toHaveAttribute(
      "data-collection-label",
      "Works by Chelsea Morgan",
    );
    // The whole collection, including works beyond the filmstrip's cap, is
    // walkable from any launch point.
    expect(viewer).toHaveAttribute("data-item-count", "12");
    expect(pushState).toHaveBeenCalledWith(
      expect.objectContaining({ replicationViewer: true }),
      "",
      expect.stringContaining("viewer=w0"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Close viewer" }));
    expect(screen.queryByTestId("replication-viewer")).toBeNull();
    pushState.mockRestore();
  });

  it("resolves a deep link to a work beyond the filmstrip's cap", () => {
    window.history.replaceState({}, "", `${SOURCE_PATH}?viewer=overflow-2`);
    renderShowcase();

    expect(screen.getByTestId("replication-viewer")).toHaveAttribute(
      "data-initial-slug",
      "overflow-2",
    );
  });

  it("removes a viewer query that does not belong to the artist", () => {
    window.history.replaceState({}, "", `${SOURCE_PATH}?viewer=not-hers`);
    renderShowcase();

    expect(window.location.pathname + window.location.search).toBe(
      SOURCE_PATH,
    );
    expect(screen.queryByTestId("replication-viewer")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "The linked replication is no longer available in this collection.",
      ),
    ).toBeInTheDocument();
  });

  it("hides per-stage creator lines — the identity header owns attribution", () => {
    renderShowcase();

    expect(screen.queryByText("by Chelsea Morgan")).not.toBeInTheDocument();
  });
});
