import {
  cleanup,
  fireEvent,
  render,
  screen,
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
} from "vitest";

import { ReplicationViewerOverlay } from "./ReplicationViewerOverlay";
import type { ReplicationViewerCollection } from "./viewerModel";
import { ContextualEditingContext, type ContextualEditingState } from "@/features/contextual-editing/context";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => window.location.pathname,
  useSelectedLayoutSegments: () => [],
}));

const transportVerbs = vi.hoisted(() => ({
  togglePlayback: vi.fn(),
  toggleMuted: vi.fn(),
  surfaceTap: vi.fn(),
  toggleChrome: vi.fn(),
}));

// The transport chrome is mocked to a flat control strip; the pooled media
// track underneath is real, so navigation, gestures, and pool behavior run
// against the production code path.
vi.mock("./ViewerTransport", () => ({
  ViewerTransport: ({
    item,
    muted,
    onMutedChange,
    rotateMode,
    onRotateModeChange,
    onPrevious,
    onNext,
    onInfo,
    infoOpen,
    infoControls,
    onFullscreen,
    fullscreenSupported,
    previousLabel,
    nextLabel,
    onTransportHandle,
  }: {
    item: { replication: { title: string; type: "image" | "video" } };
    muted: boolean;
    onMutedChange: (muted: boolean) => void;
    rotateMode?: boolean;
    onRotateModeChange?: (rotateMode: boolean) => void;
    onPrevious?: () => void;
    onNext?: () => void;
    onInfo?: () => void;
    infoOpen?: boolean;
    infoControls?: string;
    onFullscreen?: () => void;
    fullscreenSupported: boolean;
    previousLabel: string;
    nextLabel: string;
    onTransportHandle?: (
      handle: {
        togglePlayback: () => void;
        toggleMuted: () => void;
        surfaceTap: () => void;
        toggleChrome: () => void;
      } | null,
    ) => void;
  }) => {
    // Render-time registration mirrors the real transport's effect closely
    // enough for shortcut plumbing tests: video works get verbs, stills none.
    onTransportHandle?.(
      item.replication.type === "video" ? transportVerbs : null,
    );
    return (
      <div data-testid="viewer-transport" data-title={item.replication.title}>
        <button
          type="button"
          aria-label={muted ? "Unmute" : "Mute"}
          onClick={() => onMutedChange(!muted)}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button
          type="button"
          aria-label={previousLabel}
          disabled={!onPrevious}
          onClick={onPrevious}
        >
          Previous
        </button>
        <button
          type="button"
          aria-label={nextLabel}
          disabled={!onNext}
          onClick={onNext}
        >
          Next
        </button>
        <button
          type="button"
          aria-expanded={infoOpen}
          aria-controls={infoControls}
          onClick={onInfo}
        >
          Information
        </button>
        <button
          type="button"
          aria-pressed={rotateMode}
          aria-label={
            rotateMode ? "Rotate back upright" : "Rotate to fill screen"
          }
          onClick={() => onRotateModeChange?.(!rotateMode)}
        >
          Rotate
        </button>
        {onFullscreen && fullscreenSupported ? (
          <button type="button" onClick={onFullscreen}>
            Fullscreen
          </button>
        ) : null}
      </div>
    );
  },
}));

// The rail is the transport mock's peer: a flat strip honoring the contract
// surface (nav label, selection, onSelect, lean/fade props) sans thumbnails.
vi.mock("./ViewerThumbnailRail", () => ({
  ViewerThumbnailRail: ({
    items,
    selectedIndex,
    groupLabel,
    rotated,
    chromeHidden,
    onSelect,
  }: {
    items: { replication: { slug: string; title: string } }[];
    selectedIndex: number;
    groupLabel: string;
    rotated: boolean;
    chromeHidden: boolean;
    onSelect: (itemIndex: number) => void;
    focusRingClassName: string;
  }) => (
    <nav
      aria-label={`${groupLabel} works`}
      data-rotated={rotated}
      data-chrome-hidden={chromeHidden}
    >
      {items.map((item, itemIndex) => (
        <button
          key={item.replication.slug}
          type="button"
          aria-label={`Show ${item.replication.title}`}
          aria-current={itemIndex === selectedIndex ? "true" : undefined}
          onClick={() => onSelect(itemIndex)}
        />
      ))}
    </nav>
  ),
}));

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src }: { src: string }) => <img src={src} alt="" />,
}));

