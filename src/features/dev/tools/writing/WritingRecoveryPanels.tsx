"use client";

import { Button } from "@/components/ui/button";
import { EditorNotice, EditorSection, EditorToolbar } from "@/features/dev/components";
import { formatCheckpointTime } from "@/features/dev/recovery/draftRecovery";

import type { WritingDraft } from "./writingEditorModel";
import type { WritingWorkbenchController } from "./useWritingWorkbenchController";

function fieldText(value: WritingDraft[keyof WritingDraft]): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

/**
 * The browser recovery copy of the open record, when one outlived the page:
 * the offer to restore or discard it, then, for a copy made against an older
 * saved version, a field-by-field review that keeps both until the editor
 * picks. Nothing here writes to the server.
 */
export function WritingRecoveryPanels({
  controller,
  fieldLabels,
}: {
  controller: WritingWorkbenchController;
  fieldLabels: Record<keyof WritingDraft, string>;
}) {
  const { recoveryOffer: offer, recoveryReview: review } = controller;

  if (offer) {
    const time = formatCheckpointTime(offer.checkpoint.savedAt);
    const pending = offer.checkpoint.pending !== undefined;
    return (
      <section aria-label="Recovered changes">
        <EditorNotice
          notice={{
            tone: "warning",
            title: pending ? "Unconfirmed save found" : "Unsaved changes found",
            message: pending
              ? `A save was sent but never confirmed before this page closed (kept in this browser at ${time}). Restore it to confirm that exact save; it is never sent as a new one.`
              : offer.stale
                ? `Unsaved changes from this browser, saved at ${time}. The saved version changed after this copy was made, so Review shows both side by side and overwrites nothing.`
                : `Unsaved changes from this browser, saved at ${time}. Restore them, or discard them and keep the saved version.`,
            actions: (
              <span className="flex gap-2">
                <Button type="button" variant="accent" size="sm" onClick={controller.restoreRecovery}>
                  {offer.stale && !pending ? "Review" : "Restore"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={controller.discardRecovery}>
                  Discard
                </Button>
              </span>
            ),
          }}
        />
      </section>
    );
  }

  if (review) {
    return (
      <section aria-label="Review recovered changes">
        <EditorSection
          headingLevel="h3"
          title="Review recovered changes"
          description="Someone saved this page after your copy was made. The latest saved version is in the editor; take any field from your copy. Nothing is saved until you save."
        >
          {review.fields.length === 0 ? (
            <p className="theme-text-muted text-sm">Your copy matches the latest saved version.</p>
          ) : null}
          {review.fields.map((key) => (
            <div key={key} className="min-w-0 space-y-2">
              <h4 className="font-semibold">{fieldLabels[key]}</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="min-w-0">
                  <p className="theme-text-muted text-sm">Latest saved version</p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{fieldText(controller.baseline[key])}</pre>
                </div>
                <div className="min-w-0">
                  <p className="theme-text-muted text-sm">Your recovered copy</p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{fieldText(review.recovered[key])}</pre>
                </div>
              </div>
              {review.used.includes(key) ? (
                <p className="theme-text-muted text-sm">Using your recovered copy.</p>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Use recovered ${fieldLabels[key]}`}
                  onClick={() => controller.takeRecoveredField(key)}
                >
                  Use recovered
                </Button>
              )}
            </div>
          ))}
          <EditorToolbar>
            <Button type="button" variant="accent" size="sm" onClick={controller.finishRecoveryReview}>
              Done reviewing
            </Button>
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
