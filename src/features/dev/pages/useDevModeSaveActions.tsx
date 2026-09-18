import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import {
  useEditorServerConfigHealth,
  type EditorServerConfigHealth,
} from "@/hooks/useEditorServerConfigHealth";
import { useSaveArticleMutation, useSubmitProposalMutation } from "@/hooks/useApiMutations";
import type { SubstanceArticle } from "@/schema";
import type { DatasetChangelogResult } from "@/utils/data/changelog";
import type { DevCommitRebase } from "../components/DevCommitCard";
import { EditorServerHealthIndicator } from "../components/EditorServerHealthIndicator";
import type { DevActiveProposal } from "../context/devModeTypes";
import {
  DevModeSaveOrchestrator,
  createInitialSaveOrchestratorState,
  selectIsSaving,
  type ChangelogSources,
  type SaveOrchestratorEffect,
} from "../save-orchestrator";
import { DevModeCommitPanel } from "./DevModeCommitPanel";
import {
  buildDevSaveDraft,
  createDataSaveAdapter,
  createProposalSaveAdapter,
  type DevSaveCredentials,
} from "./devSaveCommand";
import type { ChangeNotice } from "./useDevModeChangeLog";

type UseDevModeSaveActionsArgs = {
  articles: SubstanceArticle[];
  psychoactiveIndexManual: unknown;
  chemicalIndexManual: unknown;
  mechanismIndexManual: unknown;
  getOriginalArticles: () => SubstanceArticle[];
  getOriginalPsychoactiveIndexManual: () => unknown;
  getOriginalChemicalIndexManual: () => unknown;
  getOriginalMechanismIndexManual: () => unknown;
  markChangesSaved: () => void;
  /** An Auth.js session is present; saves refuse to start without one. */
  isSignedIn: boolean;
  /** Admin or editor: gates the save button and server-health polling. */
  canDraft: boolean;
  /** Admin: saves write production; without it the same draft is submitted as a proposal. */
  canApprove: boolean;
  sessionProfileKey: string;
  datasetChangelog: DatasetChangelogResult;
  psychoactiveManualChangelog: { markdown: string; hasChanges: boolean };
  chemicalManualChangelog: { markdown: string; hasChanges: boolean };
  mechanismManualChangelog: { markdown: string; hasChanges: boolean };
  hasPendingChanges: boolean;
  onAppendChangeLogEntry: (entry: ChangeLogEntry) => void;
  /** The returned proposal the working set was seeded from; a proposal save sends it as `revisionOf`. */
  activeProposal: DevActiveProposal | null;
  /** Forget the proposal link once its revision was submitted. */
  onClearActiveProposal: () => void;
  /** Put the seeded rows back and forget the proposal link (the banner's Discard). */
  onDiscardActiveProposal: () => void;
};

type UseDevModeSaveActionsResult = {
  commitPanel: ReactNode;
  renderCommitPanel: (extraActionSlot?: ReactNode, description?: ReactNode) => ReactNode;
  clearSaveNotices: () => void;
};

const NOTICE_CLEAR_MS = { success: 5000, error: 10000 } as const;

/**
 * The commit control. The server-health pill only appears when it has
 * something to say (checking, blocked, unreachable): a healthy server is
 * the button being enabled, not a second label beside it.
 */
function CommitButton({
  canDraft,
  canApprove,
  dataServerHealth,
  refreshDataServerHealth,
  isSaving,
  hasPendingChanges,
  isCommitBlocked,
  onCommit,
}: {
  canDraft: boolean;
  canApprove: boolean;
  dataServerHealth: EditorServerConfigHealth;
  refreshDataServerHealth: () => Promise<void>;
  isSaving: boolean;
  hasPendingChanges: boolean;
  isCommitBlocked: boolean;
  onCommit: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {canApprove && dataServerHealth.status !== "healthy" ? (
        <EditorServerHealthIndicator
          health={dataServerHealth}
          onRefresh={() => {
            void refreshDataServerHealth();
          }}
        />
      ) : null}
      <Button
        variant="outline"
        size="pill"
        className="rounded-full px-4 py-2 text-sm font-medium"
        onClick={onCommit}
        disabled={!canDraft || isSaving || !hasPendingChanges || (canApprove && isCommitBlocked)}
        title={canDraft ? undefined : "Editor role required"}
      >
        <Icon icon={canApprove ? "lucide:upload" : "lucide:send"} size={16} />
        {canApprove
          ? isSaving
            ? "Committing..."
            : "Commit to production"
          : isSaving
            ? "Submitting..."
            : "Submit for review"}
      </Button>
    </div>
  );
}

