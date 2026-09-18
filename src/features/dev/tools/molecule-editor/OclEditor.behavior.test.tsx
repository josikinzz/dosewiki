import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

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
    toolbarCanvas: HTMLCanvasElement;
    editorCanvas: HTMLCanvasElement;
    setFineRotationEnabled: Mock;
    setOnChangeListener: Mock;
    setMolecule: Mock;
    destroy: Mock;
  }>,
}));

vi.mock("openchemlib", () => {
  class CanvasEditor {
    options: { initialMode?: string; fineRotation?: boolean };
    molecule: unknown = null;
    toolbarCanvas: HTMLCanvasElement;
    editorCanvas: HTMLCanvasElement;
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
      host: HTMLElement,
      options: { initialMode?: string; fineRotation?: boolean } = {},
    ) {
      this.options = options;
      // The DOM OpenChemLib's `createEditor` builds: a root with an open shadow
      // root holding the toolbar canvas, then a container with the focusable
      // drawing canvas. CSS sizes are what a 2x17 toolbar of 21px buttons behind
      // a 2px border measures, so button geometry is exercised for real.
      const root = document.createElement("div");
      root.dataset.openchemlibCanvasEditor = "true";
      const shadow = root.attachShadow({ mode: "open" });
      this.toolbarCanvas = document.createElement("canvas");
      Object.defineProperty(this.toolbarCanvas, "offsetWidth", { value: 46 });
      Object.defineProperty(this.toolbarCanvas, "offsetHeight", { value: 361 });
      shadow.append(this.toolbarCanvas);
      const container = document.createElement("div");
      this.editorCanvas = document.createElement("canvas");
      this.editorCanvas.tabIndex = 0;
      container.append(this.editorCanvas);
      shadow.append(container);
      host.append(root);
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
    expect(editor.setMolecule).toHaveBeenCalledWith(molecule);
    expect(onChange).toHaveBeenCalledWith("snapped molblock", {});
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
    expect(editor.setMolecule).toHaveBeenCalledWith(molecule);
    expect(onChange).toHaveBeenCalledWith("snapped molblock", {});
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

describe("OclEditor tool strip", () => {
  afterEach(() => {
    cleanup();
    openChemLibMock.instances.length = 0;
  });

  async function renderStrip() {
    render(<OclEditor source={null} onChange={vi.fn()} />);
    await waitFor(() => expect(openChemLibMock.instances).toHaveLength(1));
    const editor = openChemLibMock.instances[0]!;
    // The strip enables once the editor's canvases are found.
    await waitFor(() => expect(screen.getByRole("button", { name: "Wedge" })).toBeEnabled());
    return editor;
  }

  it("presses OpenChemLib's toolbar at the chosen button and highlights that tool", async () => {
    const editor = await renderStrip();
    // OpenChemLib listens for the press on its toolbar canvas and for the
    // release on the document, so the release must compose out of the shadow root.
    const pointerEvents: Array<{ type: string; x: number; y: number }> = [];
    const record = (event: Event) => {
      const pointer = event as PointerEvent;
      pointerEvents.push({ type: pointer.type, x: pointer.clientX, y: pointer.clientY });
    };
    editor.toolbarCanvas.addEventListener("pointerdown", record);
    document.addEventListener("pointerup", record);

    // OpenChemLib starts on its bond tool, which the strip reflects.
    expect(screen.getByRole("button", { name: "Bond" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Wedge" }));
    document.removeEventListener("pointerup", record);

    // Wedge is `cToolUpBond` (6): column 0, row 6 of 21px buttons behind a 2px
    // border, so its centre is (12.5, 138.5) on a canvas whose rect sits at 0,0.
    expect(pointerEvents).toEqual([
      { type: "pointerdown", x: 12.5, y: 138.5 },
      { type: "pointerup", x: 12.5, y: 138.5 },
    ]);
    expect(screen.getByRole("button", { name: "Wedge" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Bond" })).toHaveAttribute("aria-pressed", "false");
    // Focus lands inside the shadow root, where the document only sees the host.
    expect((editor.editorCanvas.getRootNode() as ShadowRoot).activeElement).toBe(
      editor.editorCanvas,
    );
  });

  it("keeps OpenChemLib's own toolbar hidden until All tools opens it", async () => {
    const editor = await renderStrip();
    expect(editor.toolbarCanvas.style.visibility).toBe("hidden");
    expect(editor.toolbarCanvas.style.position).toBe("absolute");

    fireEvent.click(screen.getByRole("button", { name: /Show OpenChemLib's full toolbar/ }));
    expect(editor.toolbarCanvas.style.visibility).toBe("");
    expect(editor.toolbarCanvas.style.position).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Hide OpenChemLib's full toolbar" }));
    expect(editor.toolbarCanvas.style.visibility).toBe("hidden");
  });

  it("follows definitive shortcut keys and drops the highlight for ambiguous ones", async () => {
    const editor = await renderStrip();

    fireEvent.keyDown(editor.editorCanvas, { key: " " });
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");

    // A letter may have gone to a hovered atom's label instead of the toolbar.
    fireEvent.keyDown(editor.editorCanvas, { key: "u" });
    for (const name of ["Select", "Bond", "Wedge", "Hash", "Atom", "Erase"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }

    // Menu shortcuts (undo, copy, paste) never change tools.
    fireEvent.keyDown(editor.editorCanvas, { key: "1", metaKey: true });
    expect(screen.getByRole("button", { name: "Bond" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reads a click on OpenChemLib's own toolbar back into the strip", async () => {
    const editor = await renderStrip();
    // Hash is `cToolDownBond` (23): column 1, row 6.
    const hash = new PointerEvent("pointerup", { bubbles: true });
    Object.defineProperty(hash, "offsetX", { value: 2 + 21 * 1.5 });
    Object.defineProperty(hash, "offsetY", { value: 2 + 21 * 6.5 });
    fireEvent(editor.toolbarCanvas, hash);
    expect(screen.getByRole("button", { name: "Hash" })).toHaveAttribute("aria-pressed", "true");

    // A ring tool is outside the strip: nothing stays highlighted.
    const ring = new PointerEvent("pointerup", { bubbles: true });
    Object.defineProperty(ring, "offsetX", { value: 2 + 21 * 0.5 });
    Object.defineProperty(ring, "offsetY", { value: 2 + 21 * 7.5 });
    fireEvent(editor.toolbarCanvas, ring);
    expect(screen.getByRole("button", { name: "Hash" })).toHaveAttribute("aria-pressed", "false");
  });
});
