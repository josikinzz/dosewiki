import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ManualIndexConfig } from "./types";

const EMPTY: ManualIndexConfig = { version: 1, categories: [] };
const EDITED: ManualIndexConfig = {
  version: 1,
  categories: [{ key: "stimulant", label: "Stimulant", iconKey: "", drugs: [], sections: [] }],
};

// The chemical dataset carries an uncommitted edit; the open psychoactive one does not.
const devMode = vi.hoisted(() => ({
  psychoactiveIndexManual: null as unknown,
  chemicalIndexManual: null as unknown,
  mechanismIndexManual: null as unknown,
  original: null as unknown,
}));

vi.mock("../../context/DevModeContext", () => ({
  useDevMode: () => ({
    psychoactiveIndexManual: devMode.psychoactiveIndexManual,
    chemicalIndexManual: devMode.chemicalIndexManual,
    mechanismIndexManual: devMode.mechanismIndexManual,
    replacePsychoactiveIndexManual: vi.fn(),
    replaceChemicalIndexManual: vi.fn(),
    replaceMechanismIndexManual: vi.fn(),
    resetPsychoactiveIndexManual: vi.fn(),
    resetChemicalIndexManual: vi.fn(),
    resetMechanismIndexManual: vi.fn(),
    getOriginalPsychoactiveIndexManual: getOriginal,
    getOriginalChemicalIndexManual: getOriginal,
    getOriginalMechanismIndexManual: getOriginal,
    retryIndexLayouts: vi.fn(),
  }),
}));

const getOriginal = () => devMode.original as ManualIndexConfig;

vi.mock("@/data/SubstanceIndexProvider", () => ({
  useLibrary: () => ({ allSubstanceRecords: [], allSubstancesBySlug: new Map() }),
}));

import { IndexLayoutTab } from "./IndexLayoutTab";

describe("IndexLayoutTab", () => {
  it("marks every dataset holding uncommitted edits in the switcher, not only the open one", () => {
    devMode.psychoactiveIndexManual = EMPTY;
    devMode.chemicalIndexManual = EDITED;
    devMode.mechanismIndexManual = EMPTY;
    devMode.original = EMPTY;

    render(<IndexLayoutTab enableStickyPanels={false} />);

    const switcher = screen.getByRole("group", { name: "Index dataset" });
    expect(within(switcher).getByRole("button", { name: /Psychoactive class/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(switcher).getByRole("button", { name: /Chemical class/ })).toHaveAccessibleName(/uncommitted changes/);
    expect(within(switcher).getByRole("button", { name: /Psychoactive class/ })).not.toHaveAccessibleName(/uncommitted/);
    expect(within(switcher).getByRole("button", { name: /Mechanism of action/ })).not.toHaveAccessibleName(/uncommitted/);
  });
});
