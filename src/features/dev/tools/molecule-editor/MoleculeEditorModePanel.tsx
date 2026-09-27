"use client";

/**
 * The open structure's other starting points and its load failures. Picking
 * the kind of structure and the record moved to the list column
 * (`MoleculeListColumn`); what stays here replaces the canvas: another saved
 * structure as an analogue or scaffold, or pasted SMILES as an automatic
 * layout. Each asks first over unsaved work (the session owns that).
 */
import { useId } from "react";
import { Icon } from "@/components/common/Icon";
import { Button, Input } from "@/components/ui";
import { EditorField, LoadErrorState, Notice } from "@/features/dev/components";
import type { MoleculePickerItem } from "./moleculePickerOrdering";
import type { EditorMode } from "./moleculeEditorTypes";
import { SubstanceCombobox } from "./MoleculeEditorPickers";

export function MoleculeStartingPoints({
  mode,
  importableMolecules,
  importSlug,
  onImportSlugChange,
  importing,
  saving,
  loadTimedOut,
  onImportStructure,
  pasteSmilesInput,
  onPasteSmilesInputChange,
  onImportSmiles,
  onRevertToAuto,
  canRevertToAuto,
}: {
  mode: EditorMode;
  importableMolecules: MoleculePickerItem[] | null;
  importSlug: string | null;
  onImportSlugChange: (slug: string) => void;
  importing: boolean;
  saving: boolean;
  loadTimedOut: boolean;
  onImportStructure: () => void;
  pasteSmilesInput: string;
  onPasteSmilesInputChange: (smiles: string) => void;
  onImportSmiles: () => void;
  /** Local SMILES layout on the canvas; nothing publishes until Save. Not offered for templates. */
  onRevertToAuto: () => void;
  canRevertToAuto: boolean;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="space-y-1">
        <h4 id={headingId} className="theme-text-primary text-base font-semibold">Start from something else</h4>
        <p className="theme-text-muted max-w-[70ch] text-sm">
          Each replaces the canvas and publishes nothing until you save. Unsaved edits are asked about first.
        </p>
      </div>
      <div className={mode === "templates" ? "grid gap-5 md:grid-cols-2" : "grid gap-5 md:grid-cols-2 2xl:grid-cols-3"}>
        {mode !== "templates" ? (
          <div className="space-y-2">
            <p className="theme-text-primary text-sm font-medium">The automatic layout</p>
            <p className="theme-text-muted text-xs">
              {mode === "classes"
                ? "The generic layout drawn from the class SMILES, on the canvas only."
                : "A fresh layout drawn from the article's SMILES, on the canvas only."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onRevertToAuto}
              disabled={!canRevertToAuto}
              title="Regenerate the layout from SMILES on the canvas; the public page changes only after Save"
            >
              <Icon icon="lucide:rotate-ccw" size={15} />
              Revert to auto
            </Button>
          </div>
        ) : null}
        <div className="space-y-2">
          <p className="theme-text-primary text-sm font-medium">
            {mode === "substances" ? "Another substance's depiction" : "A saved structure"}
          </p>
          <p className="theme-text-muted text-xs">
            {mode === "substances"
              ? "Good for drawing an analogue of an existing molecule."
              : mode === "templates"
                ? "R-group placeholders are stripped so the template stays a plain scaffold."
                : "Start the class drawing from any saved structure."}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <SubstanceCombobox
              label="Select a structure to import"
              molecules={importableMolecules}
              selected={importSlug}
              onSelect={onImportSlugChange}
              loadTimedOut={loadTimedOut}
              mode="substances"
              placeholder="Choose a saved structure"
              searchPlaceholder="Search saved depictions"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={onImportStructure}
              disabled={!importSlug || importing || saving}
              title="Replace the canvas with that saved drawing as a starting point"
            >
              <Icon icon={importing ? "lucide:loader-circle" : "lucide:import"} size={15} className={importing ? "motion-safe:animate-spin" : undefined} />
              Load structure
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <EditorField
            label="Pasted SMILES"
            description="Automatic layout: a starting point to tidy, not a finished drawing."
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                value={pasteSmilesInput}
                onChange={(event) => onPasteSmilesInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && pasteSmilesInput.trim() && !importing && !saving) {
                    event.preventDefault();
                    onImportSmiles();
                  }
                }}
                placeholder="CC(CC1=CC=CC=C1)N"
                aria-label="SMILES to load into the canvas"
                autoComplete="off"
                spellCheck={false}
                disabled={importing || saving}
                inputSize="sm"
                className="font-mono"
              />
            )}
          </EditorField>
          <Button
            variant="outline"
            size="sm"
            onClick={onImportSmiles}
            disabled={!pasteSmilesInput.trim() || importing || saving}
            title="Replace the canvas with an automatic layout of this SMILES"
          >
            <Icon icon={importing ? "lucide:loader-circle" : "lucide:sparkles"} size={15} className={importing ? "motion-safe:animate-spin" : undefined} />
            Load SMILES
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Reads that failed for the open record, each with its way forward. */
export function MoleculeLoadNotices({
  mode,
  templateLoadError,
  overrideLoadError,
  onRetryOverride,
  sourceError,
  onRetrySource,
  membersError,
  onRetryMembers,
}: {
  mode: EditorMode;
  templateLoadError: string | null;
  overrideLoadError: string | null;
  onRetryOverride: () => void;
  sourceError: string | null;
  onRetrySource: () => void;
  membersError: string | null;
  onRetryMembers: () => void;
}) {
  return (
    <>
      {mode === "templates" && templateLoadError ? (
        <Notice tone="danger" title="Couldn't load template" message={templateLoadError} />
      ) : null}
      {mode !== "templates" && overrideLoadError ? (
        <div className="space-y-2">
          <Notice tone="danger" title="Couldn't load depiction" message={overrideLoadError} />
          <Button type="button" variant="outline" size="sm" onClick={onRetryOverride}>
            <Icon icon="lucide:rotate-cw" size={14} />
            Try again
          </Button>
        </div>
      ) : null}
      {mode === "substances" && sourceError ? (
        <LoadErrorState what="this substance's SMILES" message={sourceError} onRetry={onRetrySource} />
      ) : null}
      {mode === "templates" && membersError ? (
        <LoadErrorState what="the class members" message={membersError} onRetry={onRetryMembers} />
      ) : null}
    </>
  );
}
