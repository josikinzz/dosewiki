import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import type { MouseEvent as ReactMouseEvent } from "react";
import type {
  GalleryReplication,
  PublicGalleryReplicationPreview,
} from "@/types/replications";
import type { GalleryGroup } from "@/features/effects/gallery/galleryTypes";
import {
  ReplicationsGalleryExplorer,
  type ReplicationsGalleryExplorerProps,
} from "./ReplicationsGalleryExplorer";
import { groupByArtist } from "@/features/effects/gallery/galleryModel";
import { galleryQueryIdentity, type GalleryPageState } from "./galleryPage";
import { GALLERY_BROWSE_DEFAULTS } from "./galleryUrlState";

const navMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

/**
 * Browse-state URL writes go through native history (Next syncs
 * `useSearchParams` from it), so that is where the assertions look. The
 * viewer's own history writes carry a `replicationViewer` state object; browse
 * writes always pass `null`.
 */
const historySpies: {
  push: MockInstance<History["pushState"]>;
  replace: MockInstance<History["replaceState"]>;
} = { push: vi.fn(), replace: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navMocks.push, replace: navMocks.replace }),
  useSearchParams: () => navMocks.params,
  useSelectedLayoutSegments: () => [],
}));

// Radix popper-positioned overlays (the Filters sheet, the compact sort menu)
// measure their anchor and manage pointer focus; jsdom has none of that.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => {} },
    releasePointerCapture: { configurable: true, value: () => {} },
    scrollIntoView: { configurable: true, value: () => {} },
  });
});

// The tiles pull in matchMedia-gated hover video; none of that is under test.
// The mock surfaces the explorer's prop wiring (byline policy, compact phone
// captions, the deck-open handler) and stays an anchor so tap fallthrough to
// the detail link is observable via defaultPrevented.
vi.mock("@/features/effects/gallery/GalleryMediaTile", () => ({
  GalleryMediaTile: ({
    replication,
    showByline,
    mobileCompact,
    onOpen,
    viewerHref,
  }: {
    replication: PublicGalleryReplicationPreview;
    showByline?: boolean;
    mobileCompact?: boolean;
    onOpen?: (
      event: ReactMouseEvent,
      replication: PublicGalleryReplicationPreview,
    ) => void;
    viewerHref: string;
  }) => (
    <a
      data-testid="tile"
      data-show-byline={String(showByline ?? true)}
      data-mobile-compact={String(mobileCompact ?? false)}
      href={viewerHref}
      onClick={(event) => onOpen?.(event, replication)}
    >
      {replication.title}
    </a>
  ),
}));

// The rail's scroll affordances are its own concern; this mock surfaces what
// the explorer forwards (tileBylines/mobileCompact/onTileOpen) plus the
// heading link and per-item tiles the layout tests assert against.
vi.mock("@/features/effects/gallery/MediaRail", () => ({
  MediaRail: ({
    group,
    viewAllHref,
    tileBylines,
    mobileCompact,
    onTileOpen,
    avatarUrl,
    viewerHrefFor,
    countIsComplete = true,
  }: {
    group: GalleryGroup;
    viewAllHref: string;
    tileBylines?: boolean;
    mobileCompact?: boolean;
    onTileOpen?: (
      event: ReactMouseEvent,
      replication: PublicGalleryReplicationPreview,
    ) => void;
    avatarUrl?: string | null;
    countIsComplete?: boolean;
    viewerHrefFor: (replication: PublicGalleryReplicationPreview) => string;
  }) => (
    <section
      data-testid="rail"
      data-tile-bylines={String(tileBylines ?? true)}
      data-mobile-compact={String(mobileCompact ?? false)}
      data-view-all={viewAllHref}
      data-avatar={avatarUrl === undefined ? "none" : String(avatarUrl)}
      aria-label={group.label}
    >
      {group.href ? (
        <a href={group.href}>{group.label}</a>
      ) : (
        <span>{group.label}</span>
      )}
      {!countIsComplete || group.count > Math.min(group.items.length, 14) ? (
        <a href={viewAllHref}>
          {countIsComplete ? `View all ${group.count}` : "View all"}
        </a>
      ) : null}
      {group.items.map((item) => (
        <a
          key={item._id}
          data-testid="rail-tile"
          href={viewerHrefFor(item)}
          onClick={(event) => onTileOpen?.(event, item)}
        >
          {item.title}
        </a>
      ))}
    </section>
  ),
}));

