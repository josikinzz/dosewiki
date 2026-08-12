import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import {
  useEditorServerConfigHealth,
  type EditorServerConfigHealth,
} from "@/hooks/useEditorServerConfigHealth";
import { useSaveArticlesMutation, useSaveToConvexMutation } from "@/hooks/useApiMutations";
import type { SubstanceArticle } from "@/schema";
import type { DatasetChangelogResult } from "@/utils/data/changelog";
import { EditorServerHealthIndicator } from "../components/EditorServerHealthIndicator";
import {
  DevModeSaveOrchestrator,
  createInitialSaveOrchestratorState,
  selectIsConvexSaving,
  selectIsSaving,
  type ChangelogSources,
  type SaveOrchestratorEffect,
} from "../save-orchestrator";
import { DevModeCommitPanel } from "./DevModeCommitPanel";
import {
  type DevModeTab,
} from "./devModePageUtils";
import {
  buildDevSaveDraft,
  createConvexSaveAdapter,
  createGitHubSaveAdapter,
} from "./devSaveCommand";
import type { ChangeNotice } from "./useDevModeChangeLog";
import { useDevModeSessionCredentials } from "./useDevModeSessionCredentials";

type VerifyDevCredentials = (
  options?: { username?: string; password?: string },
) => Promise<{ username: string; password: string; key: string }>;

type UseDevModeSaveActionsArgs = {
  articles: SubstanceArticle[];
  /** True once every row in `articles` holds a whole article, not a slim list row. */
  articlesAreComplete: boolean;
  psychoactiveIndexManual: unknown;
  chemicalIndexManual: unknown;
  mechanismIndexManual: unknown;
  aboutMarkdown: string;
  aboutSubtitle: string;
  aboutFounderKeys: string[];
  getOriginalArticles: () => SubstanceArticle[];
  markChangesSaved: () => void;
  hasAuthenticatedSession: boolean;
  hasStoredCredentials: boolean;
  hasNextEditorSession: boolean;
  sessionProfileKey: string;
  convexEnabled: boolean;
  datasetChangelog: DatasetChangelogResult;
  psychoactiveManualChangelog: { markdown: string; hasChanges: boolean };
  chemicalManualChangelog: { markdown: string; hasChanges: boolean };
  mechanismManualChangelog: { markdown: string; hasChanges: boolean };
  aboutMarkdownChangelog: { markdown: string; hasChanges: boolean };
  aboutSubtitleChangelog: { markdown: string; hasChanges: boolean };
  aboutFounderChangelog: { markdown: string; hasChanges: boolean };
  hasAboutMarkdownChanges: boolean;
  hasAboutSubtitleChanges: boolean;
  hasAboutFounderChanges: boolean;
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
  renderCommitPanel: (extraActionSlot?: ReactNode, description?: ReactNode) => ReactNode;
  clearSaveNotices: () => void;
};

