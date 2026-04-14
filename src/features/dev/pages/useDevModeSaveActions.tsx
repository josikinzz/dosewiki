import { useCallback, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { useSaveArticlesMutation, useSaveToConvexMutation } from "@/hooks/useApiMutations";
import {
  useEditorServerConfigHealth,
  type EditorServerConfigHealth,
} from "@/hooks/useEditorServerConfigHealth";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { SubstanceArticle } from "@/schema";
import type { DatasetChangelogResult } from "@/utils/data/changelog";
import { EditorServerHealthIndicator } from "../components/EditorServerHealthIndicator";
import { DevModeCommitPanel } from "./DevModeCommitPanel";
import {
  buildCommitMarkdown,
  buildConvexSavePayload,
  normalizeConvexChangeLogEntry,
  normalizeGitHubChangeLogEntry,
  type DevModeTab,
} from "./devModePageUtils";
import type { ChangeNotice } from "./useDevModeChangeLog";

type VerifyDevCredentials = (
  options?: { username?: string; password?: string },
) => Promise<{ username: string; password: string; key: string }>;

type UseDevModeSaveActionsArgs = {
  articles: SubstanceArticle[];
  psychoactiveIndexManual: unknown;
  aboutMarkdown: string;
  aboutSubtitle: string;
  aboutFounderKeys: string[];
  generatorPrompt: string;
  getOriginalArticles: () => SubstanceArticle[];
  markChangesSaved: () => void;
  hasAuthenticatedSession: boolean;
  hasStoredCredentials: boolean;
  hasNextEditorSession: boolean;
  sessionProfileKey: string;
  convexEnabled: boolean;
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
  onAppendChangeLogEntry: (entry: ChangeLogEntry) => void;
  onTabChange: (tab: DevModeTab) => void;
  pushChangeLogNotice: (notice: ChangeNotice) => void;
};

type UseDevModeSaveActionsResult = {
  passwordKey: string | null;
  setPasswordKey: Dispatch<SetStateAction<string | null>>;
  verifyDevCredentials: VerifyDevCredentials;
  commitPanel: ReactNode;
  renderCommitPanel: (extraActionSlot?: ReactNode) => ReactNode;
  clearSaveNotices: () => void;
};

function ConvexSaveButton({
  convexEnabled,
  hasNextEditorSession,
  convexServerHealth,
  refreshConvexServerHealth,
  convexNotice,
  isConvexSaving,
  hasPendingChanges,
  isConvexSaveBlocked,
  onSaveToConvex,
}: {
  convexEnabled: boolean;
  hasNextEditorSession: boolean;
  convexServerHealth: EditorServerConfigHealth;
  refreshConvexServerHealth: () => Promise<void>;
  convexNotice: ChangeNotice | null;
  isConvexSaving: boolean;
  hasPendingChanges: boolean;
  isConvexSaveBlocked: boolean;
  onSaveToConvex: () => void;
}) {
  if (!convexEnabled) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {hasNextEditorSession ? (
        <EditorServerHealthIndicator
          health={convexServerHealth}
          onRefresh={() => {
            void refreshConvexServerHealth();
          }}
        />
      ) : null}
      {convexNotice ? (
        <span
          className={`text-xs ${
            convexNotice.type === "error"
              ? "text-rose-300"
              : convexNotice.type === "pending"
                ? "text-cyan-200"
                : "text-emerald-300"
          }`}
        >
          {convexNotice.message}
        </span>
      ) : null}
      <Button
        variant="outline"
        size="pill"
        className="inline-flex items-center gap-2 rounded-full border border-cyan-500/50 px-4 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onSaveToConvex}
        disabled={isConvexSaving || !hasPendingChanges || isConvexSaveBlocked}
      >
        <Icon icon="lucide:cloud" size={16} />
        {isConvexSaving ? "Saving…" : "Save to Convex"}
      </Button>
    </div>
  );
}

