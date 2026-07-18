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
import { useEffect, useRef, useState } from "react";
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
  className?: string;
}

export function OclEditor({
  source,
  onChange,
  onError,
  fineRotation = false,
  mirrorDirection,
  onMirrorComplete,
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
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          // Ignore programmatic loads (isUserEvent === false) and selection/highlight
          // events so `edited` only diverges from `source` on a real structural edit.
          if (!event.isUserEvent || event.type !== "molecule") return;
          const ed = editorRef.current;
          if (!ed) return;
          try {
            onChangeRef.current(ed.getMolecule().toMolfile());
          } catch {
            /* molecule can be transiently invalid mid-edit; ignore */
          }
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
  }, []);

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

  // (Re)load the source MOL block whenever it changes.
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
  }, [source, ready]);

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
