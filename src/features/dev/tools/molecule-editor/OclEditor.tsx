"use client";

/**
 * Thin React wrapper around OpenChemLib's `CanvasEditor` — the neutral 2D structure
 * editor where the developer drags atoms and sets per-bond wedge/hash stereo bonds.
 *
 * OpenChemLib (~1 MB) is dynamically imported on mount so it stays out of every public
 * bundle. The editor is created once; changing `source` (re)loads a MOL block, and every
 * user edit is emitted upward as a fresh MOL block via `onChange`.
 *
 * Only real user molecule edits are emitted: OpenChemLib fires its change listener for
 * programmatic `setMolecule` calls too (`isUserEvent === false`) and for selection /
 * highlight changes, but re-emitting those would re-serialise the MOL block and falsely
 * mark the editor "dirty". Filtering to user `molecule` events keeps `edited === source`
 * until the developer actually changes the structure.
 *
 * If OpenChemLib fails to load or the canvas cannot be constructed, the editor renders a
 * canvas-level error state and reports it via `onError`, instead of leaving a blank canvas
 * behind an unhandled promise rejection.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

type OclModule = typeof import("openchemlib");
type CanvasEditorInstance = InstanceType<OclModule["CanvasEditor"]>;

export type MoleculeMirrorDirection = "left-right" | "up-down";

type CoordinateMolecule = Pick<
  InstanceType<OclModule["Molecule"]>,
  "getAllAtoms" | "getAtomX" | "getAtomY" | "setAtomX" | "setAtomY"
> & Partial<Pick<InstanceType<OclModule["Molecule"]>, "getAllBonds" | "getBondType" | "setBondType">>;

type StereoBondTypes = Pick<OclModule["Molecule"], "cBondTypeDown" | "cBondTypeUp">;

type BondGeometryMolecule = CoordinateMolecule &
  Pick<InstanceType<OclModule["Molecule"]>, "getAllBonds" | "getBondAtom" | "isSelectedBond">;

export type MoleculeSnapKind = "bond-vertical" | "straighten";

export type MoleculeSnapOutcome =
  | { kind: MoleculeSnapKind; status: "applied"; degrees: number }
  | { kind: MoleculeSnapKind; status: "already-aligned" }
  | { kind: "bond-vertical"; status: "no-bond-selected" }
  | { kind: "bond-vertical"; status: "multiple-bonds-selected" }
  | { kind: "straighten"; status: "no-bonds" }
  | { kind: MoleculeSnapKind; status: "failed" };

/** Below this rotation the depiction is treated as already aligned (~0.03°). */
const ALIGNED_EPSILON_RADIANS = 0.0005;

/** Bonds on the standard drawing grid sit at multiples of 30°, i.e. π/6. */
const GRID_PERIODS_PER_TURN = 12;

/** Map an angle onto (-π/2, π/2] — vertical is the same line whichever end points up. */
function normalizeHalfTurn(radians: number): number {
  return radians - Math.PI * Math.round(radians / Math.PI);
}

/** Rigidly rotate every atom about the depiction's bounds centre. */
export function rotateMoleculeCoordinates(molecule: CoordinateMolecule, radians: number): boolean {
  const atomCount = molecule.getAllAtoms();
  if (atomCount === 0) return false;

  const coordinates = Array.from({ length: atomCount }, (_, atom) => ({
    atom,
    x: molecule.getAtomX(atom),
    y: molecule.getAtomY(atom),
  }));
  const xs = coordinates.map((coordinate) => coordinate.x);
  const ys = coordinates.map((coordinate) => coordinate.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);

  for (const coordinate of coordinates) {
    const dx = coordinate.x - centerX;
    const dy = coordinate.y - centerY;
    molecule.setAtomX(coordinate.atom, centerX + dx * cos - dy * sin);
    molecule.setAtomY(coordinate.atom, centerY + dx * sin + dy * cos);
  }

  return true;
}

/** How many bonds are currently lasso-selected (a bond counts when both atoms are). */
export function countSelectedBonds(molecule: BondGeometryMolecule): number {
  let count = 0;
  for (let bond = 0; bond < molecule.getAllBonds(); bond += 1) {
    if (molecule.isSelectedBond(bond)) count += 1;
  }
  return count;
}

