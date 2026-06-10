/**
 * useDevModeSaveOrchestrator - React adapter for DevModeSaveOrchestrator
 *
 * This hook:
 * - Creates/maintains the orchestrator instance
 * - Subscribes to state changes and triggers re-renders
 * - Handles async side-effects when effects are dispatched
 * - Manages notice auto-clear timers (staying in React land)
 *
 * Things that stay external (passed in):
 * - Convex reactivity (changelog sources)
 * - Credential verification (verifyDevCredentials)
 * - Mutation hooks (saveToConvex, saveArticles)
 * - Document session state
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { EditorServerConfigHealth } from "@/hooks/useEditorServerConfigHealth";
import type { DevSaveDraft, DevSaveCredentials } from "../pages/devSaveCommand";
import {
  createConvexSaveAdapter,
  createGitHubSaveAdapter,
} from "../pages/devSaveCommand";
import type { DevModeTab } from "../pages/devModePageUtils";
import type { ChangeNotice } from "../pages/useDevModeChangeLog";
import {
  createInitialSaveOrchestratorState,
  DevModeSaveOrchestrator,
  selectIsConvexSaving,
  selectIsSaving,
  type ChangelogSources,
  type DevModeSaveOrchestratorState,
  type NoticeChannel,
  type SaveOrchestratorEffect,
} from "./DevModeSaveOrchestrator";

type VerifyDevCredentials = (
  options?: { username?: string; password?: string },
) => Promise<DevSaveCredentials>;

type UseDevModeSaveOrchestratorArgs = {
  /** Current changelog sources (from useDevModeChangelogState) */
  changelogSources: ChangelogSources;

  /** Draft for save commands (from buildDevSaveDraft) */
  draft: DevSaveDraft;

  /** Server health for Convex availability check */
  convexServerHealth: EditorServerConfigHealth;

  /** Credential verification function */
  verifyDevCredentials: VerifyDevCredentials;

  /** Mutation: save to Convex */
  saveToConvex: (payload: Parameters<ReturnType<typeof createConvexSaveAdapter>["execute"]>[0] extends DevSaveDraft ? never : unknown) => Promise<unknown>;

  /** Mutation: save to GitHub */
  saveArticles: (payload: Parameters<ReturnType<typeof createGitHubSaveAdapter>["execute"]>[0] extends DevSaveDraft ? never : unknown) => Promise<unknown>;

  /** Callback after successful save */
  markChangesSaved: () => void;

  /** Callback to append changelog entry */
  onAppendChangeLogEntry: (entry: ChangeLogEntry) => void;

  /** Callback to change tab */
  onTabChange: (tab: DevModeTab) => void;

  /** Callback to push changelog notice */
  pushChangeLogNotice: (notice: ChangeNotice) => void;

  /** Callback when password key is resolved */
  setPasswordKey: (value: string) => void;
};

type UseDevModeSaveOrchestratorResult = {
  /** Current orchestrator state */
  state: DevModeSaveOrchestratorState;

  /** Whether any save is in progress */
  isSaving: boolean;

  /** Whether Convex save specifically is in progress */
  isConvexSaving: boolean;

  /** GitHub notice (for UI) */
  githubNotice: ChangeNotice | null;

  /** Convex notice (for UI) */
  convexNotice: ChangeNotice | null;

  /** Trigger GitHub save */
  handleSaveToGitHub: () => Promise<void>;

  /** Trigger Convex save */
  handleSaveToConvex: () => Promise<void>;

  /** Set a notice on a channel */
  setNotice: (channel: NoticeChannel, notice: ChangeNotice | null, options?: { clearAfterMs?: number }) => void;

  /** Clear all notices */
  clearSaveNotices: () => void;
};

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

