import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/common/Icon", () => ({
  Icon: () => <span>icon</span>,
}));

vi.mock("@/data/config/categoryIcons", () => ({
  getCategoryIcon: () => "sparkle",
}));

vi.mock("./AddSubstanceControl", () => ({
  AddSubstanceControl: () => <div>Add substance control</div>,
}));

import { IndexLayoutColumns } from "./IndexLayoutColumns";
import type { ManualCategoryDefinition } from "./types";

const categories: ManualCategoryDefinition[] = [
  { key: "psychedelics", label: "Psychedelics", iconKey: "sparkle", notes: "", drugs: ["lsd"], sections: [] },
  { key: "stimulants", label: "Stimulants", iconKey: "sparkle", notes: "", drugs: ["caffeine"], sections: [] },
];

function renderBoard() {
  return render(
    <IndexLayoutColumns
      columnCount={2}
      columnGroups={[
        { index: 0, items: [{ category: categories[0], originalIndex: 0 }] },
        { index: 1, items: [{ category: categories[1], originalIndex: 1 }] },
      ]}
      draftCategoryTotal={2}
      expansionSignal={{ expanded: true, token: 1 }}
      handleDragEnd={vi.fn()}
      updateCategory={vi.fn()}
      removeCategory={vi.fn()}
      moveCategory={vi.fn()}
      setColumn={vi.fn()}
      addSection={vi.fn()}
      addCategory={vi.fn()}
      substanceOptions={[]}
      datasetSlugSet={new Set(["lsd", "caffeine"])}
      sortSlugsWithCommonPriority={(slugs) => [...slugs]}
      resolveSlugStatus={(slug) => ({ slug, issues: [] })}
    />,
  );
}

describe("IndexLayoutColumns", () => {
  it("keeps every substance remove button visible and every column reorderable by buttons", () => {
    renderBoard();

    // Touch has no hover: the remove control is a labelled, always-visible button.
    for (const slug of ["lsd", "caffeine"]) {
      expect(screen.getByRole("button", { name: `Remove ${slug}` })).toBeVisible();
    }

    // Each column carries its own category with the arrow-button reorder path,
    // which is the touch path once the columns stack.
    const columns = screen.getAllByRole("group", { name: /^Column \d$/ });
    expect(columns).toHaveLength(2);
    expect(within(columns[0]).getByRole("button", { name: "Move category down" })).toBeEnabled();
    expect(within(columns[1]).getByRole("button", { name: "Move category up" })).toBeEnabled();
  });
});
