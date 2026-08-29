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
import { EDITOR_HINT_STORAGE_KEY } from "@/lib/auth/editorHint";

vi.mock("./ReplicationMediaStage", () => ({
  ReplicationMediaStage: ({
    item,
    muted,
    onMutedChange,
    rotateMode,
    onRotateModeChange,
    onRotatedChange,
    onPrevious,
    onNext,
    onInfo,
    infoOpen,
    infoControls,
    onFullscreen,
    fullscreenLabel,
    previousLabel,
    nextLabel,
  }: {
    item: { replication: { title: string; type: "image" | "video" } };
    muted: boolean;
    onMutedChange: (muted: boolean) => void;
    rotateMode?: boolean;
    onRotateModeChange?: (rotateMode: boolean) => void;
    onRotatedChange?: (rotated: boolean) => void;
    onPrevious?: () => void;
    onNext?: () => void;
    onInfo?: () => void;
    infoOpen?: boolean;
    infoControls?: string;
    onFullscreen?: () => void;
    fullscreenLabel: string;
    previousLabel: string;
    nextLabel: string;
  }) => (
    <div
      data-testid="media-stage"
      data-replication-media-stage
      data-title={item.replication.title}
    >
      {item.replication.type === "video" ? (
        <video>
          <track
            kind="captions"
            src="data:text/vtt,WEBVTT"
            srcLang="en"
            label="English"
          />
        </video>
      ) : (
        <button
          type="button"
          data-replication-media-surface
          aria-label="Still media surface"
        />
      )}
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
      <button type="button" onClick={() => onRotatedChange?.(true)}>
        Report rotated
      </button>
      <button type="button" onClick={onFullscreen}>
        {fullscreenLabel}
      </button>
    </div>
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
  it("reveals the carousel editor only after a fresh editor hint on a fine-pointer client", async () => {
    const editable: ReplicationViewerCollection = {
      ...collection,
      kind: "effect",
      grouping: "none",
      groups: [collection.groups[0]],
      editorTarget: {
        kind: "effect",
        key: "tracers",
        label: "Tracers replications",
      },
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("pointer: fine"),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })),
    );

    const { rerender } = render(
      <ReplicationViewerOverlay
        collection={editable}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Edit carousel" })).toBeNull();

    window.localStorage.setItem(EDITOR_HINT_STORAGE_KEY, String(Date.now()));
    window.dispatchEvent(new StorageEvent("storage"));
    rerender(
      <ReplicationViewerOverlay
        collection={editable}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    const editButton = await screen.findByRole("button", {
      name: "Edit carousel",
    });
    expect(editButton).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const payload = url.endsWith("/playlists")
        ? { ok: true, playlists: [] }
        : url.endsWith("/substances")
          ? { ok: true, substances: [] }
          : { ok: true, associations: [] };
      return { ok: true, json: async () => payload } as Response;
    });

    await userEvent.click(editButton);
    const closeEditor = await screen.findByRole("button", {
      name: "Close carousel editor",
    });
    expect(
      screen.getByRole("complementary", { name: "Carousel editor" }),
    ).toBeVisible();
    await userEvent.click(closeEditor);
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
    expect(dialog).toHaveClass("grid-rows-[auto_minmax(0,1fr)]");
    expect(screen.getByTestId("media-stage")).toHaveAttribute(
      "data-title",
      "Work One",
    );
    expect(
      screen.getByRole("heading", { name: /Chelsea Morgan.*Work One/ }),
    ).toHaveClass("theme-media-tile-title");
    expect(
      screen
        .getByTestId("media-stage")
        .closest(".grid-rows-\\[minmax\\(0\\,1fr\\)_auto\\]"),
    ).toHaveClass(
      "min-w-0",
      "w-full",
      "grid-cols-[minmax(0,1fr)]",
      "overflow-hidden",
    );
    const header = dialog.querySelector("header");
    expect(header).toHaveTextContent("Work 1/2");
    expect(header).toHaveTextContent("Artist 1/2");
    expect(header?.textContent?.match(/Chelsea Morgan/g)).toHaveLength(1);
    expect(header).toHaveTextContent("Sorted by artist");

    fireEvent.click(screen.getByRole("button", { name: "Next: Work Two" }));

    expect(screen.getByTestId("media-stage")).toHaveAttribute(
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

  it("dismisses the swipe hint on first touch", () => {
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
    fireEvent.touchStart(screen.getByTestId("media-stage"), {
      changedTouches: [{ clientX: 240, clientY: 300 }],
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
    await user.click(screen.getByRole("menuitemradio", { name: "Effect" }));
    expect(onRegroup).toHaveBeenCalledWith("effect", "work-two");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
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

  it("shows the claiming profile's avatar on the byline chip", () => {
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

    const chip = screen.getAllByRole("link", { name: "Chelsea Morgan" })[1];
    expect(chip.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.test/chelsea.webp",
    );
  });

  it("links the artist name in the header and the stage byline chip", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    const links = screen.getAllByRole("link", { name: "Chelsea Morgan" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute(
        "href",
        "/replications/artist/chelsea-morgan",
      );
    }
  });

  it("does not load a raw GIF into the thumbnail rail", () => {
    const gifCollection: ReplicationViewerCollection = {
      ...collection,
      groups: [
        {
          ...collection.groups[0],
          items: [
            {
              ...collection.groups[0].items[0],
              replication: {
                ...collection.groups[0].items[0].replication,
                format: "gif",
                url: "https://cdn.test/original.gif",
                thumbnail_url: "https://cdn.test/legacy-thumb.webp",
                motion_url: "https://cdn.test/orphaned-motion.mp4",
                motion_poster_url: undefined,
              },
            },
            collection.groups[0].items[1],
          ],
        },
      ],
    };

    render(
      <ReplicationViewerOverlay
        collection={gifCollection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Show Work One" })
        .querySelector("img"),
    ).not.toBeInTheDocument();
  });

  it("scopes swipe navigation to the media stage", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    const railButton = screen.getByRole("button", { name: "Show Work Two" });
    fireEvent.touchStart(railButton, {
      changedTouches: [{ clientX: 240, clientY: 300 }],
    });
    fireEvent.touchEnd(railButton, {
      changedTouches: [{ clientX: 120, clientY: 300 }],
    });
    expect(screen.getByTestId("media-stage")).toHaveAttribute(
      "data-title",
      "Work One",
    );

    const stage = screen.getByRole("button", { name: "Still media surface" });
    fireEvent.touchStart(stage, {
      changedTouches: [{ clientX: 240, clientY: 300 }],
    });
    fireEvent.touchEnd(stage, {
      changedTouches: [{ clientX: 120, clientY: 300 }],
    });
    expect(screen.getByTestId("media-stage")).toHaveAttribute(
      "data-title",
      "Work Two",
    );
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

    const stage = screen.getByRole("button", { name: "Still media surface" });
    const pane = document.querySelector(
      "[data-replication-media-track]",
    ) as HTMLElement;

    fireEvent.touchStart(stage, {
      changedTouches: [{ clientX: 240, clientY: 300 }],
    });
    fireEvent.touchMove(stage, {
      changedTouches: [{ clientX: 224, clientY: 300 }],
    });
    expect(pane.style.transform).toBe("translateX(-16px)");

    fireEvent.touchEnd(stage, {
      changedTouches: [{ clientX: 224, clientY: 300 }],
    });
    expect(pane.style.transform).toBe("");
    expect(screen.getByTestId("media-stage")).toHaveAttribute(
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

    const stage = screen.getByTestId("media-stage");
    const pane = document.querySelector(
      "[data-replication-media-track]",
    ) as HTMLElement;

    fireEvent.touchStart(stage, {
      changedTouches: [{ clientX: 240, clientY: 300 }],
    });
    fireEvent.touchMove(stage, {
      changedTouches: [{ clientX: 210, clientY: 300 }],
    });
    expect(pane.style.transform).toBe("translateX(-10px)");
    fireEvent.touchEnd(stage, {
      changedTouches: [{ clientX: 210, clientY: 300 }],
    });
    expect(screen.getByTestId("media-stage")).toHaveAttribute(
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

  it("preloads a parked video neighbor so landing finds its first frame decodable", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    const track = document.querySelector(
      "[data-replication-media-track]",
    ) as HTMLElement;
    // work-two, the only adjacent work, warms only its metadata. Fetching the
    // full file here duplicates the active element's range transfer after a
    // turn and multiplies bandwidth across a long browsing session.
    const preloader = track.querySelector(
      'video[src="https://cdn.test/two.mp4"]',
    );
    expect(preloader).toHaveAttribute("preload", "metadata");
    // Preloading is capped at the parked neighbors — nothing else fetches.
    expect(track.querySelectorAll("video[preload]")).toHaveLength(1);
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
        .getByTestId("media-stage")
        .closest(".grid-rows-\\[minmax\\(0\\,1fr\\)_auto\\]"),
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

    expect(screen.getByTestId("media-stage")).toHaveAttribute(
      "data-title",
      "Work Three",
    );
    // Header credit plus the stage byline chip both name the artist.
    expect(screen.getAllByText("Aria")).toHaveLength(2);
    expect(screen.getByText("Artist 2/2")).toBeInTheDocument();
    expect(window.location.search).toContain("viewer=work-three");
  });

  it("leads the header with the effect name and keeps the artist on the byline chip", () => {
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
      .getByRole("dialog", { name: /Geometry.*Work Three/ })
      .querySelector("header");
    expect(header).toHaveTextContent("Geometry");
    expect(header).toHaveTextContent("Effect 2/2");
    expect(header).not.toHaveTextContent("Aria");
    // The artist never leaves the stage: the byline chip carries the credit.
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

    fireEvent.click(screen.getByRole("button", { name: "Next artist: Aria" }));
    expect(screen.getByTestId("media-stage")).toHaveAttribute(
      "data-title",
      "Work Three",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Previous artist: Chelsea Morgan" }),
    );
    expect(screen.getByTestId("media-stage")).toHaveAttribute(
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

  it("relabels a rejected fullscreen action as immersive view", async () => {
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

    expect(
      await screen.findByRole("button", { name: "Immersive view" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Fullscreen is unavailable",
    );
    Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
  });

  it("uses platform video fullscreen when the document API is unavailable", () => {
    const webkitEnterFullscreen = vi.fn();
    Object.defineProperty(HTMLVideoElement.prototype, "webkitEnterFullscreen", {
      configurable: true,
      value: webkitEnterFullscreen,
    });
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-two"
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));

    expect(webkitEnterFullscreen).toHaveBeenCalledOnce();
    Reflect.deleteProperty(HTMLVideoElement.prototype, "webkitEnterFullscreen");
  });

  it("keeps platform fullscreen available after still-image immersive mode", () => {
    const webkitEnterFullscreen = vi.fn();
    Object.defineProperty(HTMLVideoElement.prototype, "webkitEnterFullscreen", {
      configurable: true,
      value: webkitEnterFullscreen,
    });
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Immersive view" }));
    fireEvent.click(screen.getByRole("button", { name: "Next: Work Two" }));
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));

    expect(webkitEnterFullscreen).toHaveBeenCalledOnce();
    Reflect.deleteProperty(HTMLVideoElement.prototype, "webkitEnterFullscreen");
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
    expect(screen.getByTestId("media-stage")).toHaveAttribute(
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

  it("leans settings and thumbnail icons while the stage reports a rotated work", async () => {
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
    const wrappers = rail.querySelectorAll("[data-rotating-icon]");
    expect(wrappers.length).toBeGreaterThan(0);
    wrappers.forEach((wrapper) =>
      expect(wrapper.className).not.toContain("rotate-90"),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Report rotated" }),
    );
    rail
      .querySelectorAll("[data-rotating-icon]")
      .forEach((wrapper) => expect(wrapper.className).toContain("rotate-90"));
  });

  it("leans the byline avatar while the stage reports a rotated work", async () => {
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

    const chip = screen.getAllByRole("link", { name: "Chelsea Morgan" })[1];
    const avatarWrapper = chip.querySelector("[data-rotating-icon]");
    expect(avatarWrapper).not.toBeNull();
    expect(avatarWrapper?.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.test/chelsea.webp",
    );
    expect(avatarWrapper?.className).not.toContain("rotate-90");

    fireEvent.click(
      await screen.findByRole("button", { name: "Report rotated" }),
    );
    expect(avatarWrapper?.className).toContain("rotate-90");
  });
});
