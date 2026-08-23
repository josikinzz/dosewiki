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
    onFullscreen,
    previousLabel,
    nextLabel,
  }: {
    item: { replication: { title: string } };
    onPrevious?: () => void;
    onNext?: () => void;
    onInfo?: () => void;
    onFullscreen?: () => void;
    previousLabel: string;
    nextLabel: string;
  }) => (
    <div data-testid="media-stage" data-title={item.replication.title}>
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
      <button type="button" onClick={onInfo}>
        Information
      </button>
      <button type="button" onClick={onFullscreen}>
        Fullscreen
      </button>
    </div>
  ),
}));

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src }: { src: string }) => <img src={src} alt="" />,
}));

const collection: ReplicationViewerCollection = {
  sourcePath: "/replications",
  label: "Replications by artist",
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
          artistProfileHref: null,
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
          artistProfileHref: null,
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
          rights: { license_name: "CC BY 4.0", rightsholder: "Chelsea Morgan" },
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
      name: /Work One.*Chelsea Morgan/,
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveClass("grid-rows-[auto_minmax(0,1fr)]");
    expect(screen.getByTestId("media-stage")).toHaveAttribute(
      "data-title",
      "Work One",
    );
    expect(
      screen.getByRole("heading", { name: /Work One.*Chelsea Morgan/ }),
    ).toHaveClass("theme-media-tile-title");
    expect(screen.getByTestId("media-stage").parentElement).toHaveClass(
      "min-w-0",
      "w-full",
      "grid-cols-[minmax(0,1fr)]",
      "overflow-hidden",
    );
    const header = dialog.querySelector("header");
    expect(header).toHaveTextContent("Work 1/2");
    expect(header).toHaveTextContent("Artist 1/2");
    expect(header?.textContent?.match(/Chelsea Morgan/g)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Next: Work Two" }));

    expect(screen.getByTestId("media-stage")).toHaveAttribute(
      "data-title",
      "Work Two",
    );
    expect(window.location.search).toContain("type=video");
    expect(window.location.search).toContain("viewer=work-two");
    expect(screen.getByRole("button", { name: "Final work" })).toBeDisabled();
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
      screen.getByRole("dialog", { name: /Work One.*Chelsea Morgan/ }),
      { key: "Escape" },
    );

    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
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
          <h1>Replications</h1>
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

    rerender(view(false));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Replications" }),
      ).toHaveFocus(),
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
    expect(
      screen.getByRole("link", { name: "Open full details" }),
    ).toHaveAttribute("href", "/replications/work-one");
  });
});
