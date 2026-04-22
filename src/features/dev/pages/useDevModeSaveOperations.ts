import { useCallback, useState } from "react";

import { useSaveArticlesMutation, useSaveToConvexMutation } from "@/hooks/useApiMutations";
import {
  buildCommitMarkdown,
  buildConvexSavePayload,
  normalizeConvexChangeLogEntry,
  normalizeGitHubChangeLogEntry,
} from "./devModePageUtils";
import type { ChangeNotice } from "./useDevModeChangeLog";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { SubstanceArticle } from "@/schema";
import type { DatasetChangelogResult } from "@/utils/data/changelog";
import type { DevModeTab } from "./devModePageUtils";
import type { EditorServerConfigHealth } from "@/hooks/useEditorServerConfigHealth";

type VerifyDevCredentials = (
  options?: { username?: string; password?: string },
) => Promise<{ username: string; password: string; key: string }>;

type UseDevModeSaveOperationsArgs = {
  articles: SubstanceArticle[];
  psychoactiveIndexManual: unknown;
  aboutMarkdown: string;
  aboutSubtitle: string;
  aboutFounderKeys: string[];
  generatorPrompt: string;
  getOriginalArticles: () => SubstanceArticle[];
  markChangesSaved: () => void;
  convexEnabled: boolean;
  convexServerHealth: EditorServerConfigHealth;
  datasetChangelog: DatasetChangelogResult;
  psychoactiveManualChangelog: { markdown: string; hasChanges: boolean };
  aboutMarkdownChangelog: { markdown: string; hasChanges: boolean };
  aboutSubtitleChangelog: { markdown: string; hasChanges: boolean };
  aboutFounderChangelog: { markdown: string; hasChanges: boolean };
  hasAboutMarkdownChanges: boolean;
  hasAboutSubtitleChanges: boolean;
  hasAboutFounderChanges: boolean;
  hasGeneratorPromptChanges: boolean;
  hasPendingChanges: boolean;
  verifyDevCredentials: VerifyDevCredentials;
  setPasswordKey: (value: string) => void;
  setGithubNotice: (notice: ChangeNotice | null, options?: { clearAfterMs?: number }) => void;
  setConvexNotice: (notice: ChangeNotice | null, options?: { clearAfterMs?: number }) => void;
  onAppendChangeLogEntry: (entry: ChangeLogEntry) => void;
  onTabChange: (tab: DevModeTab) => void;
  pushChangeLogNotice: (notice: ChangeNotice) => void;
};

