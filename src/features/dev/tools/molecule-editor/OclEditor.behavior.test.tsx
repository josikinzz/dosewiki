import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** A minimal stand-in for OCL's Molecule with two atoms joined by one selected bond. */
function makeMoleculeStub({ findBondResult = 0 } = {}) {
  const coordinates = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];
  return {
    coordinates,
    getAllAtoms: () => coordinates.length,
    getAtomX: (atom: number) => coordinates[atom]!.x,
    getAtomY: (atom: number) => coordinates[atom]!.y,
    setAtomX: (atom: number, x: number) => {
      coordinates[atom]!.x = x;
    },
    setAtomY: (atom: number, y: number) => {
      coordinates[atom]!.y = y;
    },
    getAllBonds: () => 1,
    getBondAtom: (no: 0 | 1, _bond: number) => no,
    isSelectedBond: () => true,
    findBond: vi.fn(() => findBondResult),
    toMolfile: () => "snapped molblock",
  };
}

const openChemLibMock = vi.hoisted(() => ({
  instances: [] as Array<{
    options: { initialMode?: string; fineRotation?: boolean };
    molecule: unknown;
    setFineRotationEnabled: ReturnType<typeof vi.fn>;
    setOnChangeListener: ReturnType<typeof vi.fn>;
    setMolecule: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("openchemlib", () => {
  class CanvasEditor {
    options: { initialMode?: string; fineRotation?: boolean };
    molecule: unknown = null;
    setFineRotationEnabled = vi.fn();
    setOnChangeListener = vi.fn();
    removeOnChangeListener = vi.fn();
    getMolecule = vi.fn(() => this.molecule);
    setMolecule = vi.fn((molecule: unknown) => {
      this.molecule = molecule;
    });
    clearAll = vi.fn();
    destroy = vi.fn();

    constructor(
      _host: HTMLElement,
      options: { initialMode?: string; fineRotation?: boolean } = {},
    ) {
      this.options = options;
      openChemLibMock.instances.push(this);
    }
  }

  return {
    CanvasEditor,
    Molecule: {
      fromMolfile: vi.fn(),
    },
  };
});

import { OclEditor } from "./OclEditor";

describe("OclEditor fine rotation preference", () => {
  afterEach(() => {
    cleanup();
    openChemLibMock.instances.length = 0;
  });

  it("applies fine rotation at construction and updates the same editor without emitting a change", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <OclEditor source={null} fineRotation onChange={onChange} />,
    );

    await waitFor(() => expect(openChemLibMock.instances).toHaveLength(1));
    const editor = openChemLibMock.instances[0]!;
    expect(editor.options).toMatchObject({
      initialMode: "molecule",
      fineRotation: true,
    });
    await waitFor(() =>
      expect(editor.setFineRotationEnabled).toHaveBeenLastCalledWith(true),
    );

    rerender(<OclEditor source={null} fineRotation={false} onChange={onChange} />);

    await waitFor(() =>
      expect(editor.setFineRotationEnabled).toHaveBeenLastCalledWith(false),
    );
    expect(openChemLibMock.instances).toHaveLength(1);
    expect(editor.destroy).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("OclEditor alignment snap requests", () => {
  afterEach(() => {
    cleanup();
    openChemLibMock.instances.length = 0;
  });

  it("rotates the canvas molecule for a bond-vertical request and reports the outcome", async () => {
    const onChange = vi.fn();
    const onSnapComplete = vi.fn();
    const { rerender } = render(
      <OclEditor
        source={null}
        onChange={onChange}
        snapRequest={null}
        onSnapComplete={onSnapComplete}
      />,
    );
    await waitFor(() => expect(openChemLibMock.instances).toHaveLength(1));
    const editor = openChemLibMock.instances[0]!;
    const molecule = makeMoleculeStub();
    editor.molecule = molecule;

    rerender(
      <OclEditor
        source={null}
        onChange={onChange}
        snapRequest="bond-vertical"
        onSnapComplete={onSnapComplete}
      />,
    );

    await waitFor(() => expect(onSnapComplete).toHaveBeenCalled());
    expect(onSnapComplete).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "bond-vertical", status: "applied" }),
    );
    // The stub bond runs 45° up-right, so the snap turns everything +45°.
    expect(onSnapComplete.mock.calls[0]![0].degrees).toBeCloseTo(45, 6);
    expect(editor.setMolecule).toHaveBeenCalledWith(molecule);
    expect(onChange).toHaveBeenCalledWith("snapped molblock", {});
    expect(molecule.getAtomX(0)).toBeCloseTo(molecule.getAtomX(1), 9);
  });

  it("reports selection changes as a bond count without marking the editor dirty", async () => {
    const onChange = vi.fn();
    const onSelectedBondCountChange = vi.fn();
    render(
      <OclEditor
        source={null}
        onChange={onChange}
        onSelectedBondCountChange={onSelectedBondCountChange}
      />,
    );
    await waitFor(() => expect(openChemLibMock.instances).toHaveLength(1));
    const editor = openChemLibMock.instances[0]!;
    editor.molecule = makeMoleculeStub();
    const listener = editor.setOnChangeListener.mock.calls[0]![0] as (event: {
      type: string;
      isUserEvent: boolean;
    }) => void;

    listener({ type: "selection", isUserEvent: true });

    expect(onSelectedBondCountChange).toHaveBeenLastCalledWith(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("OclEditor bond pick mode", () => {
  afterEach(() => {
    cleanup();
    openChemLibMock.instances.length = 0;
  });

  async function renderPickMode(molecule: ReturnType<typeof makeMoleculeStub>) {
    const onChange = vi.fn();
    const onBondPickComplete = vi.fn();
    render(
      <OclEditor
        source={null}
        onChange={onChange}
        bondPickActive
        onBondPickComplete={onBondPickComplete}
      />,
    );
    await waitFor(() => expect(openChemLibMock.instances).toHaveLength(1));
    const editor = openChemLibMock.instances[0]!;
    editor.molecule = molecule;
    const overlay = await screen.findByTestId("bond-pick-overlay");
    return { onChange, onBondPickComplete, editor, overlay };
  }

  it("highlights the hovered bond and applies the rotation on click", async () => {
    const molecule = makeMoleculeStub();
    const { onChange, onBondPickComplete, editor, overlay } = await renderPickMode(molecule);

    fireEvent.pointerMove(overlay, { clientX: 5, clientY: 5 });
    // jsdom rects are all zero-sized, so canvas and overlay share an origin and
    // the hit-test sees the raw client coordinates.
    expect(molecule.findBond).toHaveBeenCalledWith(5, 5);
    expect(overlay.querySelector("line")).not.toBeNull();

    fireEvent.click(overlay, { clientX: 5, clientY: 5 });
    expect(onBondPickComplete).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "bond-vertical", status: "applied" }),
    );
    // The stub bond runs 45° up-right, so the pick turns everything +45°.
    expect(onBondPickComplete.mock.calls[0]![0].degrees).toBeCloseTo(45, 6);
    expect(editor.setMolecule).toHaveBeenCalledWith(molecule);
    expect(onChange).toHaveBeenCalledWith("snapped molblock", {});
    expect(molecule.getAtomX(0)).toBeCloseTo(molecule.getAtomX(1), 9);
  });

  it("stays armed when the click misses every bond", async () => {
    const molecule = makeMoleculeStub({ findBondResult: -1 });
    const { onChange, onBondPickComplete, editor, overlay } = await renderPickMode(molecule);

    fireEvent.pointerMove(overlay, { clientX: 5, clientY: 5 });
    expect(overlay.querySelector("line")).toBeNull();

    fireEvent.click(overlay, { clientX: 5, clientY: 5 });
    expect(onBondPickComplete).not.toHaveBeenCalled();
    expect(editor.setMolecule).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cancels on Escape without touching the molecule", async () => {
    const molecule = makeMoleculeStub();
    const { onChange, onBondPickComplete, editor } = await renderPickMode(molecule);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onBondPickComplete).toHaveBeenCalledWith({
      kind: "bond-vertical",
      status: "canceled",
    });
    expect(editor.setMolecule).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders no overlay when pick mode is off", async () => {
    const onChange = vi.fn();
    render(<OclEditor source={null} onChange={onChange} />);
    await waitFor(() => expect(openChemLibMock.instances).toHaveLength(1));

    expect(screen.queryByTestId("bond-pick-overlay")).toBeNull();
  });
});
