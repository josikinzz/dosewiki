import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { MouseEvent as ReactMouseEvent } from "react";
import type {
  GalleryReplication,
  PublicGalleryReplicationPreview,
} from "@/types/replications";
import type { GalleryGroup } from "@/features/effects/gallery/galleryModel";
import {
  ReplicationsGalleryExplorer,
  type ReplicationsGalleryExplorerProps,
} from "./ReplicationsGalleryExplorer";

const navMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navMocks.push, replace: navMocks.replace }),
  useSearchParams: () => navMocks.params,
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
    viewerHrefFor,
  }: {
    group: GalleryGroup;
    viewAllHref: string;
    tileBylines?: boolean;
    mobileCompact?: boolean;
    onTileOpen?: (
      event: ReactMouseEvent,
      replication: PublicGalleryReplicationPreview,
    ) => void;
    viewerHrefFor: (replication: PublicGalleryReplicationPreview) => string;
  }) => (
    <section
      data-testid="rail"
      data-tile-bylines={String(tileBylines ?? true)}
      data-mobile-compact={String(mobileCompact ?? false)}
      data-view-all={viewAllHref}
      aria-label={group.label}
    >
      {group.href ? (
        <a href={group.href}>{group.label}</a>
      ) : (
        <span>{group.label}</span>
      )}
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
vi.mock("./viewer/ReplicationViewerOverlay", () => ({
  ReplicationViewerOverlay: ({
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
  { slug: "geometry", name: "Geometry", tags: [] },
  { slug: "drifting", name: "Drifting", tags: [] },
];

const contributorDirectory = [
  { key: "chelseamorgan", displayName: "Chelsea Morgan", aliases: [] },
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

/** The explorer only reads `matches`, so a stub this thin is faithful. */
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches }));
}

beforeEach(() => {
  navMocks.push.mockReset();
  navMocks.replace.mockReset();
  window.history.replaceState({}, "", "/replications");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("URL → rendered state", () => {
  it("renders the default browse state from the bare path", () => {
    renderExplorer("");

    expect(screen.getByRole("radio", { name: "By artist" })).toHaveAttribute(
      "data-state",
      "on",
    );
    expect(screen.getByRole("radio", { name: "All" })).toHaveAttribute(
      "data-state",
      "on",
    );
    // Video-first is the default artist order (T-8), so its pill is lit.
    expect(screen.getByRole("radio", { name: "Videos first" })).toHaveAttribute(
      "data-state",
      "on",
    );
    // The spotlight row is gone: density-first, media starts immediately.
    expect(screen.queryByText("Spotlight")).toBeNull();
  });

  it("reproduces a pasted ?view=effect&type=video&sort=alpha state exactly", () => {
    renderExplorer("view=effect&type=video&sort=alpha");

    expect(screen.getByRole("radio", { name: "By effect" })).toHaveAttribute(
      "data-state",
      "on",
    );
    expect(screen.getByRole("radio", { name: "Videos" })).toHaveAttribute(
      "data-state",
      "on",
    );
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

describe("un-carded gallery chrome", () => {
  it("renders the section without card chrome, keeping only width and rhythm", () => {
    renderExplorer("");

    const section = screen.getByRole("region", {
      name: "Replications gallery",
    });
    expect(section.className).toContain("max-w-7xl");
    // The frosted control bar is now the only elevated element; the section
    // itself must not read as a card.
    expect(section.className).not.toMatch(/rounded|border|shadow|bg-/);
  });

  it("renders the corpus summary exactly once, visible at every breakpoint", () => {
    renderExplorer("");

    // getByText throws on duplicates, so this also proves the md:hidden twin
    // and the in-bar span are gone.
    const summary = screen.getByText("4 works · 2 artists · 2 effects");
    expect(summary.className).not.toMatch(/md:hidden|md:inline/);
  });
});

describe("hybrid browse layout", () => {
  it("gives artists with three or more works a rail and pools the rest", () => {
    renderExplorer("");

    // Chelsea (3 works) earns a rail whose heading links to her Artist Page.
    expect(
      screen.getByRole("link", { name: "Chelsea Morgan" }),
    ).toHaveAttribute("href", "/replications/artist/chelsea-morgan");
    // Aria (1 work) gets no rail of her own…
    expect(screen.queryByText("Aria")).toBeNull();
    // …her work pools into the "More artists" masonry instead.
    expect(
      screen.getByRole("heading", { name: "More artists" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Work 4")).toBeInTheDocument();
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
  });

  it("keeps the artist-sort control mounted but hidden in effect mode, so the bar cannot jitter", () => {
    renderExplorer("view=effect");

    expect(
      screen.getByText("Most works").closest('[aria-hidden="true"]'),
    ).not.toBeNull();
  });
});

describe("byline and compact wiring", () => {
  it("drops rail bylines in artist mode but keeps them on pooled tiles", () => {
    renderExplorer("");

    // The artist rail already names its artist in the heading.
    const rail = screen.getByTestId("rail");
    expect(rail).toHaveAttribute("data-tile-bylines", "false");
    expect(rail).toHaveAttribute("data-mobile-compact", "true");
    // The pooled masonry mixes artists, so each tile keeps its attribution.
    const pooled = screen.getByTestId("tile");
    expect(pooled).toHaveAttribute("data-show-byline", "true");
    expect(pooled).toHaveAttribute("data-mobile-compact", "true");
  });

  it("keeps rail bylines in effect mode, where the heading names no artist", () => {
    renderExplorer("view=effect");

    expect(screen.getByTestId("rail")).toHaveAttribute(
      "data-tile-bylines",
      "true",
    );
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

  it("opens the collection at its first work and closes over the intact gallery", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    renderExplorer("");

    fireEvent.click(
      screen.getByRole("button", { name: "Open replication viewer" }),
    );

    const viewer = screen.getByTestId("replication-viewer");
    expect(viewer).toHaveAttribute("data-initial-slug", "slug-2");
    expect(viewer).toHaveAttribute(
      "data-collection-label",
      "Sorted by artist",
    );
    expect(pushState).toHaveBeenCalledWith(
      expect.objectContaining({ replicationViewer: true }),
      "",
      expect.stringContaining("viewer=slug-2"),
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

    fireEvent.click(screen.getAllByTestId("rail-tile")[0]);

    expect(screen.getByTestId("replication-viewer")).toHaveAttribute(
      "data-initial-slug",
      "slug-2",
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
      "view=effect&q=drifting&type=video&sort=alpha&viewer=slug-2",
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
      "/replications?view=effect&q=drifting&type=video&sort=alpha&viewer=slug-2",
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

describe("effects withheld from artist browsing", () => {
  const withCreature = [
    ...corpus,
    rep({
      artist: "Giger",
      title: "Withheld work",
      effect_slug: "unspeakable-horrors",
    }),
  ];

  it("drops the work, its artist, and their share of the header counts", () => {
    renderExplorer("", { replications: withCreature });

    expect(screen.queryByText("Withheld work")).toBeNull();
    expect(screen.queryByText("Giger")).toBeNull();
    // Four works, not five: the header describes what artist browsing can
    // actually show, or it is claiming a work the grid will never render.
    expect(
      screen.getByText("4 works · 2 artists · 2 effects"),
    ).toBeInTheDocument();
  });

  it("keeps the work and the whole corpus count under effect browsing", () => {
    renderExplorer("view=effect", { replications: withCreature });

    expect(screen.getByText("Withheld work")).toBeInTheDocument();
    expect(
      screen.getByText("5 works · 3 artists · 3 effects"),
    ).toBeInTheDocument();
  });

  it("searches the whole corpus in either mode, and counts it that way", () => {
    // A search is a deliberate ask, not idle paging, and it returns the same
    // rows whichever grouping is toggled — so the counts go corpus-wide too.
    renderExplorer("q=withheld", { replications: withCreature });

    expect(screen.getByText("Withheld work")).toBeInTheDocument();
    expect(
      screen.getByText("5 works · 3 artists · 3 effects"),
    ).toBeInTheDocument();
  });
});

describe("state → URL", () => {
  it("pushes the mode toggle as navigation between browse URLs", async () => {
    const user = userEvent.setup();
    renderExplorer("");

    await user.click(screen.getByRole("radio", { name: "By effect" }));

    expect(navMocks.push).toHaveBeenCalledWith("/replications?view=effect", {
      scroll: false,
    });
  });

  it("pushes the media-type filter into the query string", async () => {
    const user = userEvent.setup();
    renderExplorer("view=effect");

    await user.click(screen.getByRole("radio", { name: "Videos" }));

    expect(navMocks.push).toHaveBeenCalledWith(
      "/replications?view=effect&type=video",
      {
        scroll: false,
      },
    );
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
    expect(navMocks.replace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // One write for three keystrokes, carrying the final text.
    expect(navMocks.replace).toHaveBeenCalledTimes(1);
    expect(navMocks.replace).toHaveBeenCalledWith(
      "/replications?q=drift&type=video",
      {
        scroll: false,
      },
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
    expect(navMocks.replace).toHaveBeenCalledTimes(1);
  });

  it("retires the pending spinner when a toggle cancels the scheduled write", () => {
    vi.useFakeTimers();
    renderExplorer("");
    const input = screen.getByRole("textbox", { name: "Search replications" });

    fireEvent.change(input, { target: { value: "drift" } });
    expect(screen.getByTestId("query-write-pending")).toBeInTheDocument();

    // Toggles flush the whole state immediately, cancelling the pending write.
    fireEvent.click(screen.getByRole("radio", { name: "By effect" }));

    expect(screen.queryByTestId("query-write-pending")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(navMocks.replace).not.toHaveBeenCalled();
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

describe("one-line control bar", () => {
  it("renders one non-wrapping row with min-width discipline", () => {
    renderExplorer("");

    const bar = screen.getByTestId("gallery-control-bar");
    expect(bar.className).toContain("flex-nowrap");
    expect(bar.className).toContain("min-w-0");
    expect(bar.className.split(/\s+/)).not.toContain("flex-wrap");
  });

  it("expands the phone search button into the focused input and collapses on Escape", async () => {
    const user = userEvent.setup();
    renderExplorer("");
    const reveal = screen.getByRole("button", { name: "Search replications" });
    expect(reveal).toHaveAttribute("aria-expanded", "false");

    await user.click(reveal);

    expect(reveal).toHaveAttribute("aria-expanded", "true");
    const input = screen.getByRole("textbox", { name: "Search replications" });
    expect(input).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(reveal).toHaveAttribute("aria-expanded", "false");
  });

  it("collapses the expanded phone search when the input blurs, keeping the query", async () => {
    const user = userEvent.setup();
    renderExplorer("q=drifting");
    const reveal = screen.getByRole("button", { name: "Search replications" });
    const input = screen.getByRole("textbox", { name: "Search replications" });

    await user.click(reveal);
    fireEvent.blur(input);

    expect(reveal).toHaveAttribute("aria-expanded", "false");
    // Collapse is presentation only — the live query survives it.
    expect(input).toHaveValue("drifting");
  });

  it("keeps the browse-mode toggle reachable through the Filters sheet", async () => {
    const user = userEvent.setup();
    renderExplorer("");

    await user.click(screen.getByRole("button", { name: /Filters/ }));

    const sheet = screen.getByRole("dialog");
    await user.click(within(sheet).getByRole("radio", { name: "By effect" }));

    expect(navMocks.push).toHaveBeenCalledWith("/replications?view=effect", {
      scroll: false,
    });
    // Choosing a mode is the sheet's whole job; it closes on selection.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps every artist sort reachable through the compact menu", async () => {
    const user = userEvent.setup();
    renderExplorer("");

    await user.click(screen.getByRole("button", { name: "Sort artists" }));

    // All three orders travel with the menu, not a two-state cycle.
    expect(
      screen.getByRole("menuitemradio", { name: "Videos first" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: "Most works" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("menuitemradio", { name: "A–Z" }));

    expect(navMocks.push).toHaveBeenCalledWith("/replications?sort=alpha", {
      scroll: false,
    });
  });
});
