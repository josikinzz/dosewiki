import { useCallback, useMemo, type ReactNode } from "react";

import type { DevCommitControls } from "./useDevModeSaveActions";

type UseDevSupportTabsControllerArgs = {
  commitPanel: ReactNode;
  /** The commit in parts; Tags draws its own working-changes panel from them. */
  commitControls?: DevCommitControls;
  combinedChangelogMarkdown: string;
  hasPendingChanges: boolean;
};

export function useDevSupportTabsController({
  commitPanel,
  commitControls,
  combinedChangelogMarkdown,
  hasPendingChanges,
}: UseDevSupportTabsControllerArgs) {
  const copyDatasetMarkdownForTagEditor = useCallback(async () => {
    await navigator.clipboard.writeText(combinedChangelogMarkdown);
  }, [combinedChangelogMarkdown]);

  const downloadDatasetMarkdownForTagEditor = useCallback(() => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `dataset-changelog-${timestamp}.diff`;
    const blob = new Blob([combinedChangelogMarkdown], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [combinedChangelogMarkdown]);

  const tagEditorTabProps = useMemo(
    () => ({
      commitPanel,
      commit: commitControls,
      datasetMarkdown: combinedChangelogMarkdown,
      hasDatasetChanges: hasPendingChanges,
      onCopyDatasetMarkdown: copyDatasetMarkdownForTagEditor,
      onDownloadDatasetMarkdown: downloadDatasetMarkdownForTagEditor,
    }),
    [
      combinedChangelogMarkdown,
      commitControls,
      commitPanel,
      copyDatasetMarkdownForTagEditor,
      downloadDatasetMarkdownForTagEditor,
      hasPendingChanges,
    ],
  );

  return {
    tagEditorTabProps,
  };
}