const collection: ReplicationViewerCollection = {
  sourcePath: "/replications",
  label: "Sorted by artist",
  kind: "gallery",
  grouping: "artist",
  groups: [
    {
      key: "chelsea",
      label: "Chelsea Morgan",
      items: [
        {
          replication: {
            slug: "work-one",
            title: "Work One",
            artist: "Chelsea Morgan",
            type: "image",
            format: "jpg",
            url: "https://cdn.test/one.jpg",
          },
          effectName: "Tracers",
          effectSlug: "tracers",
          effectCategories: [],
          artistProfileHref: "/replications/artist/chelsea-morgan",
          avatarUrl: null,
        },
        {
          replication: {
            slug: "work-two",
            title: "Work Two",
            artist: "Chelsea Morgan",
            type: "video",
            format: "mp4",
            url: "https://cdn.test/two.mp4",
            preview_url: "https://cdn.test/two-preview.mp4",
          },
          effectName: "Drifting",
          effectSlug: "drifting",
          effectCategories: [],
          artistProfileHref: "/replications/artist/chelsea-morgan",
          avatarUrl: null,
        },
      ],
    },
    {
      key: "aria",
      label: "Aria",
      items: [
        {
          replication: {
            slug: "work-three",
            title: "Work Three",
            artist: "Aria",
            type: "image",
            format: "jpg",
            url: "https://cdn.test/three.jpg",
          },
          effectName: "Geometry",
          effectSlug: "geometry",
          effectCategories: [],
          artistProfileHref: null,
          avatarUrl: null,
        },
      ],
    },
  ],
};

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // jsdom's media methods are unimplemented; the pooled track drives its
  // elements through play()/pause()/load(), so give them quiet, observable
  // stand-ins.
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "load", {
    configurable: true,
    value: vi.fn(),
  });
});

