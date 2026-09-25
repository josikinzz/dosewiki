import { useId } from "react";
import { Input } from "@/components/ui";
import { EditorField, EditorStatusPill } from "@/features/dev/components";
import { describeInchi } from "./chemistryDiff";
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
            ? "This changed the canonical class structure, not just the drawing. Check the before and after below."
            : "This changed the actual molecule, not just the drawing. Check the before and after below."}
        </p>
      ) : null}
    </div>
  );
}

function stereoText(summary: ReturnType<typeof describeInchi>): string {
  if (!summary) return "Unknown";
  return summary.stereoLayer
    ? `${summary.stereocentres} (${summary.stereoLayer})`
    : String(summary.stereocentres);
}

/**
 * Before and after identity of a structure whose chemistry changed, read from
 * the guard's comparison. Substances compare by InChI, whose layers give the
 * formula and stereocentres; classes and templates compare by canonical
 * SMILES, which has no layers to break out. When `publishName` is set, the
 * chemist types it to unlock Publish.
 */
export function ChemistryChangePanel({
  guard,
  mode,
  publishName,
  confirmName,
  onConfirmNameChange,
}: {
  guard: InchiComparison;
  mode: EditorMode;
  publishName: string | null;
  confirmName: string;
  onConfirmNameChange: (value: string) => void;
}) {
  const headingId = useId();
  const byInchi = mode === "substances";
  const before = byInchi ? describeInchi(guard.inchiOriginal) : null;
  const after = byInchi ? describeInchi(guard.inchiEdited) : null;
  const rows: Array<{ label: string; before: string; after: string; mono?: boolean }> = [
    {
      label: byInchi ? "InChI" : "Canonical SMILES",
      before: guard.inchiOriginal || "Could not be read",
      after: guard.inchiEdited || "Could not be read",
      mono: true,
    },
  ];
  if (byInchi) {
    rows.push(
      { label: "Formula", before: before?.formula ?? "Unknown", after: after?.formula ?? "Unknown" },
      { label: "Stereocentres", before: stereoText(before), after: stereoText(after) },
    );
  }
  return (
    <section
      aria-labelledby={headingId}
      className="basis-full space-y-3 rounded-lg border border-[color:var(--theme-danger-border)] bg-[var(--theme-danger-bg)] p-3"
    >
      <h3 id={headingId} className="theme-danger-text text-sm font-semibold">
        Changed chemistry
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="theme-text-faint font-medium">{row.label}</dt>
            <dd className="min-w-0 space-y-0.5">
              <p className="theme-text-muted">
                <span className="theme-text-faint">Before: </span>
                <span className={row.mono ? "break-all font-mono" : undefined}>{row.before}</span>
              </p>
              <p className="theme-text-primary">
                <span className="theme-text-faint">After: </span>
                <span className={row.mono ? "break-all font-mono" : undefined}>{row.after}</span>
              </p>
            </dd>
          </div>
        ))}
      </dl>
      {publishName ? (
        <EditorField
          label={`Type ${publishName} to publish this change`}
          description="Publishing replaces the live structure on the public page."
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              value={confirmName}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => onConfirmNameChange(event.target.value)}
              className="max-w-xs"
            />
          )}
        </EditorField>
      ) : null}
    </section>
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