function bondAngle(molecule: BondGeometryMolecule, bond: number): number {
  const atom0 = molecule.getBondAtom(0, bond);
  const atom1 = molecule.getBondAtom(1, bond);
  return Math.atan2(
    molecule.getAtomY(atom1) - molecule.getAtomY(atom0),
    molecule.getAtomX(atom1) - molecule.getAtomX(atom0),
  );
}

/**
 * The two one-shot alignment actions, as a pure coordinate transform:
 *
 * - `bond-vertical`: rigidly rotate the whole depiction (by the smaller of the two
 *   possible turns) so the single lasso-selected bond becomes exactly vertical.
 * - `straighten`: rigidly rotate by the circular mean of every bond's deviation from
 *   the 30° drawing grid — the one-click fix for a slightly askew depiction.
 *
 * A rigid rotation cannot invert a stereocentre, so unlike mirroring there is no
 * wedge/hash compensation to apply.
 */
export function applyMoleculeSnap(
  molecule: BondGeometryMolecule,
  kind: MoleculeSnapKind,
): MoleculeSnapOutcome {
  if (kind === "bond-vertical") {
    let selectedBond = -1;
    let count = 0;
    for (let bond = 0; bond < molecule.getAllBonds(); bond += 1) {
      if (molecule.isSelectedBond(bond)) {
        selectedBond = bond;
        count += 1;
      }
    }
    if (count === 0) return { kind, status: "no-bond-selected" };
    if (count > 1) return { kind, status: "multiple-bonds-selected" };

    const atom0 = molecule.getBondAtom(0, selectedBond);
    const atom1 = molecule.getBondAtom(1, selectedBond);
    const dx = molecule.getAtomX(atom1) - molecule.getAtomX(atom0);
    const dy = molecule.getAtomY(atom1) - molecule.getAtomY(atom0);
    if (Math.hypot(dx, dy) < 1e-9) return { kind, status: "already-aligned" };

    const delta = normalizeHalfTurn(Math.PI / 2 - Math.atan2(dy, dx));
    if (Math.abs(delta) < ALIGNED_EPSILON_RADIANS) return { kind, status: "already-aligned" };
    rotateMoleculeCoordinates(molecule, delta);
    return { kind, status: "applied", degrees: (delta * 180) / Math.PI };
  }

  const bondCount = molecule.getAllBonds();
  if (bondCount === 0) return { kind, status: "no-bonds" };

  // Circular mean of the deviations: multiplying each angle by 12 collapses the 30°
  // grid onto a full turn, so wraparound (+14° vs −14°) averages correctly.
  let sumSin = 0;
  let sumCos = 0;
  for (let bond = 0; bond < bondCount; bond += 1) {
    const scaled = bondAngle(molecule, bond) * GRID_PERIODS_PER_TURN;
    sumSin += Math.sin(scaled);
    sumCos += Math.cos(scaled);
  }
  const delta = -Math.atan2(sumSin, sumCos) / GRID_PERIODS_PER_TURN;
  if (Math.abs(delta) < ALIGNED_EPSILON_RADIANS) return { kind, status: "already-aligned" };
  rotateMoleculeCoordinates(molecule, delta);
  return { kind, status: "applied", degrees: (delta * 180) / Math.PI };
}

/** Reflect a depiction around its own bounds while preserving wedge/hash stereo encoding. */
export function mirrorMoleculeCoordinates(
  molecule: CoordinateMolecule,
  direction: MoleculeMirrorDirection,
  stereoBondTypes?: StereoBondTypes,
): boolean {
  const atomCount = molecule.getAllAtoms();
  if (atomCount === 0) return false;

  const coordinates = Array.from({ length: atomCount }, (_, atom) => ({
    atom,
    x: molecule.getAtomX(atom),
    y: molecule.getAtomY(atom),
  }));
  const horizontal = direction === "left-right";
  const values = coordinates.map((coordinate) => (horizontal ? coordinate.x : coordinate.y));
  const axis = Math.min(...values) + Math.max(...values);

  for (const coordinate of coordinates) {
    if (horizontal) {
      molecule.setAtomX(coordinate.atom, axis - coordinate.x);
    } else {
      molecule.setAtomY(coordinate.atom, axis - coordinate.y);
    }
  }

  if (stereoBondTypes && molecule.getAllBonds && molecule.getBondType && molecule.setBondType) {
    for (let bond = 0; bond < molecule.getAllBonds(); bond += 1) {
      const type = molecule.getBondType(bond);
      if (type === stereoBondTypes.cBondTypeUp) {
        molecule.setBondType(bond, stereoBondTypes.cBondTypeDown);
      } else if (type === stereoBondTypes.cBondTypeDown) {
        molecule.setBondType(bond, stereoBondTypes.cBondTypeUp);
      }
    }
  }

  return true;
}

