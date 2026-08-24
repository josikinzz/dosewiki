import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

vi.mock("./ReplicationMediaStage", () => ({
  ReplicationMediaStage: ({
    item,
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

describe("ReplicationViewerOverlay", () => {
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

  it("links the header artist name to the artist page", () => {
    render(
      <ReplicationViewerOverlay
        collection={collection}
        initialSlug="work-one"
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Chelsea Morgan" }),
    ).toHaveAttribute("href", "/replications/artist/chelsea-morgan");
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
    const pane = screen.getByTestId("media-stage").parentElement as HTMLElement;

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
    const pane = stage.parentElement as HTMLElement;

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
    expect(screen.getAllByText("Aria")).toHaveLength(1);
    expect(screen.getByText("Artist 2/2")).toBeInTheDocument();
    expect(window.location.search).toContain("viewer=work-three");
  });

  it("keeps the active effect group visibly named", () => {
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
});