export function useDevModeSaveOperations({
  articles,
  psychoactiveIndexManual,
  aboutMarkdown,
  aboutSubtitle,
  aboutFounderKeys,
  generatorPrompt,
  getOriginalArticles,
  markChangesSaved,
  convexEnabled,
  convexServerHealth,
  datasetChangelog,
  psychoactiveManualChangelog,
  aboutMarkdownChangelog,
  aboutSubtitleChangelog,
  aboutFounderChangelog,
  hasAboutMarkdownChanges,
  hasAboutSubtitleChanges,
  hasAboutFounderChanges,
  hasGeneratorPromptChanges,
  hasPendingChanges,
  verifyDevCredentials,
  setPasswordKey,
  setGithubNotice,
  setConvexNotice,
  onAppendChangeLogEntry,
  onTabChange,
  pushChangeLogNotice,
}: UseDevModeSaveOperationsArgs) {
  const [isConvexSaving, setIsConvexSaving] = useState(false);
  const saveArticlesMutation = useSaveArticlesMutation();
  const saveToConvexMutation = useSaveToConvexMutation();

  const handleSaveToConvex = useCallback(async () => {
    if (convexServerHealth.status === "unhealthy" && !convexServerHealth.canSaveToConvex) {
      setConvexNotice(
        {
          type: "error",
          message:
            convexServerHealth.issues[0] ??
            "Convex save is unavailable until the server configuration is fixed.",
        },
        { clearAfterMs: 10000 },
      );
      return;
    }

    if (!hasPendingChanges) {
      setConvexNotice({ type: "error", message: "No changes to save." }, { clearAfterMs: 10000 });
      return;
    }

    const hasAboutChanges =
      hasAboutMarkdownChanges || hasAboutSubtitleChanges || hasAboutFounderChanges;

    setIsConvexSaving(true);
    setConvexNotice({ type: "pending", message: "Verifying credentials…" });

    try {
      const credentials = await verifyDevCredentials();

      setConvexNotice({
        type: "pending",
        message: `Credentials verified for ${credentials.key}. Saving to Convex…`,
      });

      const { payload } = buildConvexSavePayload({
        articles,
        originalArticles: getOriginalArticles(),
        hasAboutChanges,
        aboutMarkdown,
        aboutSubtitle,
        aboutFounderKeys,
        datasetChangelog,
      });

      const result = await saveToConvexMutation.mutateAsync(payload);
      const resolvedKey = result.submittedBy?.trim() || credentials.key;
      setPasswordKey(resolvedKey);

      if (result.entry) {
        onAppendChangeLogEntry(normalizeConvexChangeLogEntry(result.entry));
      }

      if (result.savedItems.length === 0) {
        setConvexNotice(
          { type: "error", message: "No Convex-compatible changes to save." },
          { clearAfterMs: 10000 },
        );
        return;
      }

      if (result.warnings?.length) {
        console.warn("[handleSaveToConvex] Convex save warnings:", result.warnings);
        setConvexNotice(
          {
            type: "error",
            message: `Saved ${result.savedItems.join(" and ")} to Convex as ${resolvedKey}, but ${result.warnings.length} issue(s) occurred.`,
          },
          { clearAfterMs: 10000 },
        );
        return;
      }

      setConvexNotice(
        {
          type: "success",
          message: `Saved ${result.savedItems.join(" and ")} to Convex as ${resolvedKey}.`,
        },
        { clearAfterMs: 5000 },
      );
      markChangesSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save to Convex.";
      setConvexNotice({ type: "error", message }, { clearAfterMs: 10000 });
    } finally {
      setIsConvexSaving(false);
    }
  }, [
    aboutFounderKeys,
    aboutMarkdown,
    aboutSubtitle,
    articles,
    convexServerHealth,
    datasetChangelog,
    getOriginalArticles,
    hasAboutFounderChanges,
    hasAboutMarkdownChanges,
    hasAboutSubtitleChanges,
    hasPendingChanges,
    markChangesSaved,
    onAppendChangeLogEntry,
    saveToConvexMutation,
    setConvexNotice,
    setPasswordKey,
    verifyDevCredentials,
  ]);

  const handleSaveToGitHub = useCallback(async () => {
    if (!hasPendingChanges) {
      setGithubNotice(
        { type: "error", message: "No changes detected to commit." },
        { clearAfterMs: 5000 },
      );
      return;
    }

    const combinedMarkdown = buildCommitMarkdown([
      {
        hasChanges: datasetChangelog.markdown.trim().length > 0,
        markdown: datasetChangelog.markdown,
      },
      psychoactiveManualChangelog,
      aboutMarkdownChangelog,
      aboutSubtitleChangelog,
      aboutFounderChangelog,
    ]);
    const commitMessage = `Dev editor update - ${new Date().toLocaleString()}`;

    try {
      setGithubNotice({ type: "pending", message: "Verifying credentials…" });

      const credentials = await verifyDevCredentials();

      setGithubNotice({
        type: "pending",
        message: `Credentials verified for ${credentials.key}. Saving to GitHub…`,
      });

      const result = await saveArticlesMutation.mutateAsync({
        username: credentials.username,
        password: credentials.password,
        articlesData: articles,
        commitMessage,
        changelogMarkdown: combinedMarkdown,
        changedArticles: datasetChangelog.articles,
        psychoactiveIndexManualData: psychoactiveIndexManual,
        aboutMarkdown,
        aboutSubtitleMarkdown: aboutSubtitle,
        aboutConfig: { founderProfileKeys: aboutFounderKeys },
        generatorPrompt: hasGeneratorPromptChanges ? generatorPrompt : undefined,
        skipArticles: convexEnabled,
      });

      const resolvedKey = result.submittedBy?.trim() || credentials.key;
      setPasswordKey(resolvedKey);
      setGithubNotice(
        {
          type: "success",
          message: "Saved to GitHub.",
          actionHref: result.commitUrl,
          actionLabel: result.commitUrl ? "Open commit" : undefined,
        },
        { clearAfterMs: 10000 },
      );

      const sanitizedEntry = normalizeGitHubChangeLogEntry(result.entry, commitMessage, resolvedKey);
      if (sanitizedEntry) {
        onAppendChangeLogEntry(sanitizedEntry);
        onTabChange("change-log");
        pushChangeLogNotice({
          type: "success",
          message: "Commit logged in the Change log tab.",
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unexpected error.";
      setGithubNotice({ type: "error", message: reason }, { clearAfterMs: 10000 });
    }
  }, [
    aboutFounderChangelog,
    aboutFounderKeys,
    aboutMarkdown,
    aboutMarkdownChangelog,
    aboutSubtitle,
    aboutSubtitleChangelog,
    articles,
    convexEnabled,
    datasetChangelog,
    generatorPrompt,
    hasGeneratorPromptChanges,
    hasPendingChanges,
    onAppendChangeLogEntry,
    onTabChange,
    psychoactiveIndexManual,
    psychoactiveManualChangelog,
    pushChangeLogNotice,
    saveArticlesMutation,
    setGithubNotice,
    setPasswordKey,
    verifyDevCredentials,
  ]);

  return {
    isConvexSaving,
    isSaving: saveArticlesMutation.isPending,
    handleSaveToConvex,
    handleSaveToGitHub,
  };
}
