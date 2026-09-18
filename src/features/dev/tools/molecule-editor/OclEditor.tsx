"use client";

/**
 * Thin React wrapper around OpenChemLib's `CanvasEditor`, the neutral 2D structure
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
 * The drawing surface carries a labeled dose.wiki tool strip above it. OpenChemLib's own
 * toolbar (thirty unlabeled glyphs on a canvas inside a shadow root) is tucked away behind
 * "All tools"; the strip drives it through synthesised pointer events at the right button
 * (see `oclToolbar.ts`) and mirrors OpenChemLib's own shortcut keys, so the highlighted
 * tool is what the strip or a definitive key last chose.
 *
 * If OpenChemLib fails to load or the canvas cannot be constructed, the editor renders a
 * canvas-level error state and reports it via `onError`, instead of leaving a blank canvas
 * behind an unhandled promise rejection.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { EditorActionGroup, EditorToolbar } from "@/features/dev/components";
import { parseOclCustomLabelSgroups, stripOclCustomLabelSgroups } from "./applyRLabelsToMolblock";
import {
  applyBoldBonds,
  applyBondVertical,
  applyMoleculeSnap,
  countSelectedBonds,
  mirrorMoleculeCoordinates,
  readBoldBonds,
  type MoleculeMirrorDirection,
  type MoleculeSnapKind,
  type MoleculeSnapOutcome,
} from "./moleculeTransforms";
import {
  OCL_TOOLS,
  OCL_UNDO_BUTTON,
  oclToolbarButtonAt,
  oclToolbarButtonCentre,
  oclToolForButton,
  oclToolForShortcutKey,
  type OclToolId,
} from "./oclToolbar";
import styles from "./OclEditor.module.css";

type OclModule = typeof import("openchemlib");
type CanvasEditorInstance = InstanceType<OclModule["CanvasEditor"]>;

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
  /**
   * Draw-time atom labels (class-mode R groups: "R2"/"Rα"/"RN"), keyed by atom
   * index of `source`. Applied on every baseline load; never part of the MOL
   * block itself (emissions strip OCL's custom-label S-groups).
   */
  atomLabels?: Readonly<Record<number, string>>;
  /**
   * Emitted on every user edit as the current depiction's MOL block (coords +
   * wedges), plus the custom labels OCL currently displays, keyed by 0-based
   * atom index of THIS emission. OCL tracks label-atom identity through edits,
   * so the map is the canvas's display truth: labels follow surviving atoms and
   * vanish with deleted ones. Empty for label-free molecules (all substances).
   */
  onChange: (molblock: string, displayedAtomLabels: Record<number, string>) => void;
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
  /** Shows the click-to-pick overlay: the next clicked bond is rotated to vertical. */
  bondPickActive?: boolean;
  /** Reports the pick outcome (applied / canceled / failed) so the parent exits pick mode. */
  onBondPickComplete?: (outcome: MoleculeSnapOutcome) => void;
  /** Bond indices to draw bold; applied whenever a baseline loads into the canvas. */
  boldBonds?: readonly number[];
  /** Shows the click-to-pick overlay in bold mode: each clicked bond flips bold. */
  boldToggleActive?: boolean;
  /** Emitted whenever the canvas's bold-bond set changes (toggle or structural edit). */
  onBoldBondsChange?: (bonds: number[]) => void;
  /** Asks the parent to leave bold mode (Escape pressed over the overlay). */
  onBoldToggleExit?: () => void;
  className?: string;
  /** Overlays drawn over the drawing surface itself (below the pick overlay), not the tool strip. */
  children?: ReactNode;
}

/** The two canvases OpenChemLib mounts inside its shadow root. */
interface OclCanvases {
  toolbar: HTMLCanvasElement;
  editor: HTMLCanvasElement;
}

