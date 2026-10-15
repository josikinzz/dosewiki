import { useUnsavedWork } from "../components/unsavedWork";

// Leaving drops the in-memory working set on its own; nothing more to clear.
const NO_OP = () => {};

/**
 * Reports the staged working set (article edits from Tags and a Change Review
 * proposal, and the three index layouts) to the unsaved-work registry, one
 * entry per tool that commits it. The set lives in the dev context above the
 * tool switch, so it registers here in the shell rather than inside Tags or
 * Index layout, which unmount on a rail click while the set stays. It
 * survives a rail switch (`keepsOnTabSwitch`) but not the editor, so only
 * Leave, sign-out and a browser unload stop for it; the rail still marks the
 * tool that holds it. There is no one-step save: Commit asks its own questions.
 */
export function useStagedSetUnsavedWork({
  hasArticleDatasetChanges,
  hasIndexLayoutChanges,
  onDiscardArticles = NO_OP,
}: {
  hasArticleDatasetChanges: boolean;
  hasIndexLayoutChanges: boolean;
  /** Discarding the article edits also drops their browser recovery copy. */
  onDiscardArticles?: () => void;
}): void {
  useUnsavedWork({
    kind: "discard-only",
    because: "Commit these live article edits from the tool after review.",
    id: "staged-set:articles",
    tab: "tag-editor",
    label: "Tags: article edits not yet committed",
    dirty: hasArticleDatasetChanges,
    discard: onDiscardArticles,
    keepsOnTabSwitch: true,
  });
  useUnsavedWork({
    kind: "discard-only",
    because: "Commit these live layout edits from the tool after review.",
    id: "staged-set:index-layouts",
    tab: "index-layout",
    label: "Index layout: layout edits not yet committed",
    dirty: hasIndexLayoutChanges,
    discard: NO_OP,
    keepsOnTabSwitch: true,
  });
}
