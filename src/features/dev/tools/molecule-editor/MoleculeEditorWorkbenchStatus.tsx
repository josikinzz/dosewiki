import { useId } from "react";
import { Icon } from "@/components/common/Icon";
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
    <EditorStatusPill tone="neutral" icon="lucide:loader-circle">{active ? "Checking" : "No molecule"}</EditorStatusPill>
  );
  let sentence: string | null = active ? "Comparing the drawing with the original chemistry." : null;
  if (active && !hasReference) {
    pill = <EditorStatusPill tone="neutral">No reference SMILES</EditorStatusPill>;
    sentence = "There is no SMILES to compare with, so a changed molecule cannot be caught.";
  } else if (guard) {
    pill = guard.match ? (
      <EditorStatusPill tone="success" icon="lucide:shield-check" live>Same molecule</EditorStatusPill>
    ) : (
      <EditorStatusPill tone="danger" icon="lucide:triangle-alert" live>Molecule changed</EditorStatusPill>
    );
    sentence = guard.match
      ? mode === "substances"
        ? "The drawing still encodes the same molecule, stereocentres included."
        : "The drawing still encodes the same class structure."
      : mode === "classes" || mode === "templates"
        ? "This changed the canonical class structure, not just the drawing. Check Changed chemistry above."
        : "This changed the actual molecule, not just the drawing. Check Changed chemistry above.";
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="type-meta-label theme-text-muted">
        {mode === "substances" ? "Stereo guard" : "Structure guard"}
      </span>
      {pill}
      {sentence ? (
        <p className={mismatch ? "theme-danger-text min-w-0 basis-full text-xs sm:basis-auto sm:flex-1" : "theme-text-faint min-w-0 basis-full text-xs max-sm:sr-only sm:basis-auto sm:flex-1"}>
          {sentence}
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
      className="theme-danger-panel space-y-3 rounded-card border p-4"
    >
      <div className="space-y-1">
        <h4 id={headingId} className="theme-danger-text flex items-center gap-2 text-base font-semibold">
          <Icon icon="lucide:triangle-alert" size={16} />
          Changed chemistry
        </h4>
        <p className="theme-text-secondary max-w-[70ch] text-sm">
          {mode === "substances"
            ? "The drawing is now a different molecule, not a redrawing of the same one. Check the identity below before it goes live."
            : "The drawing now encodes a different class structure. Check it below before saving."}
        </p>
      </div>
      <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[auto_1fr]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="type-meta-label theme-text-muted sm:pt-0.5">{row.label}</dt>
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
              inputSize="sm"
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
    <figure className="flex flex-col gap-1.5">
      <figcaption className="type-meta-label theme-text-muted">Brand preview</figcaption>
      <div className="grid aspect-square w-full max-w-[15rem] place-items-center rounded-card border border-dose-border bg-dose-surface-muted p-3">
        {svg ? (
          <div
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full [&>svg]:object-contain"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : error ? (
          <span className="theme-danger-text text-center text-xs leading-tight">Renderer unavailable</span>
        ) : (
          <span className="theme-text-faint text-center text-xs leading-tight">
            {!hasSelection ? "No structure to draw" : !ready ? "Loading" : "Rendering"}
          </span>
        )}
      </div>
      <p className="theme-text-faint text-xs">The same image Save publishes.</p>
    </figure>
  );
}

/**
 * What a publish replaces, side by side: the stored image readers see now and
 * the one the canvas would publish. Rendered in the publish confirm.
 */
export function MoleculePublishReview({
  before,
  after,
  chemistryChanged,
  beforeEmpty,
}: {
  before: string | null;
  after: string | null;
  chemistryChanged: boolean;
  beforeEmpty: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <PublishFigure label="Live now" svg={before} empty={beforeEmpty} />
        <PublishFigure label="After publishing" svg={after} empty="Rendering" />
      </div>
      {chemistryChanged ? (
        <p className="theme-danger-text text-sm">
          The chemistry changed: this publishes a different molecule, not a redrawing.
        </p>
      ) : null}
    </div>
  );
}

function PublishFigure({ label, svg, empty }: { label: string; svg: string | null; empty: string }) {
  return (
    <figure className="min-w-0 space-y-1.5">
      <figcaption className="type-meta-label theme-text-muted">{label}</figcaption>
      <div className="grid aspect-[4/3] place-items-center rounded-card border border-dose-border bg-dose-surface-muted p-3">
        {svg ? (
          <div
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
            // The editor's own renderer output, or the stored image it published.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <span className="theme-text-faint text-center text-xs">{empty}</span>
        )}
      </div>
    </figure>
  );
}
