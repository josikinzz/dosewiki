import { useCallback, useState } from "react";

import { useSaveArticlesMutation, useSaveToConvexMutation } from "@/hooks/useApiMutations";
import {
  createConvexSaveAdapter,
  createGitHubSaveAdapter,
  type DevSaveCommandAdapter,
  type DevSaveCommandResult,
  type DevSaveDraft,
} from "./devSaveCommand";
import type { ChangeNotice } from "./useDevModeChangeLog";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { DevModeTab } from "./devModePageUtils";
import type { EditorServerConfigHealth } from "@/hooks/useEditorServerConfigHealth";

type VerifyDevCredentials = (
  options?: { username?: string; password?: string },
) => Promise<{ username: string; password: string; key: string }>;

type UseDevModeSaveOperationsArgs = {
  draft: DevSaveDraft;
  markChangesSaved: () => void;
  convexServerHealth: EditorServerConfigHealth;
  verifyDevCredentials: VerifyDevCredentials;
  setPasswordKey: (value: string) => void;
  setGithubNotice: (notice: ChangeNotice | null, options?: { clearAfterMs?: number }) => void;
  setConvexNotice: (notice: ChangeNotice | null, options?: { clearAfterMs?: number }) => void;
  onAppendChangeLogEntry: (entry: ChangeLogEntry) => void;
  onTabChange: (tab: DevModeTab) => void;
  pushChangeLogNotice: (notice: ChangeNotice) => void;
};

type NoticeSetter = (notice: ChangeNotice | null, options?: { clearAfterMs?: number }) => void;

export function useDevModeSaveOperations({
  draft,
  markChangesSaved,
  convexServerHealth,
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

  const runSaveCommand = useCallback(
    async (adapter: DevSaveCommandAdapter, setNotice: NoticeSetter) => {
      const availability = adapter.validateAvailability(draft);
      if (availability.ok === false) {
        setNotice({ type: "error", message: availability.message }, { clearAfterMs: 10000 });
        return null;
      }

      if (!draft.hasPendingChanges) {
        const clearAfterMs = adapter.destination === "github" ? 5000 : 10000;
        setNotice({ type: "error", message: adapter.noChangesMessage }, { clearAfterMs });
        return null;
      }

      setNotice({ type: "pending", message: "Verifying credentials…" });

      const credentials = await verifyDevCredentials();

      setNotice({
        type: "pending",
        message: adapter.verifiedMessage(credentials.key).replace("...", "…"),
      });

      const result = await adapter.execute(draft, credentials);
      setPasswordKey(result.resolvedSubmitterKey);

      return result;
    },
    [draft, setPasswordKey, verifyDevCredentials],
  );

  const handleConvexResult = useCallback(
    (result: DevSaveCommandResult) => {
      if (result.changelogEntry) {
        onAppendChangeLogEntry(result.changelogEntry);
      }

      if (result.savedItems.length === 0) {
        setConvexNotice(
          { type: "error", message: "No Convex-compatible changes to save." },
          { clearAfterMs: 10000 },
        );
        return;
      }

      if (result.warnings.length) {
        console.warn("[handleSaveToConvex] Convex save warnings:", result.warnings);
        setConvexNotice(
          {
            type: "error",
            message: `Saved ${result.savedItems.join(" and ")} to Convex as ${result.resolvedSubmitterKey}, but ${result.warnings.length} issue(s) occurred.`,
          },
          { clearAfterMs: 10000 },
        );
        return;
      }

      setConvexNotice(
        {
          type: "success",
          message: `Saved ${result.savedItems.join(" and ")} to Convex as ${result.resolvedSubmitterKey}.`,
        },
        { clearAfterMs: 5000 },
      );

      if (result.markChangesSaved) {
        markChangesSaved();
      }
    },
    [markChangesSaved, onAppendChangeLogEntry, setConvexNotice],
  );

  const handleGitHubResult = useCallback(
    (result: DevSaveCommandResult) => {
      setGithubNotice(
        {
          type: "success",
          message: "Saved to GitHub.",
          actionHref: result.actionHref,
          actionLabel: result.actionLabel,
        },
        { clearAfterMs: 10000 },
      );

      if (result.changelogEntry) {
        onAppendChangeLogEntry(result.changelogEntry);
        onTabChange("change-log");
        pushChangeLogNotice({
          type: "success",
          message: "Commit logged in the Change log tab.",
        });
      }
    },
    [onAppendChangeLogEntry, onTabChange, pushChangeLogNotice, setGithubNotice],
  );

  const handleSaveToConvex = useCallback(async () => {
    const adapter = createConvexSaveAdapter({
      serverHealth: convexServerHealth,
      saveToConvex: saveToConvexMutation.mutateAsync,
    });

    setIsConvexSaving(true);

    try {
      const result = await runSaveCommand(adapter, setConvexNotice);
      if (result) {
        handleConvexResult(result);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save to Convex.";
      setConvexNotice({ type: "error", message }, { clearAfterMs: 10000 });
    } finally {
      setIsConvexSaving(false);
    }
  }, [
    convexServerHealth,
    handleConvexResult,
    runSaveCommand,
    saveToConvexMutation.mutateAsync,
    setConvexNotice,
  ]);

  const handleSaveToGitHub = useCallback(async () => {
    const adapter = createGitHubSaveAdapter({
      saveArticles: saveArticlesMutation.mutateAsync,
    });

    try {
      const result = await runSaveCommand(adapter, setGithubNotice);
      if (result) {
        handleGitHubResult(result);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unexpected error.";
      setGithubNotice({ type: "error", message: reason }, { clearAfterMs: 10000 });
    }
  }, [
    handleGitHubResult,
    runSaveCommand,
    saveArticlesMutation.mutateAsync,
    setGithubNotice,
  ]);

  return {
    isConvexSaving,
    isSaving: saveArticlesMutation.isPending,
    handleSaveToConvex,
    handleSaveToGitHub,
  };
}
