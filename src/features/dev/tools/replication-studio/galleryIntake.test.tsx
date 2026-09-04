import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

// cmdk measures its list and scrolls the active item into view; jsdom has
// neither ResizeObserver nor scrollIntoView.
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
});

import { GalleryLibraryAdd } from "./GalleryLibraryAdd";
import { GalleryPicker } from "./GalleryPicker";
import type { StudioRow } from "./replicationStudioModel";
import type { GalleryCandidate } from "./substanceGalleryPortalModel";

const CANDIDATES: GalleryCandidate[] = [
  { slug: "lsd", title: "LSD", match_count: 9, curated: true, curated_count: 4, removed_count: 0 },
  { slug: "dmt", title: "DMT", match_count: 7, curated: false, curated_count: 0, removed_count: 0 },
  { slug: "mescaline", title: "Mescaline", match_count: 2, curated: false, curated_count: 0, removed_count: 0 },
];

function studioRow(overrides: Partial<StudioRow> & Pick<StudioRow, "id" | "slug" | "title">): StudioRow {
  return {
    artist: "Hypnagogist",
    artist_url: null,
    role: "replication",
    type: "image",
    effect_slug: null,
    effect_name: null,
    effect_tags: [],
    credit_line: null,
    url: "https://example.invalid/asset.png",
    thumbnail_url: null,
    format: "png",
    duration: null,
    file_size: 1024,
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

const ROWS: StudioRow[] = [
  studioRow({ id: "row-matched", slug: "matched-row", title: "Matched row", effect_slug: "geometry" }),
  studioRow({ id: "row-unmatched", slug: "unmatched-row", title: "Unmatched row" }),
  studioRow({ id: "row-figure", slug: "figure-row", title: "Figure row", role: "figure" }),
];


describe("GalleryPicker", () => {
  it("disables the trigger while loading instead of rendering nothing", () => {
    render(<GalleryPicker candidates={[]} currentSlug={null} onSelect={() => {}} status="loading" />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("stays disabled and says so when the list failed, with no spinner", () => {
    const { container } = render(
      <GalleryPicker candidates={[]} currentSlug={null} onSelect={() => {}} status="error" />,
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent("Substance list unavailable");
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("filters to never-curated substances, most matches first, in worklist mode", async () => {
    const user = userEvent.setup();
    render(<GalleryPicker candidates={CANDIDATES} currentSlug="lsd" onSelect={() => {}} status="ready" />);

    await user.click(screen.getByRole("combobox"));
    expect(await screen.findAllByRole("option")).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: /needs curation \(2\)/i }));

    const listed = screen.getAllByRole("option").map((item) => item.textContent ?? "");
    expect(listed).toHaveLength(2);
    expect(listed[0]).toContain("DMT");
    expect(listed[1]).toContain("Mescaline");
    expect(listed.some((text) => text.includes("LSD"))).toBe(false);
  });
});

describe("GalleryLibraryAdd", () => {
  it("prioritizes an automatic row and skips figures", async () => {
    const user = userEvent.setup();
    const onCurate = vi.fn();
    render(
      <GalleryLibraryAdd
        rows={ROWS}
        railNarrowed
        matchedSlugs={new Set(["matched-row"])}
        curatedSlugs={[]}
        removedSlugs={["matched-row"]}
        onCurate={onCurate}
        onInspectRow={() => {}}
        onOpenLibrary={() => {}}
      />,
    );

    expect(screen.queryByText("Figure row")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /restore & prioritize matched row/i }));
    expect(onCurate).toHaveBeenCalledWith("matched-row");
  });

  it("adds an unmatched standalone row as a direct association", async () => {
    const user = userEvent.setup();
    const onCurate = vi.fn();
    render(
      <GalleryLibraryAdd
        rows={ROWS}
        railNarrowed
        matchedSlugs={new Set(["matched-row"])}
        curatedSlugs={[]}
        removedSlugs={[]}
        onCurate={onCurate}
        onInspectRow={() => {}}
        onOpenLibrary={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /associate & prioritize unmatched row/i }),
    );
    expect(onCurate).toHaveBeenCalledWith("unmatched-row");
  });

  it("does not offer combinations for direct association", () => {
    const combination = studioRow({
      id: "combo",
      slug: "combo",
      title: "DXM + DPH",
      title_drugs: [
        {
          slug: "dxm",
          name: "DXM",
          class: "dissociatives",
          matched_title_text: "DXM",
        },
        {
          slug: "diphenhydramine",
          name: "Diphenhydramine",
          class: "deliriants",
          matched_title_text: "DPH",
        },
      ],
    });
    render(
      <GalleryLibraryAdd
        rows={[combination]}
        railNarrowed
        matchedSlugs={new Set<string>()}
        curatedSlugs={[]}
        removedSlugs={[]}
        onCurate={() => {}}
        onInspectRow={() => {}}
        onOpenLibrary={() => {}}
      />,
    );
    expect(screen.queryByText("DXM + DPH")).not.toBeInTheDocument();
  });

  it("pages past the initial cap and states the count honestly", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 15 }, (_, index) =>
      studioRow({ id: `row-${index}`, slug: `row-${index}`, title: `Row ${index}` }),
    );

    render(
      <GalleryLibraryAdd
        rows={many}
        railNarrowed
        matchedSlugs={new Set(many.map((row) => row.slug))}
        curatedSlugs={[]}
        removedSlugs={[]}
        onCurate={() => {}}
        onInspectRow={() => {}}
        onOpenLibrary={() => {}}
      />,
    );

    expect(screen.getByText("Showing 12 of 15 filtered rows")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show 3 more/i }));
    expect(screen.getByText("15 eligible rows")).toBeInTheDocument();
  });

  it("leads with the Library when the rail is not narrowing the corpus", async () => {
    const user = userEvent.setup();
    const onOpenLibrary = vi.fn();
    render(
      <GalleryLibraryAdd
        rows={ROWS}
        railNarrowed={false}
        matchedSlugs={new Set(["matched-row"])}
        curatedSlugs={[]}
        removedSlugs={[]}
        onCurate={() => {}}
        onInspectRow={() => {}}
        onOpenLibrary={onOpenLibrary}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open the library/i }));
    expect(onOpenLibrary).toHaveBeenCalledTimes(1);
  });
});
