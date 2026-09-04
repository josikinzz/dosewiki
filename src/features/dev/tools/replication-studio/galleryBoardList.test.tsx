import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DESKTOP_ONLY_NOTICE } from "@/features/dev/components";

import { GalleryBoardList } from "./GalleryBoardList";
import {
  buildGalleryBoard,
  type GalleryCurationState,
  type GalleryMatch,
} from "./substanceGalleryPortalModel";

const CAP = 12;

function match(index: number): GalleryMatch {
  return {
    replication: {
      id: `id-${index}`,
      slug: `work-${index}`,
      title: `Work ${index}`,
      artist: "Hypnagogist",
      type: "image",
      effect_slug: "geometry",
      effect_name: "Geometry",
      effect_tags: [],
      credit_line: null,
      rights_status: index === 1 ? "unknown" : "creator-retained",
      url: null,
      thumbnail_url: null,
      format: "png",
    },
    provenance: {
      matchedVia: "specific_drug",
      effectSlug: "geometry",
      effectName: "Geometry",
      substanceSlug: "lsd",
    },
  };
}

function board(count: number, curation: GalleryCurationState) {
  return buildGalleryBoard(
    Array.from({ length: count }, (_, index) => match(index + 1)),
    curation,
    CAP,
  );
}

function renderBoard(count: number, curation: GalleryCurationState, overrides: Partial<Parameters<typeof GalleryBoardList>[0]> = {}) {
  const props = {
    board: board(count, curation),
    onMove: vi.fn(),
    onMoveToEdge: vi.fn(),
    onCurate: vi.fn(),
    onUncurate: vi.fn(),
    onExclude: vi.fn(),
    onExcludeEverywhere: vi.fn(),
    onDragEnd: vi.fn(),
    focusSlug: null,
    onFocusHandled: vi.fn(),
    ...overrides,
  };
  return { ...render(<GalleryBoardList {...props} />), props };
}

const priorityBand = () => screen.getByRole("region", { name: /priority overrides/i });
const automaticBand = () => screen.getByRole("region", { name: /automatic placements/i });

/** The effective article position badge of a named row. */
function positionOf(title: string) {
  const row = screen.getByText(title).closest("li") as HTMLElement;
  return within(row).getByTestId("board-position").textContent;
}