/** The hovered pick candidate, in overlay-local CSS pixels for highlight drawing. */
interface PickHover {
  bond: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function OclEditor({
  source,
  sourceEpoch = 0,
  atomLabels,
  onChange,
  onError,
  fineRotation = false,
  mirrorDirection,
  onMirrorComplete,
  snapRequest,
  onSnapComplete,
  onSelectedBondCountChange,
  bondPickActive = false,
  onBondPickComplete,
  boldBonds,
  boldToggleActive = false,
  onBoldBondsChange,
  onBoldToggleExit,
  className,
  children,
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
  const onBondPickCompleteRef = useRef(onBondPickComplete);
  onBondPickCompleteRef.current = onBondPickComplete;
  const boldBondsRef = useRef(boldBonds);
  boldBondsRef.current = boldBonds;
  const atomLabelsRef = useRef(atomLabels);
  atomLabelsRef.current = atomLabels;
  const onBoldBondsChangeRef = useRef(onBoldBondsChange);
  onBoldBondsChangeRef.current = onBoldBondsChange;
  const onBoldToggleExitRef = useRef(onBoldToggleExit);
  onBoldToggleExitRef.current = onBoldToggleExit;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickHover, setPickHover] = useState<PickHover | null>(null);
  // OpenChemLib's canvases, found once the editor exists; null under a mocked editor.
  const [canvases, setCanvases] = useState<OclCanvases | null>(null);
  // OpenChemLib starts on its standard bond tool. Null means the highlight can
  // no longer be trusted (a tool outside the strip, or a letter shortcut).
  const [activeTool, setActiveTool] = useState<OclToolId | null>("bond");
  const [nativeToolbarOpen, setNativeToolbarOpen] = useState(false);

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

  // Every emission funnels through here: OCL's `toMolfile` writes any applied
  // custom labels as DAT S-groups, which must never reach the parent's molblock
  // — they would break the string-equality dirty check against the unlabeled
  // baseline and leak into saved molblocks. The labels are instead parsed off
  // the raw emission and handed along the same callback, so the parent can
  // mirror exactly what the canvas displays. Identity for label-free molecules.
  const emitMolfile = useCallback((molecule: { toMolfile(): string }) => {
    const raw = molecule.toMolfile();
    onChangeRef.current(stripOclCustomLabelSgroups(raw), parseOclCustomLabelSgroups(raw));
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
            const molecule = ed.getMolecule();
            emitMolfile(molecule);
            // Structural edits can add, delete, or renumber bonds; the molecule's
            // own flags are the truth, so re-read the bold set alongside.
            onBoldBondsChangeRef.current?.(readBoldBonds(molecule));
          } catch {
            /* molecule can be transiently invalid mid-edit; ignore */
          }
          // A structural edit can delete lasso-selected atoms without a selection event.
          reportSelectedBonds(ed);
        });
        // Both canvases live in an open shadow root on the element OpenChemLib
        // appends: the toolbar canvas (never focusable) and, inside a container,
        // the focusable drawing canvas.
        const shadow = hostRef.current
          .querySelector("[data-openchemlib-canvas-editor]")
          ?.shadowRoot;
        const toolbar = shadow?.querySelector<HTMLCanvasElement>("canvas:not([tabindex])") ?? null;
        const drawing = shadow?.querySelector<HTMLCanvasElement>('canvas[tabindex="0"]') ?? null;
        setCanvases(toolbar && drawing ? { toolbar, editor: drawing } : null);
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
      setCanvases(null);
    };
  }, [reportSelectedBonds, emitMolfile]);

  // OpenChemLib's own toolbar stays mounted but out of the way until "All
  // tools" opens it: hidden in place (not display:none) so it keeps a layout box
  // for the synthesised clicks below, and absolutely positioned so the drawing
  // canvas takes the whole width meanwhile.
  useEffect(() => {
    if (!canvases) return;
    const { style } = canvases.toolbar;
    if (nativeToolbarOpen) {
      style.position = "";
      style.left = "";
      style.top = "";
      style.visibility = "";
    } else {
      style.position = "absolute";
      style.left = "0";
      style.top = "0";
      style.visibility = "hidden";
    }
  }, [canvases, nativeToolbarOpen]);

  // Read native toolbar clicks back so the strip's highlight follows them.
  useEffect(() => {
    if (!canvases) return;
    const { toolbar } = canvases;
    const onPointerUp = (event: PointerEvent) => {
      const button = oclToolbarButtonAt(
        toolbar.offsetWidth,
        toolbar.offsetHeight,
        event.offsetX,
        event.offsetY,
      );
      if (button < 0 || button === OCL_UNDO_BUTTON || button === 0 || button === 1) return;
      setActiveTool(oclToolForButton(button));
    };
    toolbar.addEventListener("pointerup", onPointerUp);
    return () => toolbar.removeEventListener("pointerup", onPointerUp);
  }, [canvases]);

  // Mirror OpenChemLib's own shortcut keys (typed with the drawing canvas
  // focused) into the strip; keydown composes out of the shadow root to the host.
  const handleHostKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tool = oclToolForShortcutKey(event.key);
    if (tool !== undefined) setActiveTool(tool);
  }, []);

  /**
   * Press and release OpenChemLib's toolbar at a button's centre, exactly the
   * pointer sequence its own listeners expect: `pointerdown` on the canvas, then
   * `pointerup` observed on the document, which a synthetic event only reaches
   * from inside the shadow root when it is `composed`. Clicking the active tool
   * is a no-op in OpenChemLib, which is also what the strip wants.
   */
  const pressToolbarButton = useCallback(
    (button: number) => {
      if (!canvases) return;
      const { toolbar } = canvases;
      const centre = oclToolbarButtonCentre(toolbar.offsetWidth, toolbar.offsetHeight, button);
      const rect = toolbar.getBoundingClientRect();
      const init: PointerEventInit = {
        bubbles: true,
        composed: true,
        cancelable: true,
        clientX: rect.left + centre.x,
        clientY: rect.top + centre.y,
        button: 0,
        pointerId: 0,
        pointerType: "mouse",
        isPrimary: true,
      };
      toolbar.dispatchEvent(new PointerEvent("pointerdown", init));
      toolbar.dispatchEvent(new PointerEvent("pointerup", init));
    },
    [canvases],
  );

  const chooseTool = useCallback(
    (tool: OclToolId) => {
      const definition = OCL_TOOLS.find((candidate) => candidate.id === tool);
      if (!definition) return;
      pressToolbarButton(definition.button);
      setActiveTool(tool);
      // Hand focus back to the drawing so atom typing and Escape keep working;
      // the atom tool opens OpenChemLib's label dialog instead, which owns focus.
      if (tool !== "atom") canvases?.editor.focus({ preventScroll: true });
    },
    [canvases, pressToolbarButton],
  );

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
        const molecule = OCL.Molecule.fromMolfile(source);
        // Bold flags aren't part of the MOL block; reapply the persisted list
        // before the load so the canvas draws them from the first paint.
        applyBoldBonds(molecule, boldBondsRef.current);
        // Class-mode R-group labels are draw-time only: apply them per baseline
        // load so the canvas shows the same text as the brand preview. Keyed by
        // source atom index; guarded so a stale map never touches a shorter
        // molecule.
        const labels = atomLabelsRef.current;
        if (labels) {
          const atomCount = molecule.getAllAtoms();
          for (const [index, label] of Object.entries(labels)) {
            const atom = Number(index);
            if (atom >= 0 && atom < atomCount) molecule.setAtomCustomLabel(atom, label);
          }
        }
        ed.setMolecule(molecule);
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
        emitMolfile(molecule);
      }
    } finally {
      onMirrorCompleteRef.current?.();
    }
  }, [mirrorDirection, ready, emitMolfile]);

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
        emitMolfile(molecule);
        // Reloading the molecule discards the lasso selection that picked the bond.
        reportSelectedBonds(editor);
      }
    } finally {
      onSnapCompleteRef.current?.(outcome);
    }
  }, [snapRequest, ready, reportSelectedBonds, emitMolfile]);

  // --- click-to-pick bond mode ----------------------------------------------
  //
  // The molecule OpenChemLib edits keeps its atom coordinates in the drawing
  // canvas's device-pixel space (the fork's pointer glue forwards
  // `offset * devicePixelRatio` straight into `Molecule.findBond`), so hit-testing
  // a pointer position needs no view transform — only the canvas's client rect and
  // the same device-pixel scale factor.

  /** Locate OCL's drawing canvas (not the toolbar) inside its open shadow root. */
  const resolvePickGeometry = useCallback(() => {
    const host = hostRef.current;
    if (!host) return null;
    const root = host.querySelector("[data-openchemlib-canvas-editor]");
    const canvas = root?.shadowRoot?.querySelector('canvas[tabindex="0"]') ?? null;
    // Mocked or unstyled editors (tests) have no canvas box; the host then shares
    // the overlay's origin, which keeps the mapping consistent.
    const rect = (canvas ?? host).getBoundingClientRect();
    return { rect, scale: window.devicePixelRatio || 1 };
  }, []);

  /** The bond under a pointer event, or -1, plus the geometry used to find it. */
  const findBondAtPointer = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const editor = editorRef.current;
      const geometry = resolvePickGeometry();
      if (!editor || !geometry) return null;
      try {
        // The full editor molecule satisfies BondPickMolecule structurally.
        const molecule = editor.getMolecule();
        const bond = molecule.findBond(
          (event.clientX - geometry.rect.left) * geometry.scale,
          (event.clientY - geometry.rect.top) * geometry.scale,
        );
        return { molecule, bond, geometry };
      } catch {
        return null; /* molecule can be transiently invalid mid-edit */
      }
    },
    [resolvePickGeometry],
  );

  const handlePickPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const hit = findBondAtPointer(event);
      if (!hit || hit.bond < 0) {
        setPickHover(null);
        return;
      }
      const { molecule, bond, geometry } = hit;
      const overlayRect = event.currentTarget.getBoundingClientRect();
      const offsetX = geometry.rect.left - overlayRect.left;
      const offsetY = geometry.rect.top - overlayRect.top;
      const atom0 = molecule.getBondAtom(0, bond);
      const atom1 = molecule.getBondAtom(1, bond);
      setPickHover({
        bond,
        x1: molecule.getAtomX(atom0) / geometry.scale + offsetX,
        y1: molecule.getAtomY(atom0) / geometry.scale + offsetY,
        x2: molecule.getAtomX(atom1) / geometry.scale + offsetX,
        y2: molecule.getAtomY(atom1) / geometry.scale + offsetY,
      });
    },
    [findBondAtPointer],
  );

  const handlePickClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Recompute from the click position rather than trusting hover state, which
      // can be stale (touch input never hovers).
      const hit = findBondAtPointer(event);
      if (!hit || hit.bond < 0) return; // a miss keeps pick mode armed
      const editor = editorRef.current;
      if (!editor) return;

      // Bold mode: flip the clicked bond and stay armed so several bonds can be
      // bolded in a row. The MOL block is untouched — only the depiction changes.
      if (boldToggleActive) {
        try {
          hit.molecule.setBondBold(hit.bond, !hit.molecule.isBondBold(hit.bond));
          editor.setMolecule(hit.molecule);
          onBoldBondsChangeRef.current?.(readBoldBonds(hit.molecule));
        } catch {
          /* molecule can be transiently invalid mid-edit; ignore */
        }
        return;
      }

      let outcome: MoleculeSnapOutcome = { kind: "bond-vertical", status: "failed" };
      try {
        outcome = applyBondVertical(hit.molecule, hit.bond);
        if (outcome.status === "applied") {
          editor.setMolecule(hit.molecule);
          emitMolfile(hit.molecule);
          reportSelectedBonds(editor);
        }
      } finally {
        setPickHover(null);
        onBondPickCompleteRef.current?.(outcome);
      }
    },
    [findBondAtPointer, reportSelectedBonds, boldToggleActive, emitMolfile],
  );

  // Escape cancels pick mode from anywhere, including while the canvas has focus.
  useEffect(() => {
    if (!bondPickActive && !boldToggleActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (boldToggleActive) onBoldToggleExitRef.current?.();
      else onBondPickCompleteRef.current?.({ kind: "bond-vertical", status: "canceled" });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [bondPickActive, boldToggleActive]);

  // Leaving pick mode for any reason drops the highlight.
  useEffect(() => {
    if (!bondPickActive && !boldToggleActive) setPickHover(null);
  }, [bondPickActive, boldToggleActive]);

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
          <p className="theme-text-muted mt-1 text-sm">
            OpenChemLib failed to load, so atoms and bonds can&apos;t be edited. Reload the page to
            try again.
          </p>
          <p className="theme-text-faint mt-1 break-words font-mono text-xs">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <EditorToolbar label="Drawing tools" variant="compact" className="shrink-0">
        <EditorActionGroup label="Draw">
          <span aria-hidden="true" className={GROUP_LABEL_CLASS}>
            Draw
          </span>
          {OCL_TOOLS.map((tool) => {
            const active = activeTool === tool.id;
            return (
              <Button
                key={tool.id}
                variant={active ? "accent" : "outline"}
                size="sm"
                aria-pressed={active}
                disabled={!canvases}
                title={`${tool.hint} (${tool.key})`}
                onClick={() => chooseTool(tool.id)}
              >
                <ToolGlyph tool={tool.id} />
                {tool.label}
              </Button>
            );
          })}
        </EditorActionGroup>
        <EditorActionGroup label="History" separatorBefore>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canvases}
            title="Undo the last drawing step (Cmd or Ctrl+Z on the canvas)"
            onClick={() => pressToolbarButton(OCL_UNDO_BUTTON)}
          >
            <Icon icon="lucide:undo-2" size={15} />
            Undo
          </Button>
        </EditorActionGroup>
        <ExpandButton
          className="ml-auto"
          variant="inline"
          isExpanded={nativeToolbarOpen}
          onToggle={() => setNativeToolbarOpen((open) => !open)}
          label={nativeToolbarOpen ? "Fewer tools" : "All tools"}
          ariaLabel={
            nativeToolbarOpen
              ? "Hide OpenChemLib's full toolbar"
              : "Show OpenChemLib's full toolbar (rings, chains, charges, more atoms)"
          }
        />
      </EditorToolbar>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions --
          keydown is only observed here to mirror OpenChemLib's own shortcuts; the
          focusable target is its drawing canvas inside the shadow root. */}
      <div
        className="relative isolate min-h-0 flex-1 overflow-hidden rounded-lg bg-dose-body"
        onKeyDown={handleHostKeyDown}
      >
        <div ref={hostRef} className={cn("absolute inset-0", styles.host)} />
        {children}
        {(bondPickActive || boldToggleActive) && ready ? (
          /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions --
             pointer-only like the OCL canvas beneath it (an accepted limitation of this
             editor-only tool); Escape is handled globally and the toolbar button cancels. */
          <div
            data-testid="bond-pick-overlay"
            className="absolute inset-0 z-10 cursor-crosshair"
            onPointerMove={handlePickPointerMove}
            onPointerLeave={() => setPickHover(null)}
            onClick={handlePickClick}
          >
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              {pickHover ? (
                <g className="text-dose-accent-strong">
                  <line
                    x1={pickHover.x1}
                    y1={pickHover.y1}
                    x2={pickHover.x2}
                    y2={pickHover.y2}
                    stroke="currentColor"
                    strokeWidth={8}
                    strokeLinecap="round"
                    opacity={0.45}
                  />
                  <circle cx={pickHover.x1} cy={pickHover.y1} r={4} fill="currentColor" />
                  <circle cx={pickHover.x2} cy={pickHover.y2} r={4} fill="currentColor" />
                </g>
              ) : null}
            </svg>
            <span className="theme-text-primary pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full border border-dose-border bg-dose-surface-muted px-3 py-1 text-sm font-medium shadow-[var(--theme-elevation-lg)]">
              {boldToggleActive
                ? "Click bonds to toggle bold · Esc to finish"
                : "Click the bond to set vertical · Esc to cancel"}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const GROUP_LABEL_CLASS = "theme-text-faint text-xs font-medium uppercase tracking-wide";

/** Lucide-style glyphs for the strip; wedge, hash and bond have no library icon. */
function ToolGlyph({ tool }: { tool: OclToolId }) {
  if (tool === "select") return <Icon icon="lucide:lasso-select" size={15} />;
  if (tool === "atom") return <Icon icon="lucide:atom" size={15} />;
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {tool === "bond" ? (
        <path d="M5 19 19 5" />
      ) : tool === "wedge" ? (
        <path d="M4 20 17 3l4 4Z" fill="currentColor" />
      ) : tool === "hash" ? (
        <>
          <path d="M5.3 16.5 7.5 18.7" />
          <path d="M7.9 12.7 11.3 16.1" />
          <path d="M10.5 8.9 15.1 13.5" />
          <path d="M13.2 5.2 18.8 10.8" />
          <path d="M15.8 1.4 22.6 8.2" />
        </>
      ) : (
        <>
          <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
          <path d="M22 21H7" />
          <path d="m5 11 9 9" />
        </>
      )}
    </svg>
  );
}