function ConvexSaveButton({
  convexEnabled,
  hasNextEditorSession,
  convexServerHealth,
  refreshConvexServerHealth,
  convexNotice,
  isConvexSaving,
  isSaving,
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
  isSaving: boolean;
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
              ? "text-[color:var(--theme-danger-text)]"
              : convexNotice.type === "pending"
                ? "text-[color:var(--theme-semantic-info-badge-text)]"
                : "text-[color:var(--theme-success-text)]"
          }`}
        >
          {convexNotice.message}
        </span>
      ) : null}
      <Button
        variant="outline"
        size="pill"
        className="rounded-full px-4 py-2 text-sm font-medium"
        onClick={onSaveToConvex}
        disabled={isSaving || !hasPendingChanges || isConvexSaveBlocked}
      >
        <Icon icon="lucide:cloud" size={16} />
        {isConvexSaving ? "Saving..." : "Save to Convex"}
      </Button>
    </div>
  );
}

const toChangeNotice = (notice: { type: string; message: string; actionHref?: string; actionLabel?: string } | null): ChangeNotice | null => {
  if (!notice) {
    return null;
  }
  return {
    type: notice.type as ChangeNotice["type"],
    message: notice.message,
    actionHref: notice.actionHref,
    actionLabel: notice.actionLabel,
  };
};

export function useDevModeSaveActions({
  articles,
  articlesAreComplete,
  psychoactiveIndexManual,
  chemicalIndexManual,
  mechanismIndexManual,
  aboutMarkdown,
  aboutSubtitle,
  aboutFounderKeys,
  getOriginalArticles,
  markChangesSaved,
  hasAuthenticatedSession,
  hasStoredCredentials,
  hasNextEditorSession,
  sessionProfileKey,
  convexEnabled,
  datasetChangelog,
  psychoactiveManualChangelog,
  chemicalManualChangelog,
  mechanismManualChangelog,
  aboutMarkdownChangelog,
  aboutSubtitleChangelog,
  aboutFounderChangelog,
  hasAboutMarkdownChanges,
  hasAboutSubtitleChanges,
  hasAboutFounderChanges,
  hasPendingChanges,
  onAppendChangeLogEntry,
  onTabChange,
  pushChangeLogNotice,
}: UseDevModeSaveActionsArgs): UseDevModeSaveActionsResult {
  // External hooks that stay as React (credentials, server health)
  const { health: convexServerHealth, refresh: refreshConvexServerHealth } =
    useEditorServerConfigHealth(convexEnabled && hasNextEditorSession);
  const { passwordKey, setPasswordKey, verifyDevCredentials } = useDevModeSessionCredentials({
    hasAuthenticatedSession,
    sessionProfileKey,
  });

  // Mutation hooks
  const saveArticlesMutation = useSaveArticlesMutation();
  const saveToConvexMutation = useSaveToConvexMutation();

  // Create orchestrator once
  const orchestratorRef = useRef<DevModeSaveOrchestrator | null>(null);
  if (!orchestratorRef.current) {
    orchestratorRef.current = new DevModeSaveOrchestrator(createInitialSaveOrchestratorState());
  }
  const orchestrator = orchestratorRef.current;

  // Subscribe to orchestrator state
  const orchestratorState = useSyncExternalStore(
    useCallback((onStoreChange) => orchestrator.subscribe(onStoreChange), [orchestrator]),
    useCallback(() => orchestrator.getState(), [orchestrator]),
    useCallback(() => orchestrator.getState(), [orchestrator]),
  );

  // Build changelog sources for orchestrator
  const changelogSources: ChangelogSources = useMemo(() => ({
    datasetChangelog,
    psychoactiveManualChangelog,
    chemicalManualChangelog,
    mechanismManualChangelog,
    aboutMarkdownChangelog,
    aboutSubtitleChangelog,
    aboutFounderChangelog,
  }), [
    datasetChangelog,
    psychoactiveManualChangelog,
    chemicalManualChangelog,
    mechanismManualChangelog,
    aboutMarkdownChangelog,
    aboutSubtitleChangelog,
    aboutFounderChangelog,
  ]);

  // Update orchestrator when changelog sources change
  useEffect(() => {
    orchestrator.dispatch({
      type: "changelogSourcesUpdated",
      sources: changelogSources,
    });
  }, [changelogSources, orchestrator]);

  // Build draft for save commands
  const draft = useMemo(
    () =>
      buildDevSaveDraft({
        articles,
        articlesAreComplete,
        originalArticles: getOriginalArticles(),
        layouts: [
          {
            type: "psychoactive",
            label: "Psychoactive class",
            data: psychoactiveIndexManual,
            changelog: psychoactiveManualChangelog,
          },
          {
            type: "chemical",
            label: "Chemical class",
            data: chemicalIndexManual,
            changelog: chemicalManualChangelog,
          },
          {
            type: "mechanism",
            label: "Mechanism of action",
            data: mechanismIndexManual,
            changelog: mechanismManualChangelog,
          },
        ],
        aboutMarkdown,
        aboutSubtitle,
        aboutFounderKeys,
        convexEnabled,
        datasetChangelog,
        aboutMarkdownChangelog,
        aboutSubtitleChangelog,
        aboutFounderChangelog,
        hasAboutMarkdownChanges,
        hasAboutSubtitleChanges,
        hasAboutFounderChanges,
        hasPendingChanges,
      }),
    [
      aboutFounderChangelog,
      aboutFounderKeys,
      aboutMarkdown,
      aboutMarkdownChangelog,
      aboutSubtitle,
      aboutSubtitleChangelog,
      articles,
      articlesAreComplete,
      chemicalIndexManual,
      chemicalManualChangelog,
      convexEnabled,
      datasetChangelog,
      getOriginalArticles,
      hasAboutFounderChanges,
      hasAboutMarkdownChanges,
      hasAboutSubtitleChanges,
      hasPendingChanges,
      mechanismIndexManual,
      mechanismManualChangelog,
      psychoactiveIndexManual,
      psychoactiveManualChangelog,
    ],
  );

  // Auto-clear timer refs
  const clearTimerRefs = useRef<{ github: number | null; convex: number | null }>({
    github: null,
    convex: null,
  });

  const scheduleNoticeAutoClear = useCallback(
    (channel: "github" | "convex", clearAfterMs: number) => {
      if (typeof window === "undefined") {
        return;
      }

      if (clearTimerRefs.current[channel] !== null) {
        window.clearTimeout(clearTimerRefs.current[channel]!);
      }
      clearTimerRefs.current[channel] = window.setTimeout(() => {
        orchestrator.dispatch({ type: "clearNotice", channel });
        clearTimerRefs.current[channel] = null;
      }, clearAfterMs);
    },
    [orchestrator],
  );

  // Effect handler for async operations
  const handleEffect = useCallback(
    async function runEffect(effect: SaveOrchestratorEffect): Promise<void> {
      if (effect.kind === "verifyCredentials") {
        console.info("[dev-save] effect:verify-start", {
          destination: effect.destination,
          effectId: effect.id,
        });

        // First validate availability
        const adapter = effect.destination === "convex"
          ? createConvexSaveAdapter({
              serverHealth: convexServerHealth,
              saveToConvex: saveToConvexMutation.mutateAsync,
            })
          : createGitHubSaveAdapter({
              saveArticles: saveArticlesMutation.mutateAsync,
            });

        const availability = adapter.validateAvailability(draft);
        if (availability.ok === false) {
          orchestrator.dispatch({
            type: "validationFailed",
            destination: effect.destination,
            message: availability.message,
          });
          scheduleNoticeAutoClear(effect.destination, 10000);
          return;
        }

        if (!draft.hasPendingChanges) {
          const clearAfterMs = effect.destination === "github" ? 5000 : 10000;
          orchestrator.dispatch({
            type: "validationFailed",
            destination: effect.destination,
            message: adapter.noChangesMessage,
          });
          scheduleNoticeAutoClear(effect.destination, clearAfterMs);
          return;
        }

        orchestrator.dispatch({
          type: "validationPassed",
          destination: effect.destination,
        });

        try {
          const credentials = await verifyDevCredentials();
          console.info("[dev-save] effect:credentials-verified", {
            destination: effect.destination,
            effectId: effect.id,
            key: credentials.key,
          });
          const saveEffect = orchestrator.dispatch({
            type: "credentialsVerified",
            credentials,
          });
          if (saveEffect) {
            await runEffect(saveEffect);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Credential verification failed.";
          console.error("[dev-save] effect:credentials-failed", {
            destination: effect.destination,
            effectId: effect.id,
            message,
          });
          orchestrator.dispatch({
            type: "credentialsFailed",
            message,
          });
          scheduleNoticeAutoClear(effect.destination, 10000);
        }
      } else if (effect.kind === "save") {
        try {
          console.info("[dev-save] effect:save-start", {
            destination: effect.destination,
            effectId: effect.id,
          });
          // Re-verify credentials to get full object
          const fullCredentials = await verifyDevCredentials();

          const adapter = effect.destination === "convex"
            ? createConvexSaveAdapter({
                serverHealth: convexServerHealth,
                saveToConvex: saveToConvexMutation.mutateAsync,
              })
            : createGitHubSaveAdapter({
                saveArticles: saveArticlesMutation.mutateAsync,
              });

          const result = await adapter.execute(draft, fullCredentials);
          console.info("[dev-save] effect:save-succeeded", {
            destination: effect.destination,
            effectId: effect.id,
            savedItems: result.savedItems,
            warningCount: result.warnings.length,
            requestId: result.requestId ?? null,
          });

          orchestrator.dispatch({
            type: "saveSucceeded",
            result,
          });

          // Handle post-save callbacks
          setPasswordKey(result.resolvedSubmitterKey);

          if (result.changelogEntry) {
            onAppendChangeLogEntry(result.changelogEntry);
          }

          if (effect.destination === "github" && result.changelogEntry) {
            onTabChange("change-log");
            pushChangeLogNotice({
              type: "success",
              message: "Archive logged in the Change log tab.",
            });
          }

          if (effect.destination === "convex" && result.markChangesSaved) {
            markChangesSaved();
          }

          scheduleNoticeAutoClear(effect.destination, effect.destination === "github" ? 10000 : 5000);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Save failed.";
          console.error("[dev-save] effect:save-failed", {
            destination: effect.destination,
            effectId: effect.id,
            message,
          });
          orchestrator.dispatch({
            type: "saveFailed",
            destination: effect.destination,
            message,
          });
          scheduleNoticeAutoClear(effect.destination, 10000);
        }
      }
    },
    [
      convexServerHealth,
      draft,
      markChangesSaved,
      onAppendChangeLogEntry,
      onTabChange,
      orchestrator,
      pushChangeLogNotice,
      saveArticlesMutation.mutateAsync,
      saveToConvexMutation.mutateAsync,
      scheduleNoticeAutoClear,
      setPasswordKey,
      verifyDevCredentials,
    ],
  );

  const handleSaveToGitHub = useCallback(async () => {
    const effect = orchestrator.dispatch({ type: "saveToGitHubRequested" });
    if (effect) {
      await handleEffect(effect);
    }
  }, [handleEffect, orchestrator]);

  const handleSaveToConvex = useCallback(async () => {
    const effect = orchestrator.dispatch({ type: "saveToConvexRequested" });
    if (effect) {
      await handleEffect(effect);
    }
  }, [handleEffect, orchestrator]);

  const clearSaveNotices = useCallback(() => {
    // Clear all timers
    if (clearTimerRefs.current.github !== null && typeof window !== "undefined") {
      window.clearTimeout(clearTimerRefs.current.github);
      clearTimerRefs.current.github = null;
    }
    if (clearTimerRefs.current.convex !== null && typeof window !== "undefined") {
      window.clearTimeout(clearTimerRefs.current.convex);
      clearTimerRefs.current.convex = null;
    }

    orchestrator.dispatch({ type: "clearNotices" });
  }, [orchestrator]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (clearTimerRefs.current.github !== null && typeof window !== "undefined") {
        window.clearTimeout(clearTimerRefs.current.github);
      }
      if (clearTimerRefs.current.convex !== null && typeof window !== "undefined") {
        window.clearTimeout(clearTimerRefs.current.convex);
      }
    };
  }, []);

  // Derive state from orchestrator
  const isSaving = selectIsSaving(orchestratorState) || saveArticlesMutation.isPending;
  const isConvexSaving = selectIsConvexSaving(orchestratorState);
  const githubNotice = toChangeNotice(orchestratorState.githubNotice);
  const convexNotice = toChangeNotice(orchestratorState.convexNotice);

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
        isSaving={isSaving}
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
      isSaving,
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
    (extraActionSlot?: ReactNode, description?: ReactNode) => (
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
        description={description}
        actionSlot={
          extraActionSlot ? (
            <div className="flex flex-wrap items-center gap-2">
              {convexSaveButton}
              {extraActionSlot}
            </div>
          ) : (
            convexSaveButton
          )
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
