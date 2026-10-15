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
import { useConfirm } from "../components/ConfirmDialog";
import { EditorServerHealthIndicator } from "../components/EditorServerHealthIndicator";
import { isSameDocument } from "../context/editorDocumentSession";
import type { DevActiveProposal } from "../context/devModeTypes";
import {
  DevModeSaveOrchestrator,
  createInitialSaveOrchestratorState,
  selectIsSaving,
  type ChangelogSources,
  type SaveOrchestratorEffect,
} from "../save-orchestrator";
import { buildCommitScope, type CommitScopeDataset } from "./commitScope";
import { CommitScopeSheet } from "./CommitScopeSheet";
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
  getArticleBaseHashes: () => Record<string, string>;
  getOriginalPsychoactiveIndexManual: () => unknown;
  getOriginalChemicalIndexManual: () => unknown;
  getOriginalMechanismIndexManual: () => unknown;
  markChangesSaved: (receipts?: Array<{ slug: string; baseHash: string }>) => void;
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

/**
 * The commit panel's parts, for a tool that lays out its own working-changes
 * surface (Tags) instead of rendering `commitPanel`. The same state, button
 * rules and confirm sheet; `dialog` must be rendered wherever these are used.
 */
export type DevCommitControls = {
  destination: "production" | "proposal";
  notice: ChangeNotice | null;
  dismissNotice: () => void;
  rebase: DevCommitRebase | null;
  isSaving: boolean;
  hasPendingChanges: boolean;
  /** Why the commit button is off while there are changes, or null. */
  blockedReason: string | null;
  canCommit: boolean;
  /**
   * Opens the scope confirm for an admin; an editor's proposal goes straight
   * out. `lead` is drawn at the top of the confirm (Tags lists its tag changes).
   */
  requestCommit: (lead?: ReactNode) => void;
  /** Every dataset the working set changes, with counts and diffs. */
  scope: CommitScopeDataset[];
  /** The server check beside the button, when it has something to say (admins). */
  health: ReactNode;
  dialog: ReactNode;
};

type UseDevModeSaveActionsResult = {
  /** The one commit panel; Index layout renders it at the top. */
  commitPanel: ReactNode;
  /** The same commit, in parts, for Tags' own working-changes panel. */
  commitControls: DevCommitControls;
  clearSaveNotices: () => void;
};

/** Successes clear on their own; errors stay until the editor dismisses them. */
const SUCCESS_NOTICE_CLEAR_MS = 5000;

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
            ? "Committing"
            : "Commit to production"
          : isSaving
            ? "Submitting"
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
  getArticleBaseHashes,
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
        articleBaseHashes: getArticleBaseHashes(),
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
  getArticleBaseHashes,
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
  // The note typed in the commit sheet, read once when the save runs.
  const pendingNoteRef = useRef("");

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
  const latestDraft = useRef(draft);
  latestDraft.current = draft;

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
        const availability = adapter.validateAvailability(draft);
        if (availability.ok === false) {
          orchestrator.dispatch({ type: "validationFailed", message: availability.message });
          return;
        }

        if (!draft.hasPendingChanges) {
          orchestrator.dispatch({ type: "validationFailed", message: adapter.noChangesMessage });
          return;
        }

        orchestrator.dispatch({ type: "validationPassed" });

        try {
          const credentials = await verifySaveSession();
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
        }
      } else if (effect.kind === "save") {
        try {
          const credentials = await verifySaveSession();
          let result = await adapter.execute({ ...draft, note: pendingNoteRef.current }, credentials);
          if (!isSameDocument(latestDraft.current, draft)) {
            result = { ...result, markChangesSaved: false, warnings: [...result.warnings, "The earlier changes were saved. Edits made while saving are still staged; reload and reconcile before publishing them."] };
          }

          orchestrator.dispatch({ type: "saveSucceeded", result });

          if (result.changelogEntry) {
            onAppendChangeLogEntry(result.changelogEntry);
          }

          if (result.markChangesSaved) {
            markChangesSaved(result.articleReceipts);
          }
          // Whichever way the draft landed (superseding revision, or an
          // admin's direct write), the rebase it carried is finished.
          if (activeProposal) {
            onClearActiveProposal();
          }

          scheduleNoticeAutoClear(SUCCESS_NOTICE_CLEAR_MS);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Save failed.";
          console.error("[dev-save] effect:save-failed", { effectId: effect.id, message });
          orchestrator.dispatch({ type: "saveFailed", message });
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

  const clearSaveNotices = useCallback(() => {
    if (clearTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }

    orchestrator.dispatch({ type: "clearNotice" });
  }, [orchestrator]);

  const handleCommit = useCallback(async (note = "") => {
    // A new attempt replaces whatever the last one left on screen.
    clearSaveNotices();
    pendingNoteRef.current = note;
    const effect = orchestrator.dispatch({ type: "saveRequested" });
    if (effect) {
      await handleEffect(effect);
    }
  }, [clearSaveNotices, handleEffect, orchestrator]);

  // A production commit opens the scope sheet first: every dataset the working
  // set changes, with counts and diffs, then one confirm. Nothing is written
  // until that confirm. A proposal goes to review, so it submits directly.
  const { confirm, dialog: commitSheet } = useConfirm();
  const requestCommit = useCallback((lead?: ReactNode) => {
    if (!canApprove) {
      void handleCommit();
      return;
    }
    const scope = buildCommitScope(draft);
    const total = scope.reduce((sum, dataset) => sum + dataset.count, 0);
    let note = "";
    confirm({
      title: "Commit to production?",
      description:
        scope.length === 1
          ? "It goes live on dose.wiki as soon as you commit."
          : `These ${scope.length} datasets go live on dose.wiki together as soon as you commit.`,
      body: <CommitScopeSheet scope={scope} lead={lead} onNoteChange={(value) => { note = value; }} />,
      // One unit on the button: the articles when only articles changed.
      confirmLabel: scope.length === 1 && scope[0].id === "articles"
        ? `Commit changes to ${scope[0].countLabel}`
        : `Commit ${total} ${total === 1 ? "change" : "changes"}`,
      wide: true,
      onConfirm: () => handleCommit(note),
    });
  }, [canApprove, confirm, draft, handleCommit]);

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
        onCommit={() => requestCommit()}
      />
    ),
    [
      dataServerHealth,
      requestCommit,
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
    <>
      <DevModeCommitPanel
        notice={notice}
        destination={destination}
        actionSlot={commitButton}
        rebase={rebase}
        onDismissNotice={clearSaveNotices}
      />
      {commitSheet}
    </>
  );

  const scope = useMemo(() => buildCommitScope(draft), [draft]);
  const health = canApprove && dataServerHealth.status !== "healthy" && dataServerHealth.status !== "idle" ? (
    <EditorServerHealthIndicator
      health={dataServerHealth}
      onRefresh={() => {
        void refreshDataServerHealth();
      }}
    />
  ) : null;
  const blockedReason = !canDraft
    ? "Editor role required."
    : canApprove && isCommitBlocked
      ? `The server cannot write to the database right now (${dataServerHealth.summary || "server issue"}).`
      : null;
  const commitControls: DevCommitControls = {
    destination,
    notice,
    dismissNotice: clearSaveNotices,
    rebase,
    isSaving,
    hasPendingChanges,
    blockedReason,
    canCommit: canDraft && !isSaving && hasPendingChanges && !(canApprove && isCommitBlocked),
    requestCommit,
    scope,
    health,
    dialog: commitSheet,
  };

  return {
    commitPanel,
    commitControls,
    clearSaveNotices,
  };
}