export function useDevModeSaveActions({
  articles,
  psychoactiveIndexManual,
  chemicalIndexManual,
  mechanismIndexManual,
  getOriginalArticles,
  getOriginalPsychoactiveIndexManual,
  getOriginalChemicalIndexManual,
  getOriginalMechanismIndexManual,
  markChangesSaved,
  isSignedIn,
  canDraft,
  canApprove,
  sessionProfileKey,
  datasetChangelog,
  psychoactiveManualChangelog,
  chemicalManualChangelog,
  mechanismManualChangelog,
  hasPendingChanges,
  onAppendChangeLogEntry,
  activeProposal,
  onClearActiveProposal,
  onDiscardActiveProposal,
}: UseDevModeSaveActionsArgs): UseDevModeSaveActionsResult {
  // Production health is relevant only once there is something to commit.
  // The check still starts before the production action can become enabled.
  const { health: dataServerHealth, refresh: refreshDataServerHealth } =
    useEditorServerConfigHealth(canApprove && hasPendingChanges);
  // The session cookie is the credential; this only names who the save is
  // attributed to and refuses to start a save nobody is signed in for.
  const verifySaveSession = useCallback(async (): Promise<DevSaveCredentials> => {
    if (!isSignedIn) {
      throw new Error("Sign in before continuing.");
    }
    return { key: sessionProfileKey || "USER" };
  }, [isSignedIn, sessionProfileKey]);

  const saveArticleMutation = useSaveArticleMutation();
  const submitProposalMutation = useSubmitProposalMutation();

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
  }), [
    datasetChangelog,
    psychoactiveManualChangelog,
    chemicalManualChangelog,
    mechanismManualChangelog,
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
        originalArticles: getOriginalArticles(),
        layouts: [
          {
            type: "psychoactive",
            label: "Psychoactive class",
            data: psychoactiveIndexManual,
            originalData: getOriginalPsychoactiveIndexManual(),
            changelog: psychoactiveManualChangelog,
          },
          {
            type: "chemical",
            label: "Chemical class",
            data: chemicalIndexManual,
            originalData: getOriginalChemicalIndexManual(),
            changelog: chemicalManualChangelog,
          },
          {
            type: "mechanism",
            label: "Mechanism of action",
            data: mechanismIndexManual,
            originalData: getOriginalMechanismIndexManual(),
            changelog: mechanismManualChangelog,
          },
        ],
        datasetChangelog,
        hasPendingChanges,
      }),
    [
      articles,
      chemicalIndexManual,
      chemicalManualChangelog,
      datasetChangelog,
      getOriginalArticles,
      getOriginalPsychoactiveIndexManual,
      getOriginalChemicalIndexManual,
      getOriginalMechanismIndexManual,
      hasPendingChanges,
      mechanismIndexManual,
      mechanismManualChangelog,
      psychoactiveIndexManual,
      psychoactiveManualChangelog,
    ],
  );

  const clearTimerRef = useRef<number | null>(null);

  const scheduleNoticeAutoClear = useCallback(
    (clearAfterMs: number) => {
      if (typeof window === "undefined") {
        return;
      }

      if (clearTimerRef.current !== null) {
        window.clearTimeout(clearTimerRef.current);
      }
      clearTimerRef.current = window.setTimeout(() => {
        orchestrator.dispatch({ type: "clearNotice" });
        clearTimerRef.current = null;
      }, clearAfterMs);
    },
    [orchestrator],
  );

  // Effect handler for async operations
  const handleEffect = useCallback(
    async function runEffect(effect: SaveOrchestratorEffect): Promise<void> {
      const adapter = canApprove
        ? createDataSaveAdapter({
            serverHealth: dataServerHealth,
            saveArticle: saveArticleMutation.mutateAsync,
          })
        : createProposalSaveAdapter({
            submitProposal: submitProposalMutation.mutateAsync,
            revisionOf: activeProposal?.proposalId ?? null,
          });

      if (effect.kind === "verifyCredentials") {
        console.info("[dev-save] effect:verify-start", { effectId: effect.id });

        const availability = adapter.validateAvailability(draft);
        if (availability.ok === false) {
          orchestrator.dispatch({ type: "validationFailed", message: availability.message });
          scheduleNoticeAutoClear(NOTICE_CLEAR_MS.error);
          return;
        }

        if (!draft.hasPendingChanges) {
          orchestrator.dispatch({ type: "validationFailed", message: adapter.noChangesMessage });
          scheduleNoticeAutoClear(NOTICE_CLEAR_MS.error);
          return;
        }

        orchestrator.dispatch({ type: "validationPassed" });

        try {
          const credentials = await verifySaveSession();
          console.info("[dev-save] effect:credentials-verified", {
            effectId: effect.id,
            key: credentials.key,
          });
          const saveEffect = orchestrator.dispatch({
            type: "credentialsVerified",
            credentials,
            message: adapter.verifiedMessage(credentials.key),
          });
          if (saveEffect) {
            await runEffect(saveEffect);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Credential verification failed.";
          console.error("[dev-save] effect:credentials-failed", { effectId: effect.id, message });
          orchestrator.dispatch({ type: "credentialsFailed", message });
          scheduleNoticeAutoClear(NOTICE_CLEAR_MS.error);
        }
      } else if (effect.kind === "save") {
        try {
          console.info("[dev-save] effect:save-start", { effectId: effect.id });
          const credentials = await verifySaveSession();
          const result = await adapter.execute(draft, credentials);
          console.info("[dev-save] effect:save-succeeded", {
            effectId: effect.id,
            savedItems: result.savedItems,
            warningCount: result.warnings.length,
            requestId: result.requestId ?? null,
          });

          orchestrator.dispatch({ type: "saveSucceeded", result });

          if (result.changelogEntry) {
            onAppendChangeLogEntry(result.changelogEntry);
          }

          if (result.markChangesSaved) {
            markChangesSaved();
          }
          // Whichever way the draft landed (superseding revision, or an
          // admin's direct write), the rebase it carried is finished.
          if (activeProposal) {
            onClearActiveProposal();
          }

          scheduleNoticeAutoClear(NOTICE_CLEAR_MS.success);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Save failed.";
          console.error("[dev-save] effect:save-failed", { effectId: effect.id, message });
          orchestrator.dispatch({ type: "saveFailed", message });
          scheduleNoticeAutoClear(NOTICE_CLEAR_MS.error);
        }
      }
    },
    [
      activeProposal,
      canApprove,
      dataServerHealth,
      draft,
      markChangesSaved,
      onAppendChangeLogEntry,
      onClearActiveProposal,
      orchestrator,
      saveArticleMutation.mutateAsync,
      submitProposalMutation.mutateAsync,
      scheduleNoticeAutoClear,
      verifySaveSession,
    ],
  );

  const handleCommit = useCallback(async () => {
    const effect = orchestrator.dispatch({ type: "saveRequested" });
    if (effect) {
      await handleEffect(effect);
    }
  }, [handleEffect, orchestrator]);

  const clearSaveNotices = useCallback(() => {
    if (clearTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }

    orchestrator.dispatch({ type: "clearNotice" });
  }, [orchestrator]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (clearTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  // Derive state from orchestrator
  const isSaving = selectIsSaving(orchestratorState);
  const notice: ChangeNotice | null = orchestratorState.notice;

  const isCommitBlocked =
    canApprove && dataServerHealth.status === "unhealthy" && !dataServerHealth.canSaveToPostgres;

  const commitButton = useMemo(
    () => (
      <CommitButton
        canDraft={canDraft}
        canApprove={canApprove}
        dataServerHealth={dataServerHealth}
        refreshDataServerHealth={refreshDataServerHealth}
        isSaving={isSaving}
        hasPendingChanges={hasPendingChanges}
        isCommitBlocked={isCommitBlocked}
        onCommit={() => {
          void handleCommit();
        }}
      />
    ),
    [
      dataServerHealth,
      handleCommit,
      canDraft,
      canApprove,
      hasPendingChanges,
      isCommitBlocked,
      isSaving,
      refreshDataServerHealth,
    ],
  );

  const destination = canApprove ? "production" : "proposal";
  const rebase = useMemo<DevCommitRebase | null>(
    () =>
      activeProposal
        ? { proposalId: activeProposal.proposalId, reason: activeProposal.reason, onDiscard: onDiscardActiveProposal }
        : null,
    [activeProposal, onDiscardActiveProposal],
  );
  const commitPanel = (
    <DevModeCommitPanel notice={notice} destination={destination} actionSlot={commitButton} rebase={rebase} />
  );

  const renderCommitPanel = useCallback(
    (extraActionSlot?: ReactNode, description?: ReactNode) => (
      <DevModeCommitPanel
        notice={notice}
        destination={destination}
        description={description}
        rebase={rebase}
        actionSlot={
          extraActionSlot ? (
            <div className="flex flex-wrap items-center gap-2">
              {commitButton}
              {extraActionSlot}
            </div>
          ) : (
            commitButton
          )
        }
      />
    ),
    [commitButton, destination, notice, rebase],
  );

  return {
    commitPanel,
    renderCommitPanel,
    clearSaveNotices,
  };
}
