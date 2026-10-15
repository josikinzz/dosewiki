import { useUnsavedWork } from "../components/unsavedWork";

const NO_OP = () => {};

export function useStagedSetUnsavedWork({
  hasArticleDatasetChanges,
  hasIndexLayoutChanges,
  onDiscardArticles = NO_OP,
}: {
  hasArticleDatasetChanges: boolean;
  hasIndexLayoutChanges: boolean;
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
