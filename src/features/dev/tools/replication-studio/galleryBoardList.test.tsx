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

describe("GalleryBoardList", () => {
  it("numbers positions continuously across the curated head and the default tail", () => {
    renderBoard(5, { curated: ["work-4", "work-2"], removed: [] });

    const curatedBand = screen.getByRole("region", { name: /curated head/i });
    const autoBand = screen.getByRole("region", { name: /default order/i });

    // The head keeps stored order at 1..2; the tail resumes at 3 in corpus order.
    expect(within(curatedBand).getByText("Work 4").closest("li")).toHaveTextContent("1");
    expect(within(curatedBand).getByText("Work 2").closest("li")).toHaveTextContent("2");
    expect(within(autoBand).getByText("Work 1").closest("li")).toHaveTextContent("3");
    expect(within(autoBand).getByText("Work 5").closest("li")).toHaveTextContent("5");
  });

  it("draws the fold after the cap in the default tail and dims what falls below it", () => {
    renderBoard(14, { curated: [], removed: [] });

    const fold = screen.getByText(/the article stops here — positions 13\+ reach \/replications only/i);
    const autoBand = screen.getByRole("region", { name: /default order/i });
    const items = within(autoBand).getAllByRole("listitem");
    const foldIndex = items.findIndex((item) => item.contains(fold));

    // Position 12 sits immediately above the cut; 13 immediately below it.
    expect(items[foldIndex - 1]).toHaveTextContent("Work 12");
    expect(items[foldIndex + 1]).toHaveTextContent("Work 13");
    expect(screen.getByText("Work 12").closest("li")?.innerHTML).not.toContain("opacity-55");
    expect(screen.getByText("Work 13").closest("li")?.innerHTML).toContain("opacity-55");
  });

  it("draws the fold inside the curated head when the head overflows the cap", () => {
    const curated = Array.from({ length: 14 }, (_, index) => `work-${index + 1}`);
    renderBoard(14, { curated, removed: [] });

    const curatedBand = screen.getByRole("region", { name: /curated head/i });
    expect(
      within(curatedBand).getByText(/the article stops here — positions 13\+ reach \/replications only/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /default order/i })).toHaveTextContent(
      /every match is curated or excluded/i,
    );
  });

  it("renders ghost slots with their own positions and no fold while under the cap", () => {
    renderBoard(3, { curated: [], removed: [] });

    expect(
      screen.queryByText(/the article stops here/i),
      "the fold is a fact about overflow; there is none here",
    ).not.toBeInTheDocument();
    expect(screen.getByText(/9 of the article's 12 slots are empty — 3 filled/i)).toBeInTheDocument();

    const ghosts = screen.getAllByText(/empty slot/i);
    expect(ghosts).toHaveLength(9);
    // Ghost numbering resumes after the last real row.
    expect(ghosts[0].closest("li")).toHaveTextContent("4");
    expect(ghosts[8].closest("li")).toHaveTextContent("12");
  });

  it("shows the default order as provisional ghost rows while nothing is pinned", () => {
    renderBoard(3, { curated: [], removed: [] });

    expect(screen.getByText(/default order — nothing pinned/i)).toBeInTheDocument();
    // Provisional, not off-stage: dashed rather than dimmed to 55%.
    const row = screen.getByText("Work 1").closest("li")?.innerHTML ?? "";
    expect(row).toContain("border-dashed");
    expect(row).not.toContain("opacity-55");
  });

  it("drops the provisional treatment as soon as a row is pinned", () => {
    renderBoard(3, { curated: ["work-1"], removed: [] });

    expect(screen.queryByText(/default order — nothing pinned/i)).not.toBeInTheDocument();
    expect(screen.getByText("Work 2").closest("li")?.innerHTML ?? "").not.toContain("border-dashed");
  });

  it("labels the un-curate drop zone and offers promote actions on default rows", async () => {
    const user = userEvent.setup();
    const { props } = renderBoard(3, { curated: [], removed: [] });

    expect(
      screen.getByRole("group", { name: /drop a curated row here to return it to the default order/i }),
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
  });

  it("moves focus onto the row that just changed band, then reports it handled", () => {
    const onFocusHandled = vi.fn();
    renderBoard(3, { curated: [], removed: [] }, { focusSlug: "work-2", onFocusHandled });

    expect(screen.getByRole("button", { name: "Curate Work 2" })).toHaveFocus();
    expect(onFocusHandled).toHaveBeenCalled();
  });
});
