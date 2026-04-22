import { useCallback, useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import {
  useEditorServerConfigHealth,
  type EditorServerConfigHealth,
} from "@/hooks/useEditorServerConfigHealth";
import type { SubstanceArticle } from "@/schema";
import type { DatasetChangelogResult } from "@/utils/data/changelog";
import { EditorServerHealthIndicator } from "../components/EditorServerHealthIndicator";
import { DevModeCommitPanel } from "./DevModeCommitPanel";
import {
  type DevModeTab,
} from "./devModePageUtils";
import type { ChangeNotice } from "./useDevModeChangeLog";
import { useDevModeSaveNotices } from "./useDevModeSaveNotices";
import { useDevModeSaveOperations } from "./useDevModeSaveOperations";
import { useDevModeSessionCredentials } from "./useDevModeSessionCredentials";

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
  const { health: convexServerHealth, refresh: refreshConvexServerHealth } =
    useEditorServerConfigHealth(convexEnabled && hasNextEditorSession);
  const { passwordKey, setPasswordKey, verifyDevCredentials } = useDevModeSessionCredentials({
    hasAuthenticatedSession,
    sessionProfileKey,
  });
  const { githubNotice, convexNotice, setGithubNotice, setConvexNotice, clearSaveNotices } =
    useDevModeSaveNotices();
  const { isConvexSaving, isSaving, handleSaveToConvex, handleSaveToGitHub } =
    useDevModeSaveOperations({
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
      setPasswordKey: (value) => setPasswordKey(value),
      setGithubNotice,
      setConvexNotice,
      onAppendChangeLogEntry,
      onTabChange,
      pushChangeLogNotice,
    });

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