// The viewer's media, dialog focus, and gestures have their own tests; this
// mock exposes collection identity, initial work, and close wiring.
vi.mock("./components/LazyReplicationViewerOverlay", () => ({
  LazyReplicationViewerOverlay: ({
    collection,
    initialSlug,
    onOpenChange,
  }: {
    collection: {
      label: string;
      groups: { items: unknown[] }[];
    };
    initialSlug: string;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div
      data-testid="replication-viewer"
      data-collection-label={collection.label}
      data-group-count={collection.groups.length}
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

let seq = 0;
function rep(overrides: Partial<GalleryReplication> = {}): GalleryReplication {
  seq += 1;
  return {
    _id: `id-${seq}`,
    _creationTime: seq,
    slug: `slug-${seq}`,
    title: `Work ${seq}`,
    artist: "Chelsea Morgan",
    type: "image",
    storage_id: `store-${seq}`,
    effect_slug: "geometry",
    format: "jpg",
    created_at: "2024-01-01T00:00:00.000Z",
    url: `https://cdn.test/${seq}.jpg`,
    ...overrides,
  };
}

const effects = [
  { slug: "geometry", name: "Geometry" },
  { slug: "drifting", name: "Drifting" },
];

const contributorDirectory = [
  {
    key: "chelseamorgan",
    displayName: "Chelsea Morgan",
    aliases: [],
    avatarUrl: "https://cdn.test/chelsea.webp",
  },
];

const corpus = [
  rep({ artist: "Chelsea Morgan", type: "image" }),
  rep({ artist: "Chelsea Morgan", type: "video", effect_slug: "drifting" }),
  rep({ artist: "Chelsea Morgan", type: "image" }),
  rep({ artist: "Aria", type: "image" }),
];

function renderExplorer(
  params: string,
  props: Partial<ReplicationsGalleryExplorerProps> = {},
) {
  navMocks.params = new URLSearchParams(params);
  return render(
    <ReplicationsGalleryExplorer
      replications={corpus}
      effects={effects}
      contributorDirectory={contributorDirectory}
      {...props}
    />,
  );
}

/** `matches` plus the listener pair `useMediaQuery` subscribes with. */
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

/**
 * Every control in the bar is a labelled menu now, so choosing a value is two
 * steps: open the trigger, pick the row. The rows are where the names live at
 * every width, which is the point of the arrangement.
 */
async function chooseFromMenu(
  trigger: string | RegExp,
  item: string | RegExp,
) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: trigger }));
  await user.click(await screen.findByRole("menuitemradio", { name: item }));
}

/**
 * The same two steps without userEvent, whose async plumbing deadlocks under
 * fake timers. Radix opens on `pointerdown` and selects on `click`.
 */
function chooseFromMenuSync(trigger: string | RegExp, item: string | RegExp) {
  fireEvent.pointerDown(screen.getByRole("button", { name: trigger }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  fireEvent.click(screen.getByRole("menuitemradio", { name: item }));
}

/**
 * Media is a select inside the Filters popover now, not a menu on the bar.
 * The Popover trigger opens on `click`; a Select opens on `pointerdown` and
 * its rows are `option`s.
 */
function chooseMediaSync(option: string) {
  fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
  fireEvent.pointerDown(screen.getByRole("combobox", { name: "Media" }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  fireEvent.click(screen.getByRole("option", { name: option }));
}

beforeEach(() => {
  navMocks.push.mockReset();
  navMocks.replace.mockReset();
  window.history.replaceState({}, "", "/replications");
  historySpies.push = vi.spyOn(window.history, "pushState");
  historySpies.replace = vi.spyOn(window.history, "replaceState");
});

afterEach(() => {
  // Unmount while idle-callback stubs still exist so effect cleanup cannot
  // observe a half-restored browser API, and no scheduled continuation leaks
  // into the next case.
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("URL → rendered state", () => {
  it("renders the default browse state from the bare path", () => {
    renderExplorer("");

    // Every control in the bar says what it is and what it currently holds,
    // in text: the bar carried nothing but glyphs before this.
    expect(
      screen.getByRole("button", { name: "Browse by: By artist" }),
    ).toHaveTextContent("By artist");
    expect(
      screen.getByRole("button", { name: "Order: Newest" }),
    ).toHaveTextContent("Newest");
    // Media is a filter now, not a control of its own.
    expect(screen.queryByRole("button", { name: /^Media:/ })).toBeNull();
    // The spotlight row is gone: density-first, media starts immediately.
    expect(screen.queryByText("Spotlight")).toBeNull();
  });

  it("applies URL-addressable taxonomy filters and marks their active count", () => {
    const open = rep({ title: "Open room", viewing_mode_tags: ["open-eye"] });
    const closed = rep({
      title: "Closed geometry",
      viewing_mode_tags: ["closed-eye"],
    });

    renderExplorer("viewing=open-eye", { replications: [open, closed] });

    expect(
      screen.getByRole("button", { name: "Filters, 1 active" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Open room")).toBeInTheDocument();
    expect(screen.queryByText("Closed geometry")).toBeNull();
  });

  it("filters by depicted effect across owning slug and effect tags", () => {
    const owned = rep({ title: "Owned drift", effect_slug: "drifting" });
    const tagged = rep({
      title: "Tagged drift",
      effect_slug: "geometry",
      effect_tags: ["drifting"],
    });
    const other = rep({ title: "Plain geometry", effect_slug: "geometry" });

    renderExplorer("effect=drifting", { replications: [owned, tagged, other] });

    expect(
      screen.getByRole("button", { name: "Filters, 1 active" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Owned drift")).toBeInTheDocument();
    expect(screen.getByText("Tagged drift")).toBeInTheDocument();
    expect(screen.queryByText("Plain geometry")).toBeNull();
    // The status line reports what the filter kept against the corpus it was
    // drawn from, which is the question a reader who just filtered is asking.
    expect(screen.getByRole("status")).toHaveTextContent("2 of 3 works");
  });

  it("composes the depicted-effect filter with the other taxonomy filters", () => {
    const both = rep({
      title: "Drift open",
      effect_slug: "drifting",
      viewing_mode_tags: ["open-eye"],
    });
    const effectOnly = rep({
      title: "Drift closed",
      effect_slug: "drifting",
      viewing_mode_tags: ["closed-eye"],
    });

    renderExplorer("effect=drifting&viewing=open-eye", {
      replications: [both, effectOnly],
    });

    expect(
      screen.getByRole("button", { name: "Filters, 2 active" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Drift open")).toBeInTheDocument();
    expect(screen.queryByText("Drift closed")).toBeNull();
  });

  it("offers a clear action when selected taxonomy filters match nothing", async () => {
    renderExplorer("drugClass=deliriants");

    expect(
      screen.getByText("No works match these filters"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );
    expect(window.location.pathname + window.location.search).toBe("/replications");
    expect(historySpies.push).toHaveBeenCalledTimes(1);
  });

  it("reproduces a pasted ?view=effect&type=video&sort=oldest state exactly", () => {
    renderExplorer("view=effect&type=video&sort=oldest");

    expect(
      screen.getByRole("button", { name: "Browse by: By effect" }),
    ).toHaveTextContent("By effect");
    expect(
      screen.getByRole("button", { name: "Order: Oldest" }),
    ).toHaveTextContent("Oldest");
    // The media filter is readable from its chip while the popover is shut.
    expect(
      screen.getByRole("button", { name: "Remove Media filter: Videos" }),
    ).toBeInTheDocument();
    // One video total: too thin for a rail, so it pools straight into the
    // masonry — and with no rails above it, the "More effects" heading is
    // dropped rather than describing everything as "more".
    expect(screen.getByText("Work 2")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "More effects" })).toBeNull();
  });

  it("renders ?q= as live search results with the query in the box", () => {
    renderExplorer("q=drifting");

    expect(
      screen.getByRole("textbox", { name: "Search replications" }),
    ).toHaveValue("drifting");
    expect(screen.getByText(/1 result for/)).toBeInTheDocument();
  });
});

describe("active filter chips", () => {
  it("labels one removable chip per active filter", () => {
    renderExplorer("viewing=open-eye&effect=drifting");

    expect(
      screen.getByRole("button", {
        name: "Remove Viewing mode filter: Open-eye",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove Depicted effect filter: Drifting",
      }),
    ).toBeInTheDocument();
  });

  it("removes only its own filter and pushes the narrowed URL", async () => {
    const user = userEvent.setup();
    renderExplorer("viewing=open-eye&effect=drifting");

    await user.click(
      screen.getByRole("button", {
        name: "Remove Viewing mode filter: Open-eye",
      }),
    );

    expect(window.location.pathname + window.location.search).toBe(
      "/replications?effect=drifting",
    );
    expect(historySpies.push).toHaveBeenCalledTimes(1);
  });

  it("renders no chip row while every filter sits at its default", () => {
    renderExplorer("");

    expect(
      screen.queryByRole("button", { name: /^Remove .* filter:/ }),
    ).toBeNull();
  });
});

describe("gallery result status", () => {
  it("states a result count only while something narrows the grid", () => {
    const { unmount } = renderExplorer("");

    // At rest the archive's size is the tab row's statement, not the bar's:
    // this line used to recite the whole corpus over any grid at all.
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(screen.queryByText(/works/)).toBeNull();
    unmount();

    renderExplorer("type=video");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 4 works");
  });
});
describe("hybrid browse layout", () => {
  it("gives every artist their own rail with no pooled masonry", () => {
    renderExplorer("");

    // Chelsea (3 works) has a rail whose heading links to her Artist Page.
    expect(
      screen.getByRole("link", { name: "Chelsea Morgan" }),
    ).toHaveAttribute("href", "/replications/artist/chelsea-morgan");
    // Aria (1 work) gets her own rail too, instead of pooling into a
    // mixed-attribution "More artists" masonry.
    expect(screen.getByRole("link", { name: "Aria" })).toHaveAttribute(
      "href",
      "/replications/artist/aria",
    );
    expect(screen.getAllByTestId("rail")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "More artists" })).toBeNull();
  });

  it("reveals artist rails a page at a time behind Show more artists", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      rep({ artist: `Solo Artist ${String(index).padStart(2, "0")}` }),
    );
    renderExplorer("", { replications: many });

    expect(screen.getAllByTestId("rail")).toHaveLength(16);
    expect(screen.getByText("Showing 16 of 20 artists")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Show more artists/ }));

    expect(screen.getAllByTestId("rail")).toHaveLength(20);
    expect(
      screen.queryByRole("button", { name: /Show more artists/ }),
    ).toBeNull();
  });

  it("rails effects with enough works and pools thin effects behind them", () => {
    renderExplorer("view=effect");

    // Geometry (3 works) keeps a rail; Drifting (1 work) pools below it.
    expect(screen.getByRole("link", { name: "Geometry" })).toHaveAttribute(
      "href",
      "/effects/geometry",
    );
    expect(
      screen.getByRole("heading", { name: "More effects" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Work 2")).toBeInTheDocument();
    // Effect browsing keeps the hybrid layout: no artist-rail pagination.
    expect(
      screen.queryByRole("button", { name: /Show more artists/ }),
    ).toBeNull();
  });

  it("hands each artist rail their own portrait", () => {
    renderExplorer("");

    const rails = screen.getAllByTestId("rail");
    // Chelsea's claimed profile supplies an image; Aria has no profile, and
    // `null` is what draws her monogram rather than dropping the frame.
    expect(rails[0]).toHaveAttribute(
      "data-avatar",
      "https://cdn.test/chelsea.webp",
    );
    expect(rails[1]).toHaveAttribute("data-avatar", "null");
  });

  it("hands effect rails no portrait, since an effect names no person", () => {
    renderExplorer("view=effect");

    for (const rail of screen.getAllByTestId("rail")) {
      expect(rail).toHaveAttribute("data-avatar", "none");
    }
  });

  it("keeps the order control in every grouped view", () => {
    // It used to be an artist-only affordance, because it sorted the rails
    // themselves. Now it orders the works inside them, which every axis has.
    renderExplorer("view=effect");
    expect(screen.getByTitle("Order: Curated")).toBeInTheDocument();
  });
});

describe("byline and compact wiring", () => {
  it("drops rail bylines in artist mode, where each heading names its artist", () => {
    renderExplorer("");

    const rails = screen.getAllByTestId("rail");
    expect(rails).toHaveLength(2);
    for (const rail of rails) {
      expect(rail).toHaveAttribute("data-tile-bylines", "false");
      expect(rail).toHaveAttribute("data-mobile-compact", "true");
    }
  });

  it("keeps rail bylines and pooled-tile bylines in effect mode", () => {
    renderExplorer("view=effect");

    expect(screen.getByTestId("rail")).toHaveAttribute(
      "data-tile-bylines",
      "true",
    );
    // The pooled masonry mixes artists, so each tile keeps its attribution.
    const pooled = screen.getByTestId("tile");
    expect(pooled).toHaveAttribute("data-show-byline", "true");
    expect(pooled).toHaveAttribute("data-mobile-compact", "true");
  });

  it("hides bylines across an artist focus view", () => {
    renderExplorer("", { focus: { kind: "artist", key: "chelsea-morgan" } });

    const tiles = screen.getAllByTestId("tile");
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile).toHaveAttribute("data-show-byline", "false");
    }
  });

  it("keeps bylines in an effect focus view", () => {
    renderExplorer("", { focus: { kind: "effect", key: "geometry" } });

    for (const tile of screen.getAllByTestId("tile")) {
      expect(tile).toHaveAttribute("data-show-byline", "true");
    }
  });

  it("keeps bylines on search results", () => {
    renderExplorer("q=drifting");

    expect(screen.getByTestId("tile")).toHaveAttribute(
      "data-show-byline",
      "true",
    );
  });
});

describe("canonical replication viewer", () => {
  it("does not auto-open on any viewport", () => {
    stubMatchMedia(true);
    renderExplorer("");

    expect(screen.queryByTestId("replication-viewer")).toBeNull();
  });

  it("opens the collection at the clicked work and closes over the intact gallery", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    renderExplorer("");

    // A tile click is the only way in: the gallery has no separate viewer
    // button. Which work leads the rail is the artist sort's business, so the
    // assertion follows the tile that was actually clicked.
    const tile = screen.getAllByTestId("rail-tile")[0];
    const openedSlug = `slug-${tile.textContent?.replace(/\D+/g, "")}`;
    fireEvent.click(tile);

    const viewer = screen.getByTestId("replication-viewer");
    expect(viewer).toHaveAttribute("data-initial-slug", openedSlug);
    expect(viewer).toHaveAttribute("data-collection-label", "Sorted by artist");
    expect(pushState).toHaveBeenCalledWith(
      expect.objectContaining({ replicationViewer: true }),
      "",
      expect.stringContaining(`viewer=${openedSlug}`),
    );
    expect(
      screen.getByRole("textbox", { name: "Search replications" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close viewer" }));
    expect(screen.queryByTestId("replication-viewer")).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Search replications" }),
    ).toBeInTheDocument();
  });

  it("opens the tapped work in-page on phone and desktop viewports", () => {
    stubMatchMedia(false);
    renderExplorer("");

    const navigated = fireEvent.click(screen.getByText("Work 4"));

    expect(navigated).toBe(false);
    expect(screen.getByTestId("replication-viewer")).toHaveAttribute(
      "data-initial-slug",
      "slug-4",
    );
  });

  it("opens from rail tiles using the same viewer", () => {
    renderExplorer("");

    const tile = screen.getAllByTestId("rail-tile")[0];
    const openedSlug = `slug-${tile.textContent?.replace(/\D+/g, "")}`;
    fireEvent.click(tile);

    expect(screen.getByTestId("replication-viewer")).toHaveAttribute(
      "data-initial-slug",
      openedSlug,
    );
  });

  it("preserves modified clicks as canonical collection-viewer links", () => {
    renderExplorer("");

    const workLink = screen.getByText("Work 4").closest("a");
    expect(workLink).toHaveAttribute("href", "/replications?viewer=slug-4");
    const navigated = fireEvent.click(workLink!, {
      ctrlKey: true,
    });

    expect(navigated).toBe(true);
    expect(screen.queryByTestId("replication-viewer")).toBeNull();
  });

  it("opens a deep-linked work from the viewer query parameter", () => {
    renderExplorer("viewer=slug-4");

    expect(screen.getByTestId("replication-viewer")).toHaveAttribute(
      "data-initial-slug",
      "slug-4",
    );
  });

  it("reconstructs only the filtered result collection on a direct link", () => {
    renderExplorer(
      "view=effect&q=drifting&type=video&sort=oldest&viewer=slug-2",
    );

    const viewer = screen.getByTestId("replication-viewer");
    expect(viewer).toHaveAttribute("data-initial-slug", "slug-2");
    expect(viewer).toHaveAttribute("data-group-count", "1");
    expect(viewer).toHaveAttribute("data-item-count", "1");
    expect(viewer).toHaveAttribute(
      "data-collection-label",
      "Video replications sorted by effect matching “drifting”",
    );
    expect(screen.getByText("Work 2").closest("a")).toHaveAttribute(
      "href",
      "/replications?view=effect&q=drifting&type=video&sort=oldest&viewer=slug-2",
    );
  });

  it("fails closed when the viewer work is outside the filtered collection", () => {
    const view = renderExplorer("q=drifting&viewer=slug-4");

    expect(screen.queryByTestId("replication-viewer")).toBeNull();
    expect(screen.getByText("Work 2")).toBeInTheDocument();
    expect(screen.queryByText("Work 4")).toBeNull();
    expect(
      screen.getByText(
        "The linked replication is no longer available in this collection.",
      ),
    ).toBeInTheDocument();

    navMocks.params = new URLSearchParams("q=drifting");
    view.rerender(
      <ReplicationsGalleryExplorer
        replications={corpus}
        effects={effects}
        contributorDirectory={contributorDirectory}
      />,
    );
    expect(
      screen.getByText(
        "The linked replication is no longer available in this collection.",
      ),
    ).toBeInTheDocument();
  });

  it("removes a malformed viewer query instead of leaving stale URL state", () => {
    window.history.replaceState({}, "", "/replications?smoke=1&viewer=%25%24");
    renderExplorer("smoke=1&viewer=%25%24");

    expect(screen.queryByTestId("replication-viewer")).not.toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe(
      "/replications?smoke=1",
    );
  });
});

describe("viewer deep-link cover", () => {
  // The reveal script runs before hydration in a browser. These tests emulate
  // that pre-paint step by setting its <html> flag, then pin down the explorer's
  // dismissal contract: a valid deep link keeps the flag while the viewer is
  // open; close, invalid links, and plain visits clear it.
  const revealCover = () =>
    document.documentElement.setAttribute("data-viewer-deep-link", "");
  const coverIsRevealed = () =>
    document.documentElement.hasAttribute("data-viewer-deep-link");

  it("keeps the SSR cover underneath a deep-linked viewer until it closes", () => {
    revealCover();
    renderExplorer("viewer=slug-4");

    expect(screen.getByTestId("replication-viewer")).toBeInTheDocument();
    expect(coverIsRevealed()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Close viewer" }));
    expect(screen.queryByTestId("replication-viewer")).toBeNull();
    expect(coverIsRevealed()).toBe(false);
  });

  it("drops the cover when the viewer param resolves to no known work", () => {
    revealCover();
    renderExplorer("viewer=never-existed");

    expect(screen.queryByTestId("replication-viewer")).toBeNull();
    expect(
      screen.getByText(
        "The linked replication is no longer available in this collection.",
      ),
    ).toBeInTheDocument();
    expect(coverIsRevealed()).toBe(false);
  });

  it("drops the cover on a plain visit without a viewer param", () => {
    revealCover();
    renderExplorer("");

    expect(coverIsRevealed()).toBe(false);
  });
});

describe("effects withheld from artist browsing", () => {
  const withCreature = [
    ...corpus,
    rep({
      artist: "Giger",
      title: "Withheld work",
      effect_slug: "unspeakable-horrors",
    }),
  ];

  it("drops the work, its artist, and their share of the count", () => {
    renderExplorer("type=image", { replications: withCreature });

    expect(screen.queryByText("Withheld work")).toBeNull();
    expect(screen.queryByText("Giger")).toBeNull();
    // Three of four, not four of five: both numbers describe what artist
    // browsing can actually show, or the line is claiming rows the grid will
    // never render.
    expect(screen.getByRole("status")).toHaveTextContent("3 of 4 works");
  });

  it("keeps the work and the whole corpus count under effect browsing", () => {
    renderExplorer("view=effect&type=image", { replications: withCreature });

    expect(screen.getByText("Withheld work")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("4 of 5 works");
  });

  it("searches the whole corpus in either mode, and counts it that way", () => {
    // A search is a deliberate ask, not idle paging, and it returns the same
    // rows whichever grouping is toggled — so the counts go corpus-wide too.
    renderExplorer("q=withheld", { replications: withCreature });

    expect(screen.getByText("Withheld work")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 5 works");
  });
});

describe("state → URL", () => {
  it("pushes the mode choice as navigation between browse URLs", async () => {
    renderExplorer("");

    await chooseFromMenu("Browse by: By artist", "By effect");

    expect(window.location.pathname + window.location.search).toBe(
      "/replications?view=effect",
    );
    expect(historySpies.push).toHaveBeenCalledTimes(1);
  });

  it("pushes the media-type filter into the query string", async () => {
    renderExplorer("view=effect");

    chooseMediaSync("Videos");

    expect(window.location.pathname + window.location.search).toBe(
      "/replications?view=effect&type=video",
    );
    expect(historySpies.push).toHaveBeenCalledTimes(1);
  });

  it("debounces typed search into router.replace, preserving other params", () => {
    // fireEvent, not userEvent: userEvent's async plumbing deadlocks under
    // fake timers, and per-keystroke change events are exactly what the
    // debounce consumes anyway.
    vi.useFakeTimers();
    renderExplorer("type=video");
    const input = screen.getByRole("textbox", { name: "Search replications" });

    for (const value of ["d", "dri", "drift"]) {
      fireEvent.change(input, { target: { value } });
    }
    expect(historySpies.replace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // One replacement for three keystrokes, carrying the final text.
    expect(historySpies.replace).toHaveBeenCalledTimes(1);
    expect(historySpies.push).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe(
      "/replications?q=drift&type=video",
    );
  });

  it("shows a pending spinner only while a query write is in the debounce window", () => {
    vi.useFakeTimers();
    renderExplorer("");
    const input = screen.getByRole("textbox", { name: "Search replications" });

    expect(screen.queryByTestId("query-write-pending")).toBeNull();

    fireEvent.change(input, { target: { value: "drift" } });
    expect(screen.getByTestId("query-write-pending")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByTestId("query-write-pending")).toBeNull();
    expect(historySpies.replace).toHaveBeenCalledTimes(1);
  });

  it("retires the pending spinner when a toggle cancels the scheduled write", () => {
    vi.useFakeTimers();
    renderExplorer("");
    const input = screen.getByRole("textbox", { name: "Search replications" });

    fireEvent.change(input, { target: { value: "drift" } });
    expect(screen.getByTestId("query-write-pending")).toBeInTheDocument();

    // A menu choice flushes the whole state immediately, cancelling the write.
    chooseFromMenuSync("Browse by: By artist", "By effect");

    expect(screen.queryByTestId("query-write-pending")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(historySpies.replace).not.toHaveBeenCalled();
  });
});

describe("focused views", () => {
  it("renders an artist focus as the Artist Page itself: no self profile link", () => {
    renderExplorer("", { focus: { kind: "artist", key: "chelsea-morgan" } });

    expect(
      screen.getByRole("heading", { name: "Chelsea Morgan" }),
    ).toBeInTheDocument();
    // The focus view IS the one artist surface, so nothing here may link to a
    // rival page — neither the old "View profile" nor a self-reference.
    expect(screen.queryByRole("link", { name: /View profile/ })).toBeNull();
    expect(screen.getByRole("link", { name: /All artists/ })).toHaveAttribute(
      "href",
      "/replications",
    );
  });

  it("renders the identity decoration inside an artist focus only", () => {
    const identity = <div data-testid="artist-identity">bio and links</div>;
    const { unmount } = renderExplorer("", {
      focus: { kind: "artist", key: "chelsea-morgan" },
      focusIdentity: identity,
    });
    expect(screen.getByTestId("artist-identity")).toBeInTheDocument();
    unmount();

    // An effect focus never decorates: identity belongs to artists.
    renderExplorer("", {
      focus: { kind: "effect", key: "drifting" },
      focusIdentity: identity,
    });
    expect(screen.queryByTestId("artist-identity")).toBeNull();
  });

  it("renders an unknown artist focus without a profile link", () => {
    renderExplorer("", { focus: { kind: "artist", key: "aria" } });

    expect(screen.getByRole("heading", { name: "Aria" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View profile/ })).toBeNull();
  });

  it("renders an effect focus linking to the effect article", () => {
    renderExplorer("", { focus: { kind: "effect", key: "drifting" } });

    expect(
      screen.getByRole("heading", { name: "Drifting" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /View effect article/ }),
    ).toHaveAttribute("href", "/effects/drifting");
    expect(screen.getByRole("link", { name: /All effects/ })).toHaveAttribute(
      "href",
      "/replications?view=effect",
    );
  });

  it("keeps the focus header when ?type= filters the group empty", () => {
    renderExplorer("type=video", { focus: { kind: "artist", key: "aria" } });

    // Aria has only images; the header must survive so the reader can escape
    // the filter, and the masonry gives way to an explanatory empty state.
    expect(screen.getByRole("heading", { name: "Aria" })).toBeInTheDocument();
    expect(screen.getByText(/No videos here/)).toBeInTheDocument();
  });

  it("drops the control bar and corpus stats under focus-only chrome, keeping the focus view", () => {
    renderExplorer("", {
      focus: { kind: "artist", key: "chelsea-morgan" },
      chrome: "focus-only",
    });

    // The Artist Page is a profile, not a querying surface: no sticky control
    // bar (search, browse-mode, media-type, sort) and no corpus summary.
    expect(screen.queryByTestId("gallery-control-bar")).toBeNull();
    expect(screen.queryByText(/works · .* artists · .* effects/)).toBeNull();

    // The focus view itself is untouched: back link, heading, works count, tiles.
    expect(
      screen.getByRole("link", { name: /All artists/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Chelsea Morgan" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 works")).toBeInTheDocument();
    expect(screen.getAllByTestId("tile").length).toBe(3);
  });
});

describe("responsive gallery controls", () => {
  it("keeps search visible after blur and provides a clear action", async () => {
    const user = userEvent.setup();
    renderExplorer("q=drifting");
    const input = screen.getByRole("textbox", { name: "Search replications" });
    fireEvent.blur(input);
    expect(input).toHaveValue("drifting");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("keeps grouping outside advanced filters", async () => {
    const user = userEvent.setup();
    renderExplorer("");
    await chooseFromMenu("Browse by: By artist", "By effect");
    expect(window.location.pathname + window.location.search).toBe(
      "/replications?view=effect",
    );
    expect(historySpies.push).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    expect(
      within(screen.getByRole("dialog")).queryByRole("menuitemradio", {
        name: /^By /,
      }),
    ).toBeNull();
  });

  it("orders the filter selects with the named-in-the-title group last and closes on Done", async () => {
    const user = userEvent.setup();
    renderExplorer("");

    await user.click(screen.getByRole("button", { name: /Filters/ }));

    const sheet = screen.getByRole("dialog");
    // The two title-scoped axes live under one heading that carries the
    // "named in the title" meaning, so their own labels stay short.
    expect(
      within(sheet).getByRole("group", { name: "Named in the title" }),
    ).toBeInTheDocument();
    // Media leads: it is the axis readers reach for most, and the one whose
    // own bar slot this popover absorbed.
    expect(
      within(sheet)
        .getAllByRole("combobox")
        .map((trigger) => trigger.getAttribute("aria-label")),
    ).toEqual([
      "Media",
      "Depicted effect",
      "Viewing mode",
      "Content family",
      "Artist practice",
      "Drug in title",
      "Drug class in title",
    ]);
    // Every axis idles on the neutral "Any", and the misleading untagged-works
    // footnote is gone in favor of what filtering actually does.
    expect(
      within(sheet).getByRole("combobox", { name: "Depicted effect" }),
    ).toHaveTextContent("Any");
    expect(
      within(sheet).getByText(
        "Filtering by a tag hides works nobody has tagged yet.",
      ),
    ).toBeInTheDocument();

    // Done is the explicit mobile-reachable dismissal; it changes nothing.
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(historySpies.push).not.toHaveBeenCalled();
  });

  it("offers each axis its own orders through the menu", async () => {
    const user = userEvent.setup();
    renderExplorer("view=effect");

    await user.click(screen.getByRole("button", { name: /^Order:/ }));

    // Curation is an effect-view answer: an editor picked what represents the
    // effect. The artist and year axes have no such list.
    expect(
      screen.getByRole("menuitemradio", { name: "Curated" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: "Newest" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("menuitemradio", { name: "Oldest" }));

    expect(window.location.pathname + window.location.search).toBe(
      "/replications?view=effect&sort=oldest",
    );
    expect(historySpies.push).toHaveBeenCalledTimes(1);
  });

  it("offers the artist axis no curated order", async () => {
    const user = userEvent.setup();
    renderExplorer("");

    await user.click(screen.getByRole("button", { name: /^Order:/ }));

    expect(screen.queryByRole("menuitemradio", { name: "Curated" })).toBeNull();
    await user.click(screen.getByRole("menuitemradio", { name: "Oldest" }));
    expect(window.location.pathname + window.location.search).toBe(
      "/replications?sort=oldest",
    );
    expect(historySpies.push).toHaveBeenCalledTimes(1);
  });
});


describe("bounded gallery pages", () => {
  const pageResponse = (
    rows: unknown[],
    options: { total?: number; nextCursor?: string | null } = {},
  ) => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: rows,
      total: options.total ?? rows.length,
      nextCursor: options.nextCursor ?? null,
      groups: [],
      facets: { drugs: [], effects: [] },
    }),
  });

  it.each(["en", "zh-Hans"])("retains bootstrapped artist rails and continues their cursor without a first-page fetch (%s)", async (locale) => {
    const rows = Array.from({ length: 17 }, (_, index) => rep({
      artist: `Artist ${String(index).padStart(2, "0")}`, title: `Rail work ${index}`,
    }));
    const allGroups = groupByArtist(rows);
    const initialPage: GalleryPageState = {
      queryIdentity: galleryQueryIdentity(locale, GALLERY_BROWSE_DEFAULTS),
      total: 17, nextCursor: "rail-page-16", facets: { drugs: [], effects: [] },
      groups: allGroups.map(({ key, label, count, imageCount, videoCount, items }, index) => ({
        key, label, count, imageCount, videoCount, itemIds: index < 16 ? items.map((item) => item._id) : [],
      })),
    };
    const opening = allGroups.slice(0, 16).flatMap((group) => group.items);
    const finalWork = allGroups[16].items[0];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({
        ...initialPage, nextCursor: null, data: [opening[0], finalWork],
        groups: initialPage.groups.map((group, index) => ({ ...group, itemIds: index === 16 ? [finalWork._id] : [] })),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      renderExplorer("", { replications: opening, initialPage, galleryPageUrl: `/api/replications/gallery?locale=${locale}` });
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("rail").map((rail) => rail.getAttribute("aria-label"))).toEqual(allGroups.slice(0, 16).map((group) => group.label));
    fireEvent.click(screen.getByRole("button", { name: "Show more artists" }));
    await screen.findByText(finalWork.title);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = new URL(String(fetchMock.mock.calls[0][0]));
    expect(request.searchParams.get("cursor")).toBe("rail-page-16");
    expect(request.searchParams.get("locale")).toBe(locale);
    expect(screen.getAllByTestId("rail").map((rail) => rail.getAttribute("aria-label"))).toEqual(allGroups.map((group) => group.label));
    expect(screen.getAllByTestId("rail-tile")).toHaveLength(17);
  });

  it("replaces a default bootstrap for a changed URL and reloads page one on history return", async () => {
    const first = rep({ title: "Bootstrap image" });
    const video = rep({ title: "Filtered video", type: "video" });
    const initialPage: GalleryPageState = {
      queryIdentity: galleryQueryIdentity("en", GALLERY_BROWSE_DEFAULTS),
      total: 1, nextCursor: null, groups: [], facets: { drugs: [], effects: [] },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(pageResponse([video]))
      .mockResolvedValueOnce(pageResponse([first]));
    vi.stubGlobal("fetch", fetchMock);
    const props = { replications: [first], effects, initialPage, galleryPageUrl: "/api/replications/gallery" };
    const view = renderExplorer("type=video", props);
    await screen.findByText("Filtered video");
    expect(screen.queryByText("Bootstrap image")).toBeNull();
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("type")).toBe("video");
    navMocks.params = new URLSearchParams();
    view.rerender(<ReplicationsGalleryExplorer {...props} />);
    await screen.findByText("Bootstrap image");
    expect(screen.queryByText("Filtered video")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("cursor")).toBeNull();
  });

  it("resolves a viewer beyond a matching bootstrap without replacing or refetching its rail page", async () => {
    const first = rep({ title: "Retained first work" });
    const linked = rep({ title: "Deferred viewer work", slug: "deferred-viewer" });
    const initialPage: GalleryPageState = {
      queryIdentity: galleryQueryIdentity("en", GALLERY_BROWSE_DEFAULTS),
      total: 2, nextCursor: null, groups: [], facets: { drugs: [], effects: [] },
    };
    const fetchMock = vi.fn().mockResolvedValue(pageResponse([first, linked], { total: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    renderExplorer("viewer=deferred-viewer", {
      replications: [first], initialPage, galleryPageUrl: "/api/replications/gallery",
    });
    expect(await screen.findByTestId("replication-viewer")).toHaveAttribute("data-initial-slug", "deferred-viewer");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("viewer")).toBe("deferred-viewer");
    expect(screen.getByText("Retained first work")).toBeInTheDocument();
  });

  it("keeps search editable after a matching page is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pageResponse([])));
    await act(async () => {
      renderExplorer("q=missing", {
        replications: [],
        galleryPageUrl: "/api/replications/gallery",
      });
    });

    const search = screen.getByRole("textbox", { name: "Search replications" });
    expect(search).toHaveValue("missing");
    fireEvent.change(search, { target: { value: "another artist" } });
    expect(search).toHaveValue("another artist");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
  });

  it("resolves a viewer outside page one without replacing the loaded page", async () => {
    const first = rep({ title: "First work" });
    const linked = rep({ title: "Linked work", slug: "linked-work" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(pageResponse([first], { total: 65 }))
      .mockResolvedValueOnce(pageResponse([first, linked], { total: 65 }));
    vi.stubGlobal("fetch", fetchMock);

    renderExplorer("viewer=linked-work", {
      replications: [first],
      galleryPageUrl: "/api/replications/gallery?locale=zh-Hans",
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("viewer")).toBeNull();
    const viewerRequest = new URL(String(fetchMock.mock.calls[1][0]));
    expect(viewerRequest.searchParams.get("viewer")).toBe("linked-work");
    expect(viewerRequest.searchParams.get("locale")).toBe("zh-Hans");
    expect(await screen.findByTestId("replication-viewer")).toHaveAttribute(
      "data-initial-slug",
      "linked-work",
    );
    expect(screen.getByText("First work")).toBeInTheDocument();
  });

  it("keeps a failed viewer link recoverable without automatically retrying", async () => {
    const first = rep({ title: "First work" });
    const linked = rep({ title: "Linked work", slug: "linked-work" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(pageResponse([first], { total: 65 }))
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(pageResponse([first, linked], { total: 65 }));
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/replications?viewer=linked-work");
    renderExplorer("viewer=linked-work", {
      replications: [first],
      galleryPageUrl: "/api/replications/gallery",
    });
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(new URLSearchParams(window.location.search).get("viewer")).toBe("linked-work");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(retry);
    expect(await screen.findByTestId("replication-viewer")).toHaveAttribute(
      "data-initial-slug", "linked-work",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a failed filtered page without losing its query", async () => {
    const match = rep({ title: "Deferred match" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(pageResponse([match], { total: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    renderExplorer("q=deferred", {
      replications: [],
      galleryPageUrl: "/api/replications/gallery",
    });
    const retry = await screen.findByRole("button", { name: "Retry" });
    fireEvent.click(retry);

    await screen.findByText("Deferred match");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [request] of fetchMock.mock.calls) {
      expect(new URL(String(request)).searchParams.get("q")).toBe("deferred");
    }
  });

  it("ignores a late response owned by an older query", async () => {
    const stale = rep({ title: "Stale work" });
    const fresh = rep({ title: "Fresh work" });
    let resolveStale!: (response: unknown) => void;
    const staleRequest = new Promise<unknown>((resolve) => { resolveStale = resolve; });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(staleRequest)
      .mockResolvedValueOnce(pageResponse([fresh], { total: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const props = {
      replications: [],
      effects,
      contributorDirectory,
      galleryPageUrl: "/api/replications/gallery",
    };

    const view = renderExplorer("q=stale", props);
    navMocks.params = new URLSearchParams("q=fresh");
    view.rerender(<ReplicationsGalleryExplorer {...props} />);
    await screen.findByText("Fresh work");
    await act(async () => { resolveStale(pageResponse([stale], { total: 1 })); });

    expect(screen.queryByText("Stale work")).toBeNull();
    expect(screen.getByText("Fresh work")).toBeInTheDocument();
  });

  it("continues through every matching search page", async () => {
    const first = rep({ title: "Needle first", artist: "Focused Artist" });
    const second = rep({ title: "Needle second", artist: "Focused Artist" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(pageResponse([first], { total: 2, nextCursor: "64" }))
      .mockResolvedValueOnce(pageResponse([second], { total: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    renderExplorer("q=needle", {
      replications: [],
      galleryPageUrl: "/api/replications/gallery",
    });
    await screen.findByText("Needle first");
    fireEvent.click(screen.getByRole("button", { name: "Load more works" }));
    await screen.findByText("Needle second");
    expect(screen.getByText("Needle first")).toBeInTheDocument();
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("cursor")).toBe("64");
  });

  it("replaces stale membership when Load more restarts after a cursor conflict", async () => {
    const stale = rep({ title: "Needle removed" });
    const fresh = rep({ title: "Needle current" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(pageResponse([stale], { total: 2, nextCursor: "64" }))
      .mockResolvedValueOnce({ ok: false, status: 409 })
      .mockResolvedValueOnce(pageResponse([fresh], { total: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    renderExplorer("q=needle", {
      replications: [],
      galleryPageUrl: "/api/replications/gallery?locale=zh-Hans",
    });
    await screen.findByText("Needle removed");
    fireEvent.click(screen.getByRole("button", { name: "Load more works" }));
    await screen.findByRole("button", { name: "Retry" });

    fireEvent.click(screen.getByRole("button", { name: "Load more works" }));
    await screen.findByText("Needle current");

    expect(screen.queryByText("Needle removed")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const restart = new URL(String(fetchMock.mock.calls[2][0]));
    expect(restart.searchParams.get("cursor")).toBeNull();
    expect(restart.searchParams.get("q")).toBe("needle");
    expect(restart.searchParams.get("locale")).toBe("zh-Hans");
  });

  it("continues a canonical focused collection without losing focus identity", async () => {
    const first = rep({ title: "Focused first", artist: "Chelsea Morgan" });
    const second = rep({ title: "Focused second", artist: "Chelsea Morgan" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(pageResponse([first], { total: 2, nextCursor: "64" }))
      .mockResolvedValueOnce(pageResponse([second], { total: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    renderExplorer("", {
      replications: [first],
      galleryPageUrl: "/api/replications/gallery",
      focus: { kind: "artist", key: "chelsea-morgan" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Load more works" }));
    await screen.findByText("Focused second");
    const continuation = new URL(String(fetchMock.mock.calls[1][0]));
    expect(continuation.searchParams.get("focusKind")).toBe("artist");
    expect(continuation.searchParams.get("focusKey")).toBe("chelsea-morgan");
    expect(continuation.searchParams.get("cursor")).toBe("64");
  });
});
