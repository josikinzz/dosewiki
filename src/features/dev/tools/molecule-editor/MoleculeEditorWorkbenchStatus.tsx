import { EditorStatusPill } from "@/features/dev/components";
import type { InchiComparison } from "./stereoGuard";
import type { EditorMode } from "./moleculeEditorTypes";

export function MoleculeGuardStatus({
  guard,
  hasReference,
  active,
  mode,
}: {
  guard: InchiComparison | null;
  hasReference: boolean;
  active: boolean;
  mode: EditorMode;
}) {
  const mismatch = guard != null && !guard.match;
  let pill = (
    <EditorStatusPill tone="neutral">{active ? "checking…" : "no molecule"}</EditorStatusPill>
  );
  if (active && !hasReference) {
    pill = <EditorStatusPill tone="neutral">no reference SMILES</EditorStatusPill>;
  } else if (guard) {
    pill = guard.match ? (
      <EditorStatusPill tone="success" icon="lucide:shield-check" live>same molecule</EditorStatusPill>
    ) : (
      <EditorStatusPill tone="danger" icon="lucide:triangle-alert" live>molecule changed</EditorStatusPill>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="theme-text-faint text-xs font-medium uppercase tracking-wide">
        {mode === "substances" ? "Stereo guard" : "Structure guard"}
      </span>
      {pill}
      {mismatch ? (
        <p className="theme-danger-text basis-full text-xs sm:basis-auto">
          {mode === "classes" || mode === "templates"
            ? "This changed the canonical class structure, not just the drawing. Saving keeps that change."
            : "This changed the actual molecule, not just the drawing. Saving publishes the changed chemistry."}
        </p>
      ) : null}
    </div>
  );
}

export function MoleculePreview({
  svg,
  ready,
  hasSelection,
  error,
}: {
  svg: string | null;
  ready: boolean;
  hasSelection: boolean;
  error: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="theme-text-faint text-xs font-medium uppercase tracking-wide">Brand preview</span>
      <div className="grid h-28 w-28 place-items-center rounded-xl border border-dose-border bg-dose-surface-muted p-2">
        {svg ? (
          <div
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full [&>svg]:object-contain"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : error ? (
          <span className="theme-danger-text text-center text-[11px] leading-tight">Renderer unavailable</span>
        ) : (
          <span className="theme-text-faint text-center text-[11px] leading-tight">
            {!hasSelection ? "Pick a molecule" : !ready ? "Loading…" : "Rendering…"}
          </span>
        )}
      </div>
    </div>
  );
}