interface OclEditorProps {
  /** MOL block to load. Reloaded into the canvas whenever this string changes. */
  source: string | null;
  /**
   * Bumped by the parent every time it installs a baseline, including when the
   * new MOL block is an equal string. The canvas is uncontrolled once loaded, so
   * value equality alone would leave a stale drawing on screen after the parent
   * has already reset the edit it publishes.
   */
  sourceEpoch?: number;
  /** Emitted on every user edit as the current depiction's MOL block (coords + wedges). */
  onChange: (molblock: string) => void;
  /** Called once if OpenChemLib fails to load or the canvas editor cannot be created. */
  onError?: (message: string) => void;
  /** Enables continuous pointer rotation below OpenChemLib's legacy dead zone. */
  fineRotation?: boolean;
  /** A one-shot request from the parent controls to reflect the editable depiction. */
  mirrorDirection?: MoleculeMirrorDirection | null;
  /** Clears the parent request after it is applied or safely ignored. */
  onMirrorComplete?: () => void;
  /** A one-shot request from the parent controls to rotate the depiction into alignment. */
  snapRequest?: MoleculeSnapKind | null;
  /** Reports the alignment outcome and clears the parent request. */
  onSnapComplete?: (outcome: MoleculeSnapOutcome) => void;
  /** Reports how many bonds are lasso-selected, gating the bond-vertical control. */
  onSelectedBondCountChange?: (count: number) => void;
  className?: string;
}