export function useDevModeSaveOrchestrator({
  changelogSources,
  draft,
  convexServerHealth,
  verifyDevCredentials,
  saveToConvex,
  saveArticles,
  markChangesSaved,
  onAppendChangeLogEntry,
  onTabChange,
  pushChangeLogNotice,
  setPasswordKey,
}: UseDevModeSaveOrchestratorArgs): UseDevModeSaveOrchestratorResult {
  // Create orchestrator once
  const orchestratorRef = useRef<DevModeSaveOrchestrator | null>(null);
  if (!orchestratorRef.current) {
    orchestratorRef.current = new DevModeSaveOrchestrator(createInitialSaveOrchestratorState());
  }
  const orchestrator = orchestratorRef.current;

  // Subscribe to state changes using useSyncExternalStore
  const state = useSyncExternalStore(
    useCallback((onStoreChange) => orchestrator.subscribe(onStoreChange), [orchestrator]),
    useCallback(() => orchestrator.getState(), [orchestrator]),
    useCallback(() => orchestrator.getState(), [orchestrator]),
  );

  // Auto-clear timer refs
  const clearTimerRefs = useRef<{ github: number | null; convex: number | null }>({
    github: null,
    convex: null,
  });

  // Update orchestrator when changelog sources change
  useEffect(() => {
    orchestrator.dispatch({
      type: "changelogSourcesUpdated",
      sources: changelogSources,
    });
  }, [changelogSources, orchestrator]);

  // Effect handler for async operations
  const handleEffect = useCallback(
    async (effect: SaveOrchestratorEffect) => {
      if (effect.kind === "verifyCredentials") {
        // First validate availability
        const adapter = effect.destination === "convex"
          ? createConvexSaveAdapter({
              serverHealth: convexServerHealth,
              saveToConvex: saveToConvex as Parameters<typeof createConvexSaveAdapter>[0]["saveToConvex"],
            })
          : createGitHubSaveAdapter({
              saveArticles: saveArticles as Parameters<typeof createGitHubSaveAdapter>[0]["saveArticles"],
            });

        const availability = adapter.validateAvailability(draft);
        if (availability.ok === false) {
          orchestrator.dispatch({
            type: "validationFailed",
            destination: effect.destination,
            message: availability.message,
          });
          return;
        }

        if (!draft.hasPendingChanges) {
          orchestrator.dispatch({
            type: "validationFailed",
            destination: effect.destination,
            message: adapter.noChangesMessage,
          });
          return;
        }

        orchestrator.dispatch({
          type: "validationPassed",
          destination: effect.destination,
        });

        try {
          const credentials = await verifyDevCredentials();
          orchestrator.dispatch({
            type: "credentialsVerified",
            credentials,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Credential verification failed.";
          orchestrator.dispatch({
            type: "credentialsFailed",
            message,
          });
        }
      } else if (effect.kind === "save") {
        try {
          // Re-verify credentials to get full object
          const fullCredentials = await verifyDevCredentials();

          const adapter = effect.destination === "convex"
            ? createConvexSaveAdapter({
                serverHealth: convexServerHealth,
                saveToConvex: saveToConvex as Parameters<typeof createConvexSaveAdapter>[0]["saveToConvex"],
              })
            : createGitHubSaveAdapter({
                saveArticles: saveArticles as Parameters<typeof createGitHubSaveAdapter>[0]["saveArticles"],
              });

          const result = await adapter.execute(draft, fullCredentials);

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
        } catch (error) {
          const message = error instanceof Error ? error.message : "Save failed.";
          orchestrator.dispatch({
            type: "saveFailed",
            destination: effect.destination,
            message,
          });
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
      saveArticles,
      saveToConvex,
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

  const setNotice = useCallback(
    (channel: NoticeChannel, notice: ChangeNotice | null, options?: { clearAfterMs?: number }) => {
      // Clear existing timer
      const existingTimer = clearTimerRefs.current[channel];
      if (existingTimer !== null && typeof window !== "undefined") {
        window.clearTimeout(existingTimer);
        clearTimerRefs.current[channel] = null;
      }

      orchestrator.dispatch({
        type: "setNotice",
        channel,
        notice: notice ? {
          type: notice.type,
          message: notice.message,
          actionHref: notice.actionHref,
          actionLabel: notice.actionLabel,
        } : null,
      });

      // Set auto-clear timer if specified
      if (notice && options?.clearAfterMs && typeof window !== "undefined") {
        clearTimerRefs.current[channel] = window.setTimeout(() => {
          orchestrator.dispatch({ type: "clearNotice", channel });
          clearTimerRefs.current[channel] = null;
        }, options.clearAfterMs);
      }
    },
    [orchestrator],
  );

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

  return useMemo(
    () => ({
      state,
      isSaving: selectIsSaving(state),
      isConvexSaving: selectIsConvexSaving(state),
      githubNotice: toChangeNotice(state.githubNotice),
      convexNotice: toChangeNotice(state.convexNotice),
      handleSaveToGitHub,
      handleSaveToConvex,
      setNotice,
      clearSaveNotices,
    }),
    [clearSaveNotices, handleSaveToConvex, handleSaveToGitHub, setNotice, state],
  );
}
