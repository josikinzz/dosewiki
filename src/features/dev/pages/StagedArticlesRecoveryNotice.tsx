"use client";

import { Button } from "@/components/ui/button";
import { Notice } from "../components/Notice";
import { useConfirm } from "../components/ConfirmDialog";
import { formatCheckpointTime } from "../recovery/draftRecovery";
import { MergeConflictChoices } from "../components/MergeConflictChoices";
import { displayValue } from "@/features/article/editing/ArticleChangeDiff";
import { mergePlaceWords } from "@/features/article/editing/ArticleMergeReview";
import type { StagedArticlesRecovery } from "./useStagedArticlesRecovery";

/** Top-level article keys in words, for the held rows ("index_categories" reads "index categories"). */
function fieldWords(keys: readonly string[]): string {
  if (keys.length === 0) return "no fields";
  return keys.map((key) => key.replace(/_/g, " ")).join(", ");
}

function articleCount(count: number): string {
  return `${count} ${count === 1 ? "article" : "articles"}`;
}

/**
 * The shell's view of the staged working set's recovery copy: the offer to
 * restore uncommitted article edits after a reload, and the edits held aside
 * because their article changed since. Restoring never commits.
 */
export function StagedArticlesRecoveryNotice({
  recovery,
  showSaveTime,
}: {
  recovery: StagedArticlesRecovery;
  /** The tool that commits the set is open, so the last copy time belongs on screen. */
  showSaveTime: boolean;
}) {
  const { offer, held } = recovery;
  // Discarding deletes this browser's only copy of the edits, so it asks.
  const { confirm, dialog } = useConfirm();
  const confirmDiscard = (count: number, discard: () => void) => confirm({
    title: `Discard ${articleCount(count)} of recovered edits?`,
    description: "This browser's copy is deleted and cannot be restored.",
    confirmLabel: "Discard",
    destructive: true,
    onConfirm: discard,
  });
  if (offer) {
    const count = offer.draft.changes.length;
    return (
      <section aria-label="Recovered article edits" className="mb-4">
        <Notice
          tone="warning" title="Uncommitted article edits found" message={(
              <>
                {`Edits to ${articleCount(count)} from this browser, saved at ${formatCheckpointTime(offer.savedAt)}, were never committed. Restore puts them back as uncommitted edits; nothing is committed until you commit.`}
                {recovery.error ? <span role="alert" className="mt-1 block">{recovery.error}</span> : null}
              </>
            )} actions={(
              <span className="flex gap-2">
                <Button type="button" variant="accent" size="sm" disabled={recovery.restoring} aria-busy={recovery.restoring || undefined} onClick={() => void recovery.restore()}>
                  {recovery.restoring ? "Restoring" : "Restore"}
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={recovery.restoring} onClick={() => confirmDiscard(count, recovery.discardOffer)}>
                  Discard
                </Button>
              </span>
            )}
        />
        {dialog}
      </section>
    );
  }

  if (held) {
    return (
      <section aria-label="Article edits held aside" className="mb-4">
        <Notice
          tone="warning" title={`${articleCount(held.length)} not restored`} message={(
              <>
                <span className="block">
                  These articles changed after your copy was made, or could not be loaded. Your edits are kept aside and the newer version stays in place until you choose. Applying merges your edits into the newer version; a field you both changed needs your choice first.
                </span>
                <ul className="mt-2 space-y-3">
                  {held.map(({ change, current, merge, choices }) => (
                    <li key={change.slug} className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1">
                          {`${current?.title?.trim() || change.slug}: ${fieldWords(Object.keys(change.set).concat(change.unset))}`}
                        </span>
                        {current ? (
                          <Button type="button" variant="outline" size="sm" disabled={!!merge && merge.unresolved.length > 0} aria-label={`Apply my edits to ${change.slug}`} onClick={() => recovery.applyHeld(change.slug)}>
                            Apply my edits
                          </Button>
                        ) : null}
                      </div>
                      {merge ? (
                        <MergeConflictChoices
                          conflicts={merge.conflicts}
                          choices={choices}
                          onChoose={(path, side) => recovery.chooseHeld(change.slug, path, side)}
                          label={mergePlaceWords}
                          format={displayValue}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            )} actions={(
              <Button type="button" variant="ghost" size="sm" onClick={() => confirmDiscard(held.length, recovery.dismissHeld)}>
                Discard the rest
              </Button>
            )}
        />
        {dialog}
      </section>
    );
  }

  if (showSaveTime && recovery.checkpointSavedAt !== null) {
    return (
      <p role="status" className="theme-text-faint mb-4 text-xs">
        {`Uncommitted article edits kept in this browser at ${formatCheckpointTime(recovery.checkpointSavedAt)}. Only you can restore them here.`}
      </p>
    );
  }

  return null;
}
