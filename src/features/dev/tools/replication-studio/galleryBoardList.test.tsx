import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
    provenance: { matchedVia: "effect_slug", effectSlug: "geometry", effectName: "Geometry" },
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
    onDragEnd: vi.fn(),
    focusSlug: null,
    onFocusHandled: vi.fn(),
    ...overrides,
  };
  return { ...render(<GalleryBoardList {...props} />), props };
}

const articleBand = () => screen.getByRole("region", { name: /on the article/i });
const poolBand = () => screen.getByRole("region", { name: /candidate pool/i });

/** The position badge of a named row, or null when the row carries none. */
function positionOf(title: string) {
  const row = screen.getByText(title).closest("li") as HTMLElement;
  return within(row).queryByTestId("board-position")?.textContent ?? null;
}

describe("GalleryBoardList", () => {
  it("numbers the curated list from 1 and leaves the candidate pool unnumbered", () => {
    renderBoard(5, { curated: ["work-4", "work-2"], removed: [] });

    expect(within(articleBand()).getByText("Work 4")).toBeInTheDocument();
    expect(positionOf("Work 4")).toBe("1");
    expect(positionOf("Work 2")).toBe("2");

    const pool = poolBand();
    for (const title of ["Work 1", "Work 3", "Work 5"]) {
      expect(within(pool).getByText(title)).toBeInTheDocument();
    }
    // A work that is not published has no position, so it is shown without one.
    expect(within(pool).queryAllByTestId("board-position")).toHaveLength(0);
  });

  it("offers no drag handle on candidate rows — there is no pool order to change", () => {
    renderBoard(4, { curated: ["work-1"], removed: [] });

    expect(within(articleBand()).getByRole("button", { name: "Drag Work 1 to reorder it" })).toBeInTheDocument();
    expect(within(poolBand()).queryAllByRole("button", { name: /^Drag / })).toHaveLength(0);
  });

  it("says the article shows nothing while nothing is curated", () => {
    renderBoard(3, { curated: [], removed: [] });

    expect(
      screen.getByText(/nothing is curated, so this article shows no replication showcase at all/i),
    ).toBeInTheDocument();
    // Every slot is empty, because the pool below publishes nothing.
    expect(screen.getByText(/12 of the article's 12 slots are empty — 0 filled/i)).toBeInTheDocument();
    expect(screen.getAllByText(/empty slot/i)).toHaveLength(12);
    expect(within(poolBand()).queryAllByTestId("board-position")).toHaveLength(0);
  });

  it("labels the pool as off-article and counts only uncurated matches", () => {
    renderBoard(5, { curated: ["work-1"], removed: ["work-2"] });

    expect(screen.getByRole("heading", { name: /candidate pool \(3\)/i })).toBeInTheDocument();
    expect(screen.getByText(/none of these are on the article/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /on the article \(1\)/i })).toBeInTheDocument();
  });

  it("draws no fold while the curated list is inside the cap, however many candidates there are", () => {
    renderBoard(20, { curated: ["work-1"], removed: [] });

    expect(screen.queryByText(/the article stops here/i)).not.toBeInTheDocument();
    expect(screen.getByText(/11 of the article's 12 slots are empty — 1 filled/i)).toBeInTheDocument();
  });

  it("draws the fold inside the curated list when it overruns the cap and dims what falls below", () => {
    const curated = Array.from({ length: 14 }, (_, index) => `work-${index + 1}`);
    renderBoard(14, { curated, removed: [] });

    const band = articleBand();
    const fold = within(band).getByText(/the article stops here — positions 13\+ reach \/replications only/i);
    const items = within(band).getAllByRole("listitem");
    const foldIndex = items.findIndex((item) => item.contains(fold));

    expect(items[foldIndex - 1]).toHaveTextContent("Work 12");
    expect(items[foldIndex + 1]).toHaveTextContent("Work 13");
    expect(screen.getByText("Work 12").closest("li")?.innerHTML).not.toContain("opacity-55");
    expect(screen.getByText("Work 13").closest("li")?.innerHTML).toContain("opacity-55");
    expect(screen.getByText(/every match is curated or excluded/i)).toBeInTheDocument();
  });

  it("renders ghost slots numbered after the last curated row", () => {
    renderBoard(6, { curated: ["work-3", "work-5"], removed: [] });

    expect(screen.getByText(/10 of the article's 12 slots are empty — 2 filled/i)).toBeInTheDocument();

    const ghosts = screen.getAllByText(/empty slot/i);
    expect(ghosts).toHaveLength(10);
    expect(within(ghosts[0].closest("li") as HTMLElement).getByTestId("board-position")).toHaveTextContent("3");
    expect(within(ghosts[9].closest("li") as HTMLElement).getByTestId("board-position")).toHaveTextContent("12");
  });

  it("labels the un-curate drop zone and promotes a candidate with its Curate button", async () => {
    const user = userEvent.setup();
    const { props } = renderBoard(3, { curated: [], removed: [] });

    expect(
      screen.getByRole("group", { name: /drop a curated row here to take it off the article/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Curate Work 2" }));
    expect(props.onCurate).toHaveBeenCalledWith("work-2");
  });

  it("offers reorder, move-to-top and un-curate on curated rows only", async () => {
    const user = userEvent.setup();
    const { props } = renderBoard(3, { curated: ["work-1", "work-3"], removed: [] });

    expect(screen.getByRole("button", { name: "Move Work 1 up" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move Work 1 down" }));
    expect(props.onMove).toHaveBeenCalledWith("work-1", "down");

    await user.click(screen.getByRole("button", { name: "Move Work 3 to position 1" }));
    expect(props.onMoveToEdge).toHaveBeenCalledWith("work-3", "top");

    await user.click(screen.getByRole("button", { name: "Un-curate Work 3" }));
    expect(props.onUncurate).toHaveBeenCalledWith("work-3");

    expect(screen.queryByRole("button", { name: "Move Work 2 up" })).not.toBeInTheDocument();
    // Exclusion stays reachable from the pool.
    await user.click(screen.getByRole("button", { name: "Exclude Work 2 from this gallery" }));
    expect(props.onExclude).toHaveBeenCalledWith("work-2");
  });

  it("moves focus onto the row that just changed band, then reports it handled", () => {
    const onFocusHandled = vi.fn();
    renderBoard(3, { curated: [], removed: [] }, { focusSlug: "work-2", onFocusHandled });

    expect(screen.getByRole("button", { name: "Curate Work 2" })).toHaveFocus();
    expect(onFocusHandled).toHaveBeenCalled();
  });
});
