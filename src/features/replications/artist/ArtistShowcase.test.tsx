import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShowcaseWork } from "../components/showcaseWork";
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

function renderShowcase(fetchCollection?: typeof fetch) {
  const { works, collection } = fixtures();
  vi.stubGlobal("fetch", fetchCollection ?? vi.fn(async () => ({ ok: true, json: async () => ({ groups: collection.groups }) })));
  return render(
    <ArtistShowcase
      label="Works by Chelsea Morgan"
      works={works}
      totalCount={12}
      collection={{ ...collection, groups: collection.groups.map((group) => ({ ...group, items: group.items.slice(0, 10) })) }}
      sourcePath={SOURCE_PATH}
      artistKey="chelsea-morgan"
    />,
  );
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
  document.documentElement.removeAttribute("data-viewer-deep-link");
  vi.unstubAllGlobals();
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

  it("opens the shared viewer over the page and writes the viewer URL", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    window.history.replaceState({}, "", SOURCE_PATH);
    renderShowcase();

    fireEvent.click(
      screen.getByRole("button", { name: "Open Work w0 in viewer" }),
    );

    const viewer = await screen.findByTestId("replication-viewer");
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

  it("cancels a pending collection launch when history returns to the artist page", async () => {
    let resolveFetch!: (response: Response) => void;
    const collectionResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    window.history.replaceState({}, "", SOURCE_PATH);
    renderShowcase(vi.fn(() => collectionResponse));

    fireEvent.click(
      screen.getByRole("button", { name: "Open Work w0 in viewer" }),
    );
    expect(window.location.search).toBe("?viewer=w0");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("replication-viewer")).not.toBeInTheDocument();

    // Model the URL and popstate delivered by Back without jsdom's async history traversal.
    window.history.replaceState({}, "", SOURCE_PATH);
    fireEvent.popState(window);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ groups: fixtures().collection.groups }),
      } as Response);
      await collectionResponse;
      await vi.dynamicImportSettled();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("replication-viewer")).not.toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe(SOURCE_PATH);
  });

  it("dismisses a pending deep-link cover on Back and restores the work on Forward", async () => {
    let resolveFetch!: (response: Response) => void;
    const collectionResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const viewerUrl = `${SOURCE_PATH}?viewer=overflow-2`;
    window.history.replaceState({}, "", viewerUrl);
    // The server's pre-paint script sets this flag before hydration.
    document.documentElement.setAttribute("data-viewer-deep-link", "");
    renderShowcase(vi.fn(() => collectionResponse));
    expect(document.documentElement).toHaveAttribute("data-viewer-deep-link");

    window.history.replaceState({}, "", SOURCE_PATH);
    fireEvent.popState(window);
    expect(document.documentElement).not.toHaveAttribute("data-viewer-deep-link");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ groups: fixtures().collection.groups }),
      } as Response);
      await collectionResponse;
      await vi.dynamicImportSettled();
    });
    expect(screen.queryByTestId("replication-viewer")).not.toBeInTheDocument();

    window.history.replaceState({ replicationViewer: true }, "", viewerUrl);
    fireEvent.popState(window);
    expect(await screen.findByTestId("replication-viewer")).toHaveAttribute(
      "data-initial-slug",
      "overflow-2",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close viewer" }));
    expect(window.location.pathname + window.location.search).toBe(SOURCE_PATH);
  });

  it("resolves a deep link to a work beyond the filmstrip's cap", async () => {
    window.history.replaceState({}, "", `${SOURCE_PATH}?viewer=overflow-2`);
    renderShowcase();

    expect(await screen.findByTestId("replication-viewer")).toHaveAttribute(
      "data-initial-slug",
      "overflow-2",
    );
  });

  it("refuses a work outside the artist collection and clears the URL on close", async () => {
    window.history.replaceState({}, "", `${SOURCE_PATH}?viewer=not-hers`);
    renderShowcase();
    expect(await screen.findByText("The linked replication is no longer available in this collection.")).toBeInTheDocument();
    expect(screen.queryByTestId("replication-viewer")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(window.location.pathname + window.location.search).toBe(SOURCE_PATH);
  });

  it("hides per-stage creator lines — the identity header owns attribution", () => {
    renderShowcase();

    expect(screen.queryByText("by Chelsea Morgan")).not.toBeInTheDocument();
  });
});
