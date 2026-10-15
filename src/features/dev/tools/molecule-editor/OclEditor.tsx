"use client";

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
  source: string | null;
  sourceEpoch?: number;
  atomLabels?: Readonly<Record<number, string>>;
  onChange: (molblock: string, displayedAtomLabels: Record<number, string>) => void;
  onError?: (message: string) => void;
  fineRotation?: boolean;
  mirrorDirection?: MoleculeMirrorDirection | null;
  onMirrorComplete?: () => void;
  snapRequest?: MoleculeSnapKind | null;
  onSnapComplete?: (outcome: MoleculeSnapOutcome) => void;
  onSelectedBondCountChange?: (count: number) => void;
  bondPickActive?: boolean;
  onBondPickComplete?: (outcome: MoleculeSnapOutcome) => void;
  boldBonds?: readonly number[];
  boldToggleActive?: boolean;
  onBoldBondsChange?: (bonds: number[]) => void;
  onBoldToggleExit?: () => void;
  className?: string;
  children?: ReactNode;
}

interface OclCanvases {
  toolbar: HTMLCanvasElement;
  editor: HTMLCanvasElement;
}

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
  const [canvases, setCanvases] = useState<OclCanvases | null>(null);
  const [activeTool, setActiveTool] = useState<OclToolId | null>("bond");
  const [nativeToolbarOpen, setNativeToolbarOpen] = useState(false);

  const reportSelectedBonds = useCallback((editor: CanvasEditorInstance) => {
    const report = onSelectedBondCountChangeRef.current;
    if (!report) return;
    try {
      report(countSelectedBonds(editor.getMolecule()));
    } catch {
    }
  }, []);

  const emitMolfile = useCallback((molecule: { toMolfile(): string }) => {
    const raw = molecule.toMolfile();
    onChangeRef.current(stripOclCustomLabelSgroups(raw), parseOclCustomLabelSgroups(raw));
  }, []);

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
          if (event.type === "selection") {
            reportSelectedBonds(ed);
            return;
          }
          if (!event.isUserEvent || event.type !== "molecule") return;
          try {
            const molecule = ed.getMolecule();
            emitMolfile(molecule);
            onBoldBondsChangeRef.current?.(readBoldBonds(molecule));
          } catch {
          }
          reportSelectedBonds(ed);
        });
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
      }
      editorRef.current = null;
      setCanvases(null);
    };
  }, [reportSelectedBonds, emitMolfile]);

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

  const handleHostKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tool = oclToolForShortcutKey(event.key);
    if (tool !== undefined) setActiveTool(tool);
  }, []);

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
      if (tool !== "atom") canvases?.editor.focus({ preventScroll: true });
    },
    [canvases, pressToolbarButton],
  );

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

  useEffect(() => {
    if (!ready) return;
    const ed = editorRef.current;
    const OCL = oclRef.current;
    if (!ed || !OCL) return;
    if (source) {
      try {
        const molecule = OCL.Molecule.fromMolfile(source);
        applyBoldBonds(molecule, boldBondsRef.current);
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
      }
    }
    reportSelectedBonds(ed);
  }, [source, sourceEpoch, ready, reportSelectedBonds]);

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
        reportSelectedBonds(editor);
      }
    } finally {
      onSnapCompleteRef.current?.(outcome);
    }
  }, [snapRequest, ready, reportSelectedBonds, emitMolfile]);

  const resolvePickGeometry = useCallback(() => {
    const host = hostRef.current;
    if (!host) return null;
    const root = host.querySelector("[data-openchemlib-canvas-editor]");
    const canvas = root?.shadowRoot?.querySelector('canvas[tabindex="0"]') ?? null;
    const rect = (canvas ?? host).getBoundingClientRect();
    return { rect, scale: window.devicePixelRatio || 1 };
  }, []);

  const findBondAtPointer = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const editor = editorRef.current;
      const geometry = resolvePickGeometry();
      if (!editor || !geometry) return null;
      try {
        const molecule = editor.getMolecule();
        const bond = molecule.findBond(
          (event.clientX - geometry.rect.left) * geometry.scale,
          (event.clientY - geometry.rect.top) * geometry.scale,
        );
        return { molecule, bond, geometry };
      } catch {
        return null;
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
      const hit = findBondAtPointer(event);
      if (!hit || hit.bond < 0) return;
      const editor = editorRef.current;
      if (!editor) return;

      if (boldToggleActive) {
        try {
          hit.molecule.setBondBold(hit.bond, !hit.molecule.isBondBold(hit.bond));
          editor.setMolecule(hit.molecule);
          onBoldBondsChangeRef.current?.(readBoldBonds(hit.molecule));
        } catch {
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
      <EditorToolbar label="Drawing tools" variant="compact" className="shrink-0 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:pb-1 [&_button]:shrink-0">
        <EditorActionGroup label="Draw" className="max-sm:flex-nowrap">
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
        <EditorActionGroup label="History" separatorBefore className="max-sm:flex-nowrap max-sm:border-l max-sm:border-t-0 max-sm:pl-3 max-sm:pt-0">
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
                ? "Click or tap bonds to toggle bold · Esc to finish"
                : "Click or tap the bond to set vertical · Esc to cancel"}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const GROUP_LABEL_CLASS = "type-meta-label theme-text-faint";

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
