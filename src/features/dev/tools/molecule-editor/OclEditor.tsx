"use client";

/**
 * Thin React wrapper around OpenChemLib's `CanvasEditor` — the neutral 2D structure
 * editor where the developer drags atoms and sets per-bond wedge/hash stereo bonds.
 *
 * OpenChemLib (~1 MB) is dynamically imported on mount so it stays out of every public
 * bundle. The editor is created once; changing `source` (re)loads a MOL block, and every
 * user edit is emitted upward as a fresh MOL block via `onChange`.
 */
import { useEffect, useRef, useState } from "react";

type OclModule = typeof import("openchemlib");
type CanvasEditorInstance = InstanceType<OclModule["CanvasEditor"]>;

interface OclEditorProps {
  /** MOL block to load. Reloaded into the canvas whenever this string changes. */
  source: string | null;
  /** Emitted on every edit as the current depiction's MOL block (coords + wedges). */
  onChange: (molblock: string) => void;
  className?: string;
}

export function OclEditor({ source, onChange, className }: OclEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<CanvasEditorInstance | null>(null);
  const oclRef = useRef<OclModule | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);

  // Create the editor once.
  useEffect(() => {
    let destroyed = false;
    let editor: CanvasEditorInstance | null = null;
    void (async () => {
      const mod = await import("openchemlib");
      const OCL = ("CanvasEditor" in mod ? mod : (mod as { default: OclModule }).default);
      if (destroyed || !hostRef.current) return;
      oclRef.current = OCL;
      editor = new OCL.CanvasEditor(hostRef.current, { initialMode: "molecule" });
      editorRef.current = editor;
      editor.setOnChangeListener(() => {
        const ed = editorRef.current;
        if (!ed) return;
        try {
          onChangeRef.current(ed.getMolecule().toMolfile());
        } catch {
          /* molecule can be transiently invalid mid-edit; ignore */
        }
      });
      setReady(true);
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

  // (Re)load the source MOL block whenever it changes.
  useEffect(() => {
    if (!ready) return;
    const ed = editorRef.current;
    const OCL = oclRef.current;
    if (!ed || !OCL) return;
    if (source) {
      try {
        ed.setMolecule(OCL.Molecule.fromMolfile(source));
      } catch {
        /* unparseable source — leave the canvas as-is */
      }
    } else {
      try {
        ed.clearAll();
      } catch {
        /* noop */
      }
    }
  }, [source, ready]);

  return <div ref={hostRef} className={className} />;
}