beforeEach(() => {
  window.history.replaceState(
    {},
    "",
    "/replications?type=video&viewer=work-one",
  );
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          slug: "work-one",
          format: "jpg",
          width: 1600,
          height: 900,
          date_info: {
            value: "2020",
            kind: "year",
            confidence: "high",
          },
          rights: {
            status: "permission-granted",
            license_name: "CC BY 4.0",
            license_url: "https://creativecommons.org/licenses/by/4.0/",
            source_url: "https://artist.test/work-one",
            rightsholder: "Chelsea Morgan",
          },
        },
      }),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubCoarsePointer(coarse: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: coarse && query.includes("pointer: coarse"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
}


describe("ReplicationViewerOverlay", () => {
  it("requires global Edit mode and allows a coarse-pointer editor without leaving the viewer focus boundary", async () => {
    stubCoarsePointer(true);
    const editing: ContextualEditingState = {
      enabled: true, mode: "view", role: "admin", email: "admin@example.com",
      setDirty: vi.fn(), registerDraftGuard: () => () => {},
    };
    const viewer = <ReplicationViewerOverlay collection={collection} initialSlug="work-one" open onOpenChange={vi.fn()} />;
    const { rerender } = render(<ContextualEditingContext.Provider value={editing}>{viewer}</ContextualEditingContext.Provider>);
    expect(screen.queryByRole("button", { name: "Edit replication or collection" })).toBeNull();
    rerender(<ContextualEditingContext.Provider value={{ ...editing, mode: "edit" }}>{viewer}</ContextualEditingContext.Provider>);
    const editButton = await screen.findByRole("button", { name: "Edit replication or collection" });
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValue(Response.json({
      row: { id: "row-one", slug: "work-one", title: "Work one", artist: "Artist", role: "replication", type: "image", effect_slug: null, effect_tags: [], credit_line: null, source_url: null, artist_url: null, url: "https://example.com/work-one.jpg", thumbnail_url: null, format: "jpg", duration: null, file_size: null, created_at: "2026-01-01" },
      revision: "revision-one", effects: [], playlists: [],
      collection: { revision: "null", order: [], editable: false, title: "Gallery" },
    }));
    await userEvent.click(editButton);
    expect(await screen.findByRole("complementary", { name: "Replication and collection editor" })).toBeVisible();
    await userEvent.click(await screen.findByRole("button", { name: "Close editor and keep drafts" }));
    await waitFor(() => expect(editButton).toHaveFocus());
  });

  it("renders a named dialog and walks works without losing source query state", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", {
      name: /Chelsea Morgan.*Work One/,
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const descriptionId = dialog.getAttribute("aria-describedby");
    expect(document.getElementById(descriptionId!)).toHaveTextContent(
      "Viewing Work One by Chelsea Morgan",
    );
    expect(screen.getByTestId("viewer-transport")).toHaveAttribute(
      "data-title",
      "Work One",
    );
    const header = dialog.querySelector("header");
    expect(header).toHaveTextContent("Work 1/2");
    expect(header).toHaveTextContent("Artist 1/2");
    expect(header?.textContent?.match(/Chelsea Morgan/g)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Next: Work Two" }));

    expect(screen.getByTestId("viewer-transport")).toHaveAttribute(
      "data-title",
      "Work Two",
    );
    expect(window.location.search).toContain("type=video");
    expect(window.location.search).toContain("viewer=work-two");
    expect(screen.getByRole("button", { name: "Final work" })).toBeDisabled();
  });

  it("teaches the swipe grammar once per device on coarse pointers", () => {
    stubCoarsePointer(true);
    const first = render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Browse works")).toBeInTheDocument();
    expect(screen.getByText("Switch artists")).toBeInTheDocument();

    first.unmount();
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("Browse works")).not.toBeInTheDocument();
  });

  it("keeps the swipe hint off fine-pointer devices", () => {
    stubCoarsePointer(false);
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("Browse works")).not.toBeInTheDocument();
  });

  it("dismisses the swipe hint on first pointer contact", () => {
    stubCoarsePointer(true);
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Browse works")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("dialog"), {
      pointerId: 1,
      clientX: 240,
      clientY: 300,
    });
    expect(screen.queryByText("Browse works")).not.toBeInTheDocument();
  });

  it("dismisses the swipe hint with its Got it button", () => {
    stubCoarsePointer(true);
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Browse works")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText("Browse works")).not.toBeInTheDocument();
  });

  it("regroups the walk around the active work from the settings menu", async () => {
    const user = userEvent.setup();
    const onRegroup = vi.fn();
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-two"
        open
        onOpenChange={vi.fn()}
        onRegroup={onRegroup}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Viewer settings" }));
    expect(screen.getByRole("menu").closest("header")).not.toBeNull();
    expect(screen.getByText("Shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Hide interface")).toBeInTheDocument();
    // jsdom offers no fullscreen API, so the F shortcut row stands down.
    expect(screen.queryByText("Fullscreen")).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitemradio", { name: "Effect" }));
    expect(onRegroup).toHaveBeenCalledWith("effect", "work-two");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps the active work and navigable neighbors when regrouping creates more groups", () => {
    const regroupedCollection: ReplicationViewerCollection = {
      ...collection,
      label: "Sorted by effect",
      grouping: "effect",
      groups: [
        {
          key: "tracers",
          label: "Tracers",
          items: [collection.groups[0].items[0]],
        },
        {
          key: "drifting",
          label: "Drifting",
          items: [collection.groups[0].items[1]],
        },
        {
          key: "geometry",
          label: "Geometry",
          items: [collection.groups[1].items[0]],
        },
      ],
    };
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next: Work Two" }));

    rerender(
      <ReplicationViewerOverlay
        collection={regroupedCollection}
        initialSlug="work-one"
        open
        onOpenChange={onOpenChange}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: /Chelsea Morgan.*Work Two/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous effect: Tracers" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Next effect: Geometry" }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Next effect: Geometry" }),
    );
    expect(
      screen.getByRole("dialog", { name: /Aria.*Work Three/ }),
    ).toBeInTheDocument();
    expect(window.location.search).toContain("viewer=work-three");

    fireEvent.click(
      screen.getByRole("button", { name: "Previous effect: Drifting" }),
    );
    expect(
      screen.getByRole("dialog", { name: /Chelsea Morgan.*Work Two/ }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Previous effect: Tracers" }),
    );
    expect(
      screen.getByRole("dialog", { name: /Chelsea Morgan.*Work One/ }),
    ).toBeInTheDocument();
    expect(window.location.search).toContain("viewer=work-one");
  });

  it("offers no settings menu without a regroup host", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Viewer settings" }),
    ).not.toBeInTheDocument();
  });

  it("shows the claiming profile's avatar beside the artist identity", () => {
    const avatarCollection: ReplicationViewerCollection = {
      ...collection,
      groups: [
        {
          ...collection.groups[0],
          items: [
            {
              ...collection.groups[0].items[0],
              avatarUrl: "https://cdn.test/chelsea.webp",
            },
            ...collection.groups[0].items.slice(1),
          ],
        },
        ...collection.groups.slice(1),
      ],
    };
    render(
      <ReplicationViewerOverlay
        collection={avatarCollection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    const identity = screen.getByRole("link", { name: "Chelsea Morgan" }).closest("header");
    expect(identity?.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.test/chelsea.webp",
    );
  });

  it("links one artist identity to the artist profile", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "Chelsea Morgan" })).toHaveAttribute(
      "href",
      "/replications/artist/chelsea-morgan",
    );
  });

  it("mounts the thumbnail rail on multi-work groups and lands rail picks", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    const rail = screen.getByRole("navigation", {
      name: "Chelsea Morgan works",
    });
    expect(
      screen.getByRole("button", { name: "Show Work One" }),
    ).toHaveAttribute("aria-current", "true");
    expect(rail).toHaveAttribute("data-chrome-hidden", "false");

    fireEvent.click(screen.getByRole("button", { name: "Show Work Two" }));
    expect(screen.getByTestId("viewer-transport")).toHaveAttribute(
      "data-title",
      "Work Two",
    );
    expect(window.location.search).toContain("viewer=work-two");

    // Aria's single work earns no rail: the strip only exists to browse.
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(
      screen.queryByRole("navigation", { name: "Aria works" }),
    ).not.toBeInTheDocument();
  });

  it("starts swipe gestures on the media track, not the surrounding chrome", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    // A drag across the thumbnail rail lives outside the track's gesture
    // surface and must not walk the collection.
    const railButton = screen.getByRole("button", { name: "Show Work Two" });
    fireEvent.pointerDown(railButton, {
      pointerId: 1,
      clientX: 240,
      clientY: 300,
    });
    fireEvent.pointerMove(railButton, {
      pointerId: 1,
      clientX: 120,
      clientY: 300,
    });
    fireEvent.pointerUp(railButton, {
      pointerId: 1,
      clientX: 120,
      clientY: 300,
    });
    expect(screen.getByTestId("viewer-transport")).toHaveAttribute(
      "data-title",
      "Work One",
    );

    // The still's chrome-toggle surface is the artwork: drags start there.
    const surface = screen.getByRole("button", { name: "Hide controls" });
    fireEvent.pointerDown(surface, {
      pointerId: 2,
      clientX: 240,
      clientY: 300,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 2,
      clientX: 120,
      clientY: 300,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 2,
      clientX: 120,
      clientY: 300,
    });
    expect(screen.getByTestId("viewer-transport")).toHaveAttribute(
      "data-title",
      "Work Two",
    );
    expect(window.location.search).toContain("viewer=work-two");
  });

  it("follows a horizontal drag and snaps back below the commit threshold", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    const surface = screen.getByRole("button", { name: "Hide controls" });
    const floor = document.querySelector(
      "[data-viewer-track-floor]",
    ) as HTMLElement;

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 240,
      clientY: 300,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 224,
      clientY: 300,
    });
    expect(floor.style.transform).toBe("translateX(-16px)");

    fireEvent.pointerUp(surface, {
      pointerId: 1,
      clientX: 224,
      clientY: 300,
    });
    expect(floor.style.transform).toBe("");
    expect(screen.getByTestId("viewer-transport")).toHaveAttribute(
      "data-title",
      "Work One",
    );
  });

  it("resists a drag past the final work instead of moving it fully", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-two"
        open
        onOpenChange={vi.fn()}
      />,
    );

    const track = document.querySelector(
      "[data-replication-media-track]",
    ) as HTMLElement;
    const floor = document.querySelector(
      "[data-viewer-track-floor]",
    ) as HTMLElement;

    fireEvent.pointerDown(track, {
      pointerId: 1,
      clientX: 240,
      clientY: 300,
    });
    fireEvent.pointerMove(track, {
      pointerId: 1,
      clientX: 210,
      clientY: 300,
    });
    expect(floor.style.transform).toBe("translateX(-10px)");
    fireEvent.pointerUp(track, {
      pointerId: 1,
      clientX: 210,
      clientY: 300,
    });
    expect(screen.getByTestId("viewer-transport")).toHaveAttribute(
      "data-title",
      "Work Two",
    );
  });

  it("parks the neighboring work's poster beside the stage for swipe continuity", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-two"
        open
        onOpenChange={vi.fn()}
      />,
    );

    const track = document.querySelector(
      "[data-replication-media-track]",
    ) as HTMLElement;
    // work-one is a still image: its artwork rides the left standby pane, so
    // a committed swipe lands on an already-cached frame.
    expect(
      track.querySelector('img[src="https://cdn.test/one.jpg"]'),
    ).toBeInTheDocument();
  });


  it("contains information-panel focus and restores its trigger", async () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Information" });
    trigger.focus();
    fireEvent.click(trigger);

    const panel = screen.getByRole("dialog", { name: "Information" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", panel.id);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Close information" }),
      ).toHaveFocus(),
    );
    expect(
      screen
        .getByTestId("viewer-transport")
        .closest("[inert]"),
    ).toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Close information" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(
      screen.queryByRole("dialog", { name: "Information" }),
    ).not.toBeInTheDocument();
  });

  it("moves vertically between gallery groups with the arrow keys", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-two"
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "ArrowDown" });

    expect(screen.getByTestId("viewer-transport")).toHaveAttribute(
      "data-title",
      "Work Three",
    );
    expect(screen.getByText("Artist 2/2")).toBeInTheDocument();
    expect(window.location.search).toContain("viewer=work-three");
  });

  it("drives playback with Space, K, and M while Space keeps its meaning on controls", () => {
    transportVerbs.togglePlayback.mockClear();
    transportVerbs.toggleMuted.mockClear();
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-two"
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "k" });
    expect(transportVerbs.togglePlayback).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: " " });
    expect(transportVerbs.togglePlayback).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: "M" });
    expect(transportVerbs.toggleMuted).toHaveBeenCalledTimes(1);

    // Space on a focused control activates the control, never playback.
    const nextButton = screen.getByRole("button", { name: "Final work" });
    nextButton.focus();
    fireEvent.keyDown(nextButton, { key: " " });
    expect(transportVerbs.togglePlayback).toHaveBeenCalledTimes(2);
  });

  it("offers no fullscreen entry when the platform lacks the API", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-two"
        open
        onOpenChange={vi.fn()}
      />,
    );

    // jsdom has no fullscreen API: the button never renders and F is inert.
    expect(
      screen.queryByRole("button", { name: "Fullscreen" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "f" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("enters fullscreen from the F key when the platform supports it", () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-two"
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "f" });
    expect(requestFullscreen).toHaveBeenCalledOnce();
    Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
  });

  it("toggles the chrome from the H key", () => {
    transportVerbs.toggleChrome.mockClear();
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-two"
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "h" });
    expect(transportVerbs.toggleChrome).toHaveBeenCalledTimes(1);
  });

  it("announces work changes to screen readers, skipping the opening work", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    const liveRegion = document.querySelector(
      'p[aria-live="polite"]',
    ) as HTMLElement;
    expect(liveRegion).toHaveTextContent("");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(liveRegion).toHaveTextContent(
      "Work Two, work 2 of 2, Chelsea Morgan",
    );
  });

  it("retains effect context beside the single artist identity", () => {
    const effectCollection: ReplicationViewerCollection = {
      ...collection,
      label: "Sorted by effect",
      grouping: "effect",
      groups: [
        { ...collection.groups[0], key: "tracers", label: "Tracers" },
        { ...collection.groups[1], key: "geometry", label: "Geometry" },
      ],
    };
    render(
      <ReplicationViewerOverlay
        collection={effectCollection}
        initialSlug="work-three"
        open
        onOpenChange={vi.fn()}
      />,
    );

    const header = screen
      .getByRole("dialog", { name: /Aria.*Work Three/ })
      .querySelector("header");
    expect(header).toHaveTextContent("Geometry");
    expect(header).toHaveTextContent("Effect 2/2");
    expect(screen.getByText("Aria")).toBeInTheDocument();
  });
  it("moves between Gallery groups with visible pointer controls", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-two"
        open
        onOpenChange={vi.fn()}
      />,
    );

    // Touch readers get the same chevrons: no coarse-pointer gating.
    expect(
      screen.getByRole("button", { name: "Next artist: Aria" }).parentElement
        ?.className,
    ).not.toContain("pointer:coarse");
    fireEvent.click(screen.getByRole("button", { name: "Next artist: Aria" }));
    expect(screen.getByTestId("viewer-transport")).toHaveAttribute(
      "data-title",
      "Work Three",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Previous artist: Chelsea Morgan" }),
    );
    expect(screen.getByTestId("viewer-transport")).toHaveAttribute(
      "data-title",
      "Work Two",
    );
  });
  it("exits fullscreen before Escape dismisses the viewer", () => {
    const onOpenChange = vi.fn();
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: document.body,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });

    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("dialog", { name: /Chelsea Morgan.*Work One/ }),
      { key: "Escape" },
    );

    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
  });

  it("shows a visible notice chip when the platform refuses fullscreen", async () => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("denied")),
    });
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));

    const chip = await screen.findByRole("status");
    expect(chip).toHaveTextContent("Fullscreen is unavailable.");
    // The refusal is shown, not whispered: the chip is a visible pill.
    expect(chip).not.toHaveClass("sr-only");
    // The entry stays honest: the button keeps offering fullscreen.
    expect(
      screen.getByRole("button", { name: "Fullscreen" }),
    ).toBeInTheDocument();
    Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
  });

  it("pauses source-page video while open and resumes it after close", async () => {
    const sourceVideo = document.createElement("video");
    const pause = vi.fn();
    const play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperties(sourceVideo, {
      paused: { configurable: true, get: () => false },
      pause: { configurable: true, value: pause },
      play: { configurable: true, value: play },
    });
    document.body.append(sourceVideo);

    const { rerender } = render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(pause).toHaveBeenCalledOnce());
    sourceVideo.dispatchEvent(new Event("play"));
    expect(pause).toHaveBeenCalledTimes(2);

    rerender(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open={false}
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(play).toHaveBeenCalledOnce());
    sourceVideo.remove();
  });

  it("focuses the source collection heading after closing a direct arrival", async () => {
    const view = (open: boolean) => (
      <>
        <main>
          <h1>Substance article</h1>
          <h3 data-replication-collection-heading>Substance replications</h3>
        </main>
        <ReplicationViewerOverlay
          collection={collection}
          initialSlug="work-one"
          open={open}
          onOpenChange={vi.fn()}
        />
      </>
    );
    const { rerender } = render(view(true));
    await screen.findByRole("dialog", { name: /Chelsea Morgan.*Work One/ });

    rerender(view(false));

    await waitFor(
      () =>
        expect(
          screen.getByRole("heading", {
            level: 3,
            name: "Substance replications",
          }),
        ).toHaveFocus(),
      { timeout: 500 },
    );
  });

  it("loads rights metadata only when the reader opens information", async () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Information" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/replications/work-one",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(await screen.findByText("CC BY 4.0")).toBeInTheDocument();
    expect(screen.getByText("2020")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tracers" })).toHaveAttribute(
      "href",
      "/effects/tracers",
    );
    expect(screen.getByText("permission granted")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/",
    );
    expect(
      screen.getByRole("link", { name: "Original source" }),
    ).toHaveAttribute("href", "https://artist.test/work-one");
    expect(
      screen.getByRole("link", { name: "Open full details" }),
    ).toHaveAttribute("href", "/replications/work-one");
  });

  it("stores an unmute so the whole session keeps sound on", async () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    // The reels default: a fresh session opens muted.
    fireEvent.click(await screen.findByRole("button", { name: "Unmute" }));

    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
    expect(window.sessionStorage.getItem("replication-viewer-sound")).toBe(
      "on",
    );
  });

  it("reopens with sound on when this session already chose it", async () => {
    window.sessionStorage.setItem("replication-viewer-sound", "on");

    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Mute" }),
    ).toBeInTheDocument();
  });

  it("stores rotate mode and keeps it sticky while swiping across works", async () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Rotate to fill screen" }),
    );

    expect(
      screen.getByRole("button", { name: "Rotate back upright" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(window.sessionStorage.getItem("replication-viewer-rotate")).toBe(
      "on",
    );

    // Advancing to the next work never resets the reader's mode.
    fireEvent.click(screen.getByRole("button", { name: "Next: Work Two" }));
    expect(screen.getByTestId("viewer-transport")).toHaveAttribute(
      "data-title",
      "Work Two",
    );
    expect(
      screen.getByRole("button", { name: "Rotate back upright" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("reopens with rotate mode on when this session already chose it", async () => {
    window.sessionStorage.setItem("replication-viewer-rotate", "on");

    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Rotate back upright" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

});
