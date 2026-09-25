"use client";

import { Button } from "@/components/ui/button";
import { EditorNotice } from "../components/EditorNotice";
import { formatCheckpointTime } from "../recovery/draftRecovery";
import type { StagedArticlesRecovery } from "./useStagedArticlesRecovery";

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
  if (offer) {
    const count = offer.draft.changes.length;
    return (
      <section aria-label="Recovered article edits" className="mb-4">
        <EditorNotice
          notice={{
            tone: "warning",
            title: "Uncommitted article edits found",
            message: (
              <>
                {`Edits to ${articleCount(count)} from this browser, saved at ${formatCheckpointTime(offer.savedAt)}, were never committed. Restore puts them back as uncommitted edits; nothing is committed until you commit.`}
                {recovery.error ? <span role="alert" className="mt-1 block">{recovery.error}</span> : null}
              </>
            ),
            actions: (
              <span className="flex gap-2">
                <Button type="button" variant="accent" size="sm" disabled={recovery.restoring} aria-busy={recovery.restoring || undefined} onClick={() => void recovery.restore()}>
                  {recovery.restoring ? "Restoring…" : "Restore"}
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={recovery.restoring} onClick={recovery.discardOffer}>
                  Discard
                </Button>
              </span>
            ),
          }}
        />
      </section>
    );
  }

  if (held) {
    return (
      <section aria-label="Article edits held aside" className="mb-4">
        <EditorNotice
          notice={{
            tone: "warning",
            title: `${articleCount(held.length)} not restored`,
            message: (
              <>
                <span className="block">
                  These articles changed after your copy was made, or could not be loaded. Your edits are kept aside and the newer version stays in place until you choose.
                </span>
                <ul className="mt-2 space-y-1.5">
                  {held.map(({ change, current }) => (
                    <li key={change.slug} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">
                        {`${change.slug}: ${Object.keys(change.set).concat(change.unset).join(", ") || "no fields"}`}
                      </span>
                      {current ? (
                        <Button type="button" variant="outline" size="sm" aria-label={`Apply my edits to ${change.slug}`} onClick={() => recovery.applyHeld(change.slug)}>
                          Apply my edits
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ),
            actions: (
              <Button type="button" variant="ghost" size="sm" onClick={recovery.dismissHeld}>
                Discard the rest
              </Button>
            ),
          }}
        />
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