export function useDevModeSaveActions({
  articles,
  psychoactiveIndexManual,
  aboutMarkdown,
  aboutSubtitle,
  aboutFounderKeys,
  generatorPrompt,
  getOriginalArticles,
  markChangesSaved,
  hasAuthenticatedSession,
  hasStoredCredentials,
  hasNextEditorSession,
  sessionProfileKey,
  convexEnabled,
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
  onAppendChangeLogEntry,
  onTabChange,
  pushChangeLogNotice,
}: UseDevModeSaveActionsArgs): UseDevModeSaveActionsResult {
  const [passwordKey, setPasswordKey] = useState<string | null>(null);
  const [githubNotice, setGithubNotice] = useState<ChangeNotice | null>(null);
  const [convexNotice, setConvexNotice] = useState<ChangeNotice | null>(null);
  const [isConvexSaving, setIsConvexSaving] = useState(false);

  const saveArticlesMutation = useSaveArticlesMutation();
  const saveToConvexMutation = useSaveToConvexMutation();
  const isSaving = saveArticlesMutation.isPending;

  const { health: convexServerHealth, refresh: refreshConvexServerHealth } =
    useEditorServerConfigHealth(convexEnabled && hasNextEditorSession);

  const verifyDevCredentials = useCallback<VerifyDevCredentials>(
    async (_options) => {
      if (!hasAuthenticatedSession) {
        throw new Error("Sign in before continuing.");
      }

      const matchedKey = sessionProfileKey || "USER";
      const authSessionCredential = "__AUTHJS_SESSION__";
      setPasswordKey(matchedKey);

      return {
        username: matchedKey,
        password: authSessionCredential,
        key: matchedKey,
      };
    },
    [hasAuthenticatedSession, sessionProfileKey],
  );

  const handleSaveToConvex = useCallback(async () => {
    if (convexServerHealth.status === "unhealthy" && !convexServerHealth.canSaveToConvex) {
      setConvexNotice({
        type: "error",
        message:
          convexServerHealth.issues[0] ??
          "Convex save is unavailable until the server configuration is fixed.",
      });
      return;
    }

    if (!hasPendingChanges) {
      setConvexNotice({ type: "error", message: "No changes to save." });
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
        setConvexNotice({ type: "error", message: "No Convex-compatible changes to save." });
        return;
      }

      if (result.warnings?.length) {
        console.warn("[handleSaveToConvex] Convex save warnings:", result.warnings);
        setConvexNotice({
          type: "error",
          message: `Saved ${result.savedItems.join(" and ")} to Convex as ${resolvedKey}, but ${result.warnings.length} issue(s) occurred.`,
        });
        window.setTimeout(() => setConvexNotice(null), 10000);
        return;
      }

      setConvexNotice({
        type: "success",
        message: `Saved ${result.savedItems.join(" and ")} to Convex as ${resolvedKey}.`,
      });
      markChangesSaved();
      window.setTimeout(() => setConvexNotice(null), 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save to Convex.";
      setConvexNotice({ type: "error", message });
      window.setTimeout(() => setConvexNotice(null), 10000);
    } finally {
      setIsConvexSaving(false);
    }
  }, [
    aboutFounderKeys,
    aboutMarkdown,
    aboutSubtitle,
    articles,
    convexServerHealth.canSaveToConvex,
    convexServerHealth.issues,
    convexServerHealth.status,
    datasetChangelog,
    getOriginalArticles,
    hasAboutFounderChanges,
    hasAboutMarkdownChanges,
    hasAboutSubtitleChanges,
    hasPendingChanges,
    markChangesSaved,
    onAppendChangeLogEntry,
    saveToConvexMutation,
    verifyDevCredentials,
  ]);

  const handleSaveToGitHub = useCallback(async () => {
    if (!hasPendingChanges) {
      setGithubNotice({ type: "error", message: "No changes detected to commit." });
      window.setTimeout(() => setGithubNotice(null), 5000);
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
      setGithubNotice({
        type: "success",
        message: "Saved to GitHub.",
        actionHref: result.commitUrl,
        actionLabel: result.commitUrl ? "Open commit" : undefined,
      });

      const sanitizedEntry = normalizeGitHubChangeLogEntry(
        result.entry,
        commitMessage,
        resolvedKey,
      );

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
      setGithubNotice({ type: "error", message: reason });
    } finally {
      window.setTimeout(() => setGithubNotice(null), 10000);
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
    verifyDevCredentials,
  ]);

  const clearSaveNotices = useCallback(() => {
    setGithubNotice(null);
    setConvexNotice(null);
  }, []);

  const isConvexSaveBlocked =
    convexServerHealth.status === "unhealthy" && !convexServerHealth.canSaveToConvex;
  const primaryCommitNotice = convexEnabled ? convexNotice : githubNotice;
  const isCommitDisabled = isSaving || !hasStoredCredentials || !hasPendingChanges;

  const convexSaveButton = useMemo(
    () => (
      <ConvexSaveButton
        convexEnabled={convexEnabled}
        hasNextEditorSession={hasNextEditorSession}
        convexServerHealth={convexServerHealth}
        refreshConvexServerHealth={refreshConvexServerHealth}
        convexNotice={convexNotice}
        isConvexSaving={isConvexSaving}
        hasPendingChanges={hasPendingChanges}
        isConvexSaveBlocked={isConvexSaveBlocked}
        onSaveToConvex={() => {
          void handleSaveToConvex();
        }}
      />
    ),
    [
      convexEnabled,
      convexNotice,
      convexServerHealth,
      handleSaveToConvex,
      hasNextEditorSession,
      hasPendingChanges,
      isConvexSaveBlocked,
      isConvexSaving,
      refreshConvexServerHealth,
    ],
  );

  const commitPanel = (
    <DevModeCommitPanel
      notice={primaryCommitNotice}
      hasEditorSession={hasNextEditorSession}
      passwordKey={passwordKey}
      hasInvalidJsonDraft={false}
      isSaving={isSaving}
      isCommitDisabled={isCommitDisabled}
      onCommit={() => {
        void handleSaveToGitHub();
      }}
      actionSlot={convexSaveButton}
    />
  );

  const renderCommitPanel = useCallback(
    (extraActionSlot?: ReactNode) => (
      <DevModeCommitPanel
        notice={primaryCommitNotice}
        hasEditorSession={hasNextEditorSession}
        passwordKey={passwordKey}
        hasInvalidJsonDraft={false}
        isSaving={isSaving}
        isCommitDisabled={isCommitDisabled}
        onCommit={() => {
          void handleSaveToGitHub();
        }}
        actionSlot={
          <div className="flex flex-wrap items-center gap-2">
            {convexSaveButton}
            {extraActionSlot}
          </div>
        }
      />
    ),
    [
      convexSaveButton,
      handleSaveToGitHub,
      hasNextEditorSession,
      isCommitDisabled,
      isSaving,
      passwordKey,
      primaryCommitNotice,
    ],
  );

  return {
    passwordKey,
    setPasswordKey,
    verifyDevCredentials,
    commitPanel,
    renderCommitPanel,
    clearSaveNotices,
  };
}
