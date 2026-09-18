import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  compareCanonicalSmilesMock,
  installMoleculeEditorTestHarness,
  renderMoleculeSvgMock,
  seedPhenethylamineClass,
} from "./MoleculeEditorTab.testHarness";
import { MoleculeEditorTab } from "./MoleculeEditorTab";
import { stripOclCustomLabelSgroups } from "./applyRLabelsToMolblock";
import {
  OCL_BENZENE,
  OCL_BENZENE_WITH_SURVIVOR_RAW,
  RDKIT_PHENETHYLAMINE,
} from "./classMolblockFixture";

describe("MoleculeEditorTab class R-group labels", () => {
  installMoleculeEditorTestHarness();
  it("hands the class R-group label map to the canvas and preview without dirtying the baseline", async () => {
    seedPhenethylamineClass();
    compareCanonicalSmilesMock.mockReturnValue({
      match: true,
      inchiOriginal: "smiles",
      inchiEdited: "smiles",
    });

    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Generic classes" }));
    await user.click(screen.getByRole("combobox", { name: "Select a class" }));
    await user.click(await screen.findByText("Phenethylamine"));

    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute(
        "data-source",
        RDKIT_PHENETHYLAMINE,
      ),
    );
    // The canvas gets the same draw-time map the brand preview uses: all eight
    // R positions, keyed by source atom index (atom 0 carries map 9 -> RN).
    const raw = screen.getByTestId("ocl-editor").getAttribute("data-atom-labels");
    const labels = JSON.parse(raw ?? "{}") as Record<string, string>;
    expect(labels["0"]).toBe("RN");
    expect(Object.values(labels).sort()).toEqual(
      ["R2", "R3", "R4", "R5", "R6", "RN", "Rα", "Rβ"].sort(),
    );
    await waitFor(() =>
      expect(renderMoleculeSvgMock).toHaveBeenLastCalledWith(
        expect.anything(),
        RDKIT_PHENETHYLAMINE,
        labels,
        [],
      ),
    );
    // Loading a seeded class row must not trip the unsaved-changes flag.
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("drops the preview label map after a destructive class redraw while the canvas keeps its load-time map", async () => {
    seedPhenethylamineClass();
    compareCanonicalSmilesMock.mockReturnValue({
      match: false,
      inchiOriginal: "class",
      inchiEdited: "benzene",
    });

    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Generic classes" }));
    await user.click(screen.getByRole("combobox", { name: "Select a class" }));
    await user.click(await screen.findByText("Phenethylamine"));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute(
        "data-source",
        RDKIT_PHENETHYLAMINE,
      ),
    );
    const loadLabels = JSON.parse(
      screen.getByTestId("ocl-editor").getAttribute("data-atom-labels") ?? "{}",
    ) as Record<string, string>;
    expect(Object.keys(loadLabels)).toHaveLength(8);

    // The user erased the class structure and drew benzene: a different atom
    // count, no dummies. The emission carries an empty display map, so the
    // preview renders WITHOUT any R labels — the stale source-indexed map
    // would put a phantom "R" on an arbitrary atom.
    await user.click(screen.getByRole("button", { name: "Emit benzene redraw" }));
    await waitFor(() =>
      expect(renderMoleculeSvgMock).toHaveBeenLastCalledWith(
        expect.anything(),
        OCL_BENZENE,
        {},
        [],
      ),
    );
    // The canvas keeps its load-time source map — it labeled the source atoms
    // at load and OclEditor load-time behavior is untouched.
    expect(
      JSON.parse(screen.getByTestId("ocl-editor").getAttribute("data-atom-labels") ?? "{}"),
    ).toEqual(loadLabels);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("mirrors surviving canvas labels into the preview after a partial redraw", async () => {
    seedPhenethylamineClass();
    compareCanonicalSmilesMock.mockReturnValue({
      match: false,
      inchiOriginal: "class",
      inchiEdited: "benzene+R",
    });

    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Generic classes" }));
    await user.click(screen.getByRole("combobox", { name: "Select a class" }));
    await user.click(await screen.findByText("Phenethylamine"));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute(
        "data-source",
        RDKIT_PHENETHYLAMINE,
      ),
    );

    // Partial redraw: benzene plus ONE surviving labeled dummy. The raw
    // emission's label S-group carries the atom's CURRENT index (7th atom),
    // so the preview shows exactly the label the canvas still displays —
    // "RN" on the survivor, nothing anywhere else.
    await user.click(screen.getByRole("button", { name: "Emit partial redraw" }));
    await waitFor(() =>
      expect(renderMoleculeSvgMock).toHaveBeenLastCalledWith(
        expect.anything(),
        stripOclCustomLabelSgroups(OCL_BENZENE_WITH_SURVIVOR_RAW),
        { 6: "RN" },
        [],
      ),
    );
    // The stripped molblock (dirty comparison input) never carries S-groups.
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("converts a typed R8 into a canonical labeled dummy while an unknown R12 stays untouched", async () => {
    seedPhenethylamineClass();
    compareCanonicalSmilesMock.mockReturnValue({
      match: false,
      inchiOriginal: "class",
      inchiEdited: "class+R",
    });

    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Generic classes" }));
    await user.click(screen.getByRole("combobox", { name: "Select a class" }));
    await user.click(await screen.findByText("Phenethylamine"));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute(
        "data-source",
        RDKIT_PHENETHYLAMINE,
      ),
    );

    // The user typed R8 (rLabels has "8" -> Rα) and R12 (no entry) in the ?…
    // dialog. The seam converts the R8 atom to the canonical `*`+map spelling
    // and stamps Rα into the preview map alongside the labels OCL displays;
    // R12 stays a visible typed R group with its RGP entry.
    await user.click(screen.getByRole("button", { name: "Emit typed R groups" }));
    await waitFor(() =>
      expect(renderMoleculeSvgMock).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.stringContaining("M  RGP  1  19  12"),
        { 0: "RN", 3: "Rα", 5: "Rβ", 8: "R2", 10: "R3", 12: "R4", 14: "R5", 16: "R6", 17: "Rα" },
        [],
      ),
    );
    const edited = renderMoleculeSvgMock.mock.lastCall?.[1] as string;
    // typed R8 -> canonical dummy at the emission's own atom index (18th atom)
    expect(edited).toContain(
      "    5.2500   -2.5981    0.0000 *   0  0  0  0  0  0  0  0  0  8  0  0",
    );
    // unknown R12: untouched, never silently dropped
    expect(edited).toContain(
      "    6.7500   -1.2990    0.0000 R#  0  0  0  0  0  0  0  0  0  0  0  0",
    );
    expect(edited).not.toContain("NOSEARCH_OCL_CUSTOM_LABEL");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });
});
