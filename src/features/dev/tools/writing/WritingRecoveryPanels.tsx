"use client";

import { Button } from "@/components/ui/button";
import { Notice, EditorSection, EditorToolbar, MERGE_CONFLICT_COPY, MergeConflictChoices, unresolvedConflictText } from "@/features/dev/components";
import { formatCheckpointTime } from "@/features/dev/recovery/draftRecovery";

import type { WritingDraft } from "./writingEditorModel";
import type { WritingWorkbenchController } from "./useWritingWorkbenchController";

function fieldText(value: unknown): string {
  if (value === undefined) return "Not present";
  if (Array.isArray(value)) return value.length === 0 ? "None" : value.join(", ");
  return typeof value === "string" ? value || "Empty" : JSON.stringify(value, null, 2);
}

/** The fields one side's carried changes touched, in words, once each. */
function changedFields(paths: string[], fieldLabels: Record<keyof WritingDraft, string>): string {
  const labels = [...new Set(paths.map((path) => fieldLabels[path as keyof WritingDraft] ?? path))];
  return labels.join(", ");
}

/**
 * The browser recovery copy of the open record, when one outlived the page,
 * and the merge review a newer saved version opens: the offer to restore or
 * discard a copy, then, for a copy made against an older saved version or a
 * reload under open edits, what each side changed. Fields only one side
 * changed are already in the draft; each field both changed shows both
 * versions and waits for a choice. Nothing here writes to the server.
 */
export function WritingRecoveryPanels({
  controller,
  fieldLabels,
}: {
  controller: WritingWorkbenchController;
  fieldLabels: Record<keyof WritingDraft, string>;
}) {
  const { recoveryOffer: offer, mergeReview: review, merge } = controller;

  if (offer) {
    const time = formatCheckpointTime(offer.checkpoint.savedAt);
    const pending = offer.checkpoint.pending !== undefined;
    return (
      <section aria-label="Recovered changes">
        <Notice
          tone="warning" title={pending ? "Unconfirmed save found" : "Unsaved changes found"} message={pending
              ? `A save was sent but never confirmed before this page closed (kept in this browser at ${time}). Restore it to confirm that exact save; it is never sent as a new one.`
              : offer.stale
                ? `Unsaved changes from this browser, saved at ${time}. The saved version changed after this copy was made, so Review shows both side by side and overwrites nothing.`
                : `Unsaved changes from this browser, saved at ${time}. Restore them, or discard them and keep the saved version.`} actions={(
              <span className="flex gap-2">
                <Button type="button" variant="accent" size="sm" onClick={controller.restoreRecovery}>
                  {offer.stale && !pending ? "Review" : "Restore"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={controller.discardRecovery}>
                  Discard
                </Button>
              </span>
            )}
        />
      </section>
    );
  }

  if (review && merge) {
    const recovery = review.source === "recovery";
    const copy = recovery ? { ...MERGE_CONFLICT_COPY, useMine: "Use recovered", useTheirs: "Use latest saved" } : MERGE_CONFLICT_COPY;
    const mine = changedFields(merge.mine.map((change) => change.path), fieldLabels);
    const theirs = changedFields(merge.theirs.map((change) => change.path), fieldLabels);
    return (
      <section aria-label={recovery ? "Review recovered changes" : "Review changes saved meanwhile"}>
        <EditorSection
          headingLevel="h3"
          title={recovery ? "Review recovered changes" : "Review changes saved meanwhile"}
          description={`Someone saved this page after ${recovery ? "your copy was made" : "you started editing"}. The editor holds both sets of changes; a field you both changed keeps the latest saved version until you choose. Nothing is saved until you save.`}
        >
          {merge.conflicts.length === 0 && !mine && !theirs ? (
            <p className="theme-text-muted text-sm">{recovery ? "Your copy matches the latest saved version." : "Nothing changed on either side."}</p>
          ) : null}
          <MergeConflictChoices
            conflicts={merge.conflicts}
            choices={review.choices}
            onChoose={controller.chooseMerge}
            label={(path) => fieldLabels[path as keyof WritingDraft] ?? path}
            format={fieldText}
            copy={copy}
          />
          {mine ? <p className="theme-text-primary text-sm"><span className="font-medium">{`${MERGE_CONFLICT_COPY.mine}, kept: `}</span>{mine}</p> : null}
          {theirs ? <p className="theme-text-primary text-sm"><span className="font-medium">{`${MERGE_CONFLICT_COPY.theirs}, kept: `}</span>{theirs}</p> : null}
          <EditorToolbar>
            <Button type="button" variant="accent" size="sm" disabled={merge.unresolved.length > 0} onClick={controller.finishMergeReview}>
              Done reviewing
            </Button>
            {merge.unresolved.length > 0 ? <span className="theme-text-muted text-sm">{unresolvedConflictText(merge.unresolved.length)}</span> : null}
          </EditorToolbar>
        </EditorSection>
      </section>
    );
  }

  return null;
}

/** When the open record was last kept: in this browser while unsaved, or on the server once saved. */
export function WritingSaveTime({ controller }: { controller: WritingWorkbenchController }) {
  const text = controller.isDirty && controller.checkpointSavedAt !== null
    ? `Unsaved changes kept in this browser at ${formatCheckpointTime(controller.checkpointSavedAt)}. Only you can restore them here.`
    : !controller.isDirty && controller.savedAt !== null
      ? `Last saved at ${formatCheckpointTime(controller.savedAt)}.`
      : null;
  return text ? <p role="status" className="theme-text-faint text-xs">{text}</p> : null;
}