export function OclEditor({
  source,
  sourceEpoch = 0,
  onChange,
  onError,
  fineRotation = false,
  mirrorDirection,
  onMirrorComplete,
  snapRequest,
  onSnapComplete,
  onSelectedBondCountChange,
  className,
}: OclEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<CanvasEditorInstance | null>(null);
  const oclRef = useRef<OclModule | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const fineRotationRef = useRef(fineRotation);
  fineRotationRef.current = fineRotation;
  const onMirrorCompleteRef = useRef(onMirrorComplete);
  onMirrorCompleteRef.current = onMirrorComplete;
  const onSnapCompleteRef = useRef(onSnapComplete);
  onSnapCompleteRef.current = onSnapComplete;
  const onSelectedBondCountChangeRef = useRef(onSelectedBondCountChange);
  onSelectedBondCountChangeRef.current = onSelectedBondCountChange;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recomputed rather than tracked incrementally: selection can change from lasso
  // edits, structural edits that remove selected atoms, and programmatic loads.
  const reportSelectedBonds = useCallback((editor: CanvasEditorInstance) => {
    const report = onSelectedBondCountChangeRef.current;
    if (!report) return;
    try {
      report(countSelectedBonds(editor.getMolecule()));
    } catch {
      /* molecule can be transiently invalid mid-edit; ignore */
    }
  }, []);

  // Create the editor once.
  useEffect(() => {
    let destroyed = false;
    let editor: CanvasEditorInstance | null = null;
    void (async () => {
      try {
        const mod = await import("openchemlib");
        const OCL = "CanvasEditor" in mod ? mod : (mod as { default: OclModule }).default;
        if (destroyed || !hostRef.current) return;
        oclRef.current = OCL;
        editor = new OCL.CanvasEditor(hostRef.current, {
          initialMode: "molecule",
          fineRotation: fineRotationRef.current,
        });
        editorRef.current = editor;
        editor.setOnChangeListener((event) => {
          const ed = editorRef.current;
          if (!ed) return;
          // Selection events feed the selected-bond counter (for the bond-vertical
          // control) but never mark the editor dirty.
          if (event.type === "selection") {
            reportSelectedBonds(ed);
            return;
          }
          // Ignore programmatic loads (isUserEvent === false) and highlight events so
          // `edited` only diverges from `source` on a real structural edit.
          if (!event.isUserEvent || event.type !== "molecule") return;
          try {
            onChangeRef.current(ed.getMolecule().toMolfile());
          } catch {
            /* molecule can be transiently invalid mid-edit; ignore */
          }
          // A structural edit can delete lasso-selected atoms without a selection event.
          reportSelectedBonds(ed);
        });
        setReady(true);
      } catch (err) {
        if (destroyed) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        onErrorRef.current?.(message);
      }
    })();
    return () => {
      destroyed = true;
      try {
        editor?.destroy();
      } catch {
        /* already destroyed */
      }
      editorRef.current = null;
    };
  }, [reportSelectedBonds]);

  // Synchronize the session-only interaction preference without touching the
  // molecule or emitting a structural change.
  useEffect(() => {
    if (!ready) return;
    const editor = editorRef.current;
    if (!editor) return;

    try {
      editor.setFineRotationEnabled(fineRotation);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      onErrorRef.current?.(message);
    }
  }, [fineRotation, ready]);

  // (Re)load the source MOL block whenever the parent installs a baseline.
  useEffect(() => {
    if (!ready) return;
    const ed = editorRef.current;
    const OCL = oclRef.current;
    if (!ed || !OCL) return;
    if (source) {
      try {
        ed.setMolecule(OCL.Molecule.fromMolfile(source));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        onErrorRef.current?.(message);
      }
    } else {
      try {
        ed.clearAll();
      } catch {
        /* noop */
      }
    }
    // A programmatic load discards any lasso selection.
    reportSelectedBonds(ed);
  }, [source, sourceEpoch, ready, reportSelectedBonds]);

  // Mirror through OpenChemLib, then emit a new MOL block so the parent preview,
  // dirty state, chemistry guard, and protected save path all use the new coordinates.
  useEffect(() => {
    if (!mirrorDirection || !ready) return;
    const editor = editorRef.current;
    const OCL = oclRef.current;
    if (!editor || !OCL) return;

    try {
      const molecule = editor.getMolecule();
      if (mirrorMoleculeCoordinates(molecule, mirrorDirection, OCL.Molecule)) {
        editor.setMolecule(molecule);
        onChangeRef.current(molecule.toMolfile());
      }
    } finally {
      onMirrorCompleteRef.current?.();
    }
  }, [mirrorDirection, ready]);

  // Alignment rotation through OpenChemLib, mirroring the flow above: mutate the
  // molecule's coordinates, reload the canvas, and emit a new MOL block so the parent
  // preview, dirty state, chemistry guard, and protected save path all pick it up.
  useEffect(() => {
    if (!snapRequest || !ready) return;
    const editor = editorRef.current;
    if (!editor) return;

    let outcome: MoleculeSnapOutcome = { kind: snapRequest, status: "failed" };
    try {
      const molecule = editor.getMolecule();
      outcome = applyMoleculeSnap(molecule, snapRequest);
      if (outcome.status === "applied") {
        editor.setMolecule(molecule);
        onChangeRef.current(molecule.toMolfile());
        // Reloading the molecule discards the lasso selection that picked the bond.
        reportSelectedBonds(editor);
      }
    } finally {
      onSnapCompleteRef.current?.(outcome);
    }
  }, [snapRequest, ready, reportSelectedBonds]);

  if (error) {
    return (
      <div className={cn("grid place-items-center p-6 text-center", className)}>
        <div className="max-w-xs">
          <Icon
            icon="lucide:circle-alert"
            size={22}
            className="theme-danger-text-strong mx-auto mb-2"
          />
          <p className="theme-text-primary text-sm font-medium">Structure editor unavailable</p>
          <p className="theme-text-muted mt-1 text-xs">
            OpenChemLib failed to load, so atoms and bonds can&apos;t be edited. Reload the page to
            try again.
          </p>
          <p className="theme-text-faint mt-1 break-words font-mono text-[11px]">{error}</p>
        </div>
      </div>
    );
  }

  return <div ref={hostRef} className={className} />;
}