describe("GalleryBoardList", () => {
  it("numbers priority and automatic rows by effective article order", () => {
    renderBoard(5, { curated: ["work-4", "work-2"], removed: [] });

    expect(within(priorityBand()).getByText("Work 4")).toBeInTheDocument();
    expect(positionOf("Work 4")).toBe("1");
    expect(positionOf("Work 2")).toBe("2");

    const automatic = automaticBand();
    for (const title of ["Work 1", "Work 3", "Work 5"]) {
      expect(within(automatic).getByText(title)).toBeInTheDocument();
    }
    expect(within(automatic).getAllByTestId("board-position").map((node) => node.textContent)).toEqual([
      "3", "4", "5",
    ]);
  });

  it("offers drag handles only for stored priority rows", () => {
    renderBoard(4, { curated: ["work-1"], removed: [] });

    expect(within(priorityBand()).getByRole("button", { name: "Drag Work 1 to reorder its priority" })).toBeInTheDocument();
    expect(within(automaticBand()).queryAllByRole("button", { name: /^Drag / })).toHaveLength(0);
  });

  it("states that automatic placements publish without stored priority", () => {
    renderBoard(3, { curated: [], removed: [] });

    expect(
      screen.getByText(/no stored priority overrides.*still publishes every automatic placement/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/9 of the article's 12 slots are empty, 3 filled/i)).toBeInTheDocument();
    expect(screen.getAllByText(/empty slot/i)).toHaveLength(9);
    expect(within(automaticBand()).getAllByTestId("board-position")).toHaveLength(3);
  });

  it("labels automatic placements and counts exclusions separately", () => {
    renderBoard(5, { curated: ["work-1"], removed: ["work-2"] });

    expect(screen.getByRole("heading", { name: /automatic placements \(3\)/i })).toBeInTheDocument();
    expect(screen.getByText(/already on the article in policy order/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /priority overrides \(1\)/i })).toBeInTheDocument();
  });

  it("draws the fold in automatic placements when the effective order exceeds the cap", () => {
    renderBoard(20, { curated: ["work-1"], removed: [] });

    expect(screen.getByText(/the article stops here: positions 13\+ reach \/replications only/i)).toBeInTheDocument();
    expect(screen.queryByText(/article slots are empty/i)).not.toBeInTheDocument();
  });

  it("draws the fold inside the curated list when it overruns the cap and dims what falls below", () => {
    const curated = Array.from({ length: 14 }, (_, index) => `work-${index + 1}`);
    renderBoard(14, { curated, removed: [] });

    const band = priorityBand();
    const fold = within(band).getByText(/the article stops here: positions 13\+ reach \/replications only/i);
    const items = within(band).getAllByRole("listitem");
    const foldIndex = items.findIndex((item) => item.contains(fold));

    expect(items[foldIndex - 1]).toHaveTextContent("Work 12");
    expect(items[foldIndex + 1]).toHaveTextContent("Work 13");
    expect(screen.getByText("Work 12").closest("li")?.innerHTML).not.toContain("opacity-55");
    expect(screen.getByText("Work 13").closest("li")?.innerHTML).toContain("opacity-55");
    expect(screen.getByText(/every published row has stored priority or is excluded/i)).toBeInTheDocument();
  });

  it("renders ghost slots after every effective placement", () => {
    renderBoard(6, { curated: ["work-3", "work-5"], removed: [] });

    expect(screen.getByText(/6 of the article's 12 slots are empty, 6 filled/i)).toBeInTheDocument();

    const ghosts = screen.getAllByText(/empty slot/i);
    expect(ghosts).toHaveLength(6);
    expect(within(ghosts[0].closest("li") as HTMLElement).getByTestId("board-position")).toHaveTextContent("7");
    expect(within(ghosts[5].closest("li") as HTMLElement).getByTestId("board-position")).toHaveTextContent("12");
  });

  it("labels the remove-priority drop zone and prioritizes an automatic row", async () => {
    const user = userEvent.setup();
    const { props } = renderBoard(3, { curated: [], removed: [] });

    expect(
      screen.getByRole("group", { name: /drop a priority row here to restore automatic ordering/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Prioritize Work 2" }));
    expect(props.onCurate).toHaveBeenCalledWith("work-2");
  });

  it("offers reorder and remove-priority controls only on priority rows", async () => {
    const user = userEvent.setup();
    const { props } = renderBoard(3, { curated: ["work-1", "work-3"], removed: [] });

    expect(screen.getByRole("button", { name: "Move Work 1 up in priority" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move Work 1 down in priority" }));
    expect(props.onMove).toHaveBeenCalledWith("work-1", "down");

    await user.click(screen.getByRole("button", { name: "Move Work 3 to first priority" }));
    expect(props.onMoveToEdge).toHaveBeenCalledWith("work-3", "top");

    await user.click(screen.getByRole("button", { name: "Remove priority from Work 3" }));
    expect(props.onUncurate).toHaveBeenCalledWith("work-3");

    expect(screen.queryByRole("button", { name: "Move Work 2 up in priority" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Exclude Work 2 from this gallery" }));
    expect(props.onExclude).toHaveBeenCalledWith("work-2");
  });

  it("moves focus onto the automatic row that just changed band, then reports it handled", () => {
    const onFocusHandled = vi.fn();
    renderBoard(3, { curated: [], removed: [] }, { focusSlug: "work-2", onFocusHandled });

    expect(screen.getByRole("button", { name: "Prioritize Work 2" })).toHaveFocus();
    expect(onFocusHandled).toHaveBeenCalled();
  });

  describe("under a coarse pointer", () => {
    const originalMatchMedia = window.matchMedia;

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    function mockPointer(coarse: boolean) {
      window.matchMedia = vi.fn((media: string) => ({
        matches: media === "(pointer: coarse)" ? coarse : false,
        media,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia;
    }

    it("shows the desktop notice and renders the board read-only", () => {
      mockPointer(true);
      renderBoard(3, { curated: ["work-1"], removed: [] });

      expect(screen.getByRole("note")).toHaveTextContent(DESKTOP_ONLY_NOTICE);
      expect(screen.getByText("Work 1")).toBeInTheDocument();
      expect(screen.getByText("Work 2")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Drag / })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /in priority$/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Prioritize / })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Exclude / })).not.toBeInTheDocument();
      expect(screen.queryByRole("group", { name: /drop a priority row here/i })).not.toBeInTheDocument();
    });

    it("keeps every curation control under a fine pointer", () => {
      mockPointer(false);
      renderBoard(3, { curated: ["work-1"], removed: [] });

      expect(screen.queryByRole("note")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Drag Work 1 to reorder its priority" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Prioritize Work 2" })).toBeInTheDocument();
    });
  });
});
