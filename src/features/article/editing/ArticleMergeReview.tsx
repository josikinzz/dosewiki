"use client";

import { MergeConflictChoices } from "@/features/dev/components/MergeConflictChoices";
import { ARTICLE_PATCH_FIELDS, type ArticleFieldChange } from "../../../../lib/proposals/articlePatch";
import type { MergeSide, ThreeWayMerge } from "../../../../lib/proposals/threeWayMerge";
import { ArticleChangeDiff, displayValue } from "./ArticleChangeDiff";
import { placeWords } from "./changeNote";

/** "References › Order" for a reorder, else the field's place in words. */
export function mergePlaceWords(path: string): string {
  return path.endsWith(" order") ? `${placeWords(path.slice(0, -" order".length))} › Order` : placeWords(path);
}

/** The carried changes an editor reads: article fields, not identity or review bookkeeping. */
function articleFields(changes: ArticleFieldChange[]): ArticleFieldChange[] {
  return changes.filter((change) => (ARTICLE_PATCH_FIELDS as readonly string[]).includes(change.path.split(/[.[ ]/, 1)[0]));
}

/**
 * A merge of the local article draft with a newer published article, read by
 * who changed what: the fields both changed, each waiting on a choice, then
 * the changes each side made alone, which the merged draft already keeps.
 */
export function ArticleMergeReview({ merge, choices, onChoose }: {
  merge: ThreeWayMerge<unknown>;
  choices: Readonly<Record<string, MergeSide>>;
  onChoose: (path: string, side: MergeSide) => void;
}) {
  const mine = articleFields(merge.mine), theirs = articleFields(merge.theirs);
  return <div className="min-w-0 space-y-6">
    <MergeConflictChoices conflicts={merge.conflicts} choices={choices} onChoose={onChoose} label={mergePlaceWords} format={displayValue} />
    <section aria-label="Your changes, kept" className="min-w-0 space-y-3">
      <h3 className="theme-text-primary font-semibold">You changed, kept in the merged draft</h3>
      {mine.length === 0
        ? <p className="theme-text-muted text-sm">None apart from the fields above.</p>
        : <ArticleChangeDiff changes={mine} />}
    </section>
    <section aria-label="Someone else's changes, kept" className="min-w-0 space-y-3">
      <h3 className="theme-text-primary font-semibold">Someone else changed, kept in the merged draft</h3>
      {theirs.length === 0
        ? <p className="theme-text-muted text-sm">None apart from the fields above.</p>
        : <ArticleChangeDiff changes={theirs} />}
    </section>
  </div>;
}
