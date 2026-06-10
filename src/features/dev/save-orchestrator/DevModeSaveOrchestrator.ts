/**
 * DevModeSaveOrchestrator - Plain TypeScript state machine for the dev editor save flow.
 *
 * Owns:
 * - Draft aggregation state
 * - hasPendingChanges (4 sources -> 1 computation)
 * - Save operation state (destination/in-progress/credentials)
 * - Two notice channels (github/convex)
 *
 * Does NOT own (these stay as React hooks feeding events):
 * - Convex reactivity
 * - Credential verification / Auth.js session
 * - Document session with conflict detection
 * - Notice auto-clear timers
 */

import type { DatasetChangelogResult } from "@/utils/data/changelog";
import type { DevSaveCommandResult, DevSaveCredentials } from "../pages/devSaveCommand";

// -----------------------------------------------------------------------------
// Changelog Source Types (the 4 derivation sources)
// -----------------------------------------------------------------------------

export type MarkdownChange = {
  markdown: string;
  hasChanges: boolean;
};

export type ChangelogSources = {
  /** Source 1: Dataset/articles diff */
  datasetChangelog: DatasetChangelogResult;
  /** Source 2: Index layouts (psychoactive/chemical/mechanism) */
  psychoactiveManualChangelog: MarkdownChange;
  chemicalManualChangelog: MarkdownChange;
  mechanismManualChangelog: MarkdownChange;
  /** Source 3: About markdown */
  aboutMarkdownChangelog: MarkdownChange;
  /** Source 4: About subtitle + founder keys */
  aboutSubtitleChangelog: MarkdownChange;
  aboutFounderChangelog: MarkdownChange;
};

// -----------------------------------------------------------------------------
// Notice Types
// -----------------------------------------------------------------------------

export type SaveNoticeType = "pending" | "success" | "error";

export type SaveNotice = {
  type: SaveNoticeType;
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

export type NoticeChannel = "github" | "convex";

// -----------------------------------------------------------------------------
// Save Operation Types
// -----------------------------------------------------------------------------

export type SaveDestination = "github" | "convex";

export type SavePhase =
  | "idle"
  | "validating"
  | "verifying-credentials"
  | "executing"
  | "completed"
  | "failed";

export type SaveOperationState = {
  destination: SaveDestination | null;
  phase: SavePhase;
  error: string | null;
};

// -----------------------------------------------------------------------------
// Orchestrator State
// -----------------------------------------------------------------------------

export type DevModeSaveOrchestratorState = {
  /** Aggregated pending changes flag (computed from 4 sources) */
  hasPendingChanges: boolean;

  /** Individual change flags for UI */
  hasArticleDatasetChanges: boolean;
  hasManualLayoutChanges: boolean;
  hasAboutMarkdownChanges: boolean;
  hasAboutMetaChanges: boolean; // subtitle + founders

  /** Save operation state */
  saveOperation: SaveOperationState;

  /** Notice channels */
  githubNotice: SaveNotice | null;
  convexNotice: SaveNotice | null;

  /** Last resolved submitter key from credentials */
  resolvedSubmitterKey: string | null;

  /** Effect tracking for async operations */
  pendingEffect: SaveOrchestratorEffect | null;
  effectSequence: number;
};

// -----------------------------------------------------------------------------
// Effects (async side-effects scheduled by reducer)
// -----------------------------------------------------------------------------

export type SaveOrchestratorEffect =
  | {
      kind: "save";
      id: number;
      destination: SaveDestination;
    }
  | {
      kind: "verifyCredentials";
      id: number;
      destination: SaveDestination;
    };

// -----------------------------------------------------------------------------
// Events
// -----------------------------------------------------------------------------

export type DevModeSaveOrchestratorEvent =
  // Changelog source updates
  | { type: "changelogSourcesUpdated"; sources: ChangelogSources }

  // Save initiation
  | { type: "saveToGitHubRequested" }
  | { type: "saveToConvexRequested" }

  // Validation results
  | { type: "validationFailed"; destination: SaveDestination; message: string }
  | { type: "validationPassed"; destination: SaveDestination }

  // Credential verification
  | { type: "credentialsVerified"; credentials: DevSaveCredentials }
  | { type: "credentialsFailed"; message: string }

  // Save execution results
  | { type: "saveSucceeded"; result: DevSaveCommandResult }
  | { type: "saveFailed"; destination: SaveDestination; message: string }

  // Notice management
  | { type: "setNotice"; channel: NoticeChannel; notice: SaveNotice | null }
  | { type: "clearNotices" }
  | { type: "clearNotice"; channel: NoticeChannel }

  // Effect lifecycle
  | { type: "effectCompleted"; effectId: number }
  | { type: "effectFailed"; effectId: number; message: string };

// -----------------------------------------------------------------------------
// Initial State Factory
// -----------------------------------------------------------------------------

export function createInitialSaveOrchestratorState(): DevModeSaveOrchestratorState {
  return {
    hasPendingChanges: false,
    hasArticleDatasetChanges: false,
    hasManualLayoutChanges: false,
    hasAboutMarkdownChanges: false,
    hasAboutMetaChanges: false,
    saveOperation: {
      destination: null,
      phase: "idle",
      error: null,
    },
    githubNotice: null,
    convexNotice: null,
    resolvedSubmitterKey: null,
    pendingEffect: null,
    effectSequence: 0,
  };
}

// -----------------------------------------------------------------------------
// Pure Computation: hasPendingChanges from 4 sources
// -----------------------------------------------------------------------------

export function computeHasPendingChanges(sources: ChangelogSources): {
  hasPendingChanges: boolean;
  hasArticleDatasetChanges: boolean;
  hasManualLayoutChanges: boolean;
  hasAboutMarkdownChanges: boolean;
  hasAboutMetaChanges: boolean;
} {
  const hasArticleDatasetChanges =
    sources.datasetChangelog.sections.length > 0 &&
    sources.datasetChangelog.markdown.trim().length > 0;

  const hasManualLayoutChanges =
    sources.psychoactiveManualChangelog.hasChanges ||
    sources.chemicalManualChangelog.hasChanges ||
    sources.mechanismManualChangelog.hasChanges;

  const hasAboutMarkdownChanges = sources.aboutMarkdownChangelog.hasChanges;

  const hasAboutMetaChanges =
    sources.aboutSubtitleChangelog.hasChanges ||
    sources.aboutFounderChangelog.hasChanges;

  const hasPendingChanges =
    hasArticleDatasetChanges ||
    hasManualLayoutChanges ||
    hasAboutMarkdownChanges ||
    hasAboutMetaChanges;

  return {
    hasPendingChanges,
    hasArticleDatasetChanges,
    hasManualLayoutChanges,
    hasAboutMarkdownChanges,
    hasAboutMetaChanges,
  };
}

// -----------------------------------------------------------------------------
// Helper: Schedule an effect
// -----------------------------------------------------------------------------

function nextEffect(
  state: DevModeSaveOrchestratorState,
  effect: Omit<SaveOrchestratorEffect, "id">,
): DevModeSaveOrchestratorState {
  const id = state.effectSequence + 1;
  return {
    ...state,
    effectSequence: id,
    pendingEffect: { ...effect, id } as SaveOrchestratorEffect,
  };
}

// -----------------------------------------------------------------------------
// Reducer
// -----------------------------------------------------------------------------

export function saveOrchestratorReducer(
  state: DevModeSaveOrchestratorState,
  event: DevModeSaveOrchestratorEvent,
): DevModeSaveOrchestratorState {
  switch (event.type) {
    case "changelogSourcesUpdated": {
      const changes = computeHasPendingChanges(event.sources);
      return {
        ...state,
        ...changes,
      };
    }

    case "saveToGitHubRequested": {
      if (state.saveOperation.phase !== "idle") {
        return state;
      }
      return {
        ...nextEffect(state, { kind: "verifyCredentials", destination: "github" }),
        saveOperation: {
          destination: "github",
          phase: "validating",
          error: null,
        },
        githubNotice: null,
      };
    }

    case "saveToConvexRequested": {
      if (state.saveOperation.phase !== "idle") {
        return state;
      }
      return {
        ...nextEffect(state, { kind: "verifyCredentials", destination: "convex" }),
        saveOperation: {
          destination: "convex",
          phase: "validating",
          error: null,
        },
        convexNotice: null,
      };
    }

    case "validationFailed": {
      const noticeKey = event.destination === "github" ? "githubNotice" : "convexNotice";
      return {
        ...state,
        saveOperation: {
          destination: null,
          phase: "idle",
          error: event.message,
        },
        pendingEffect: null,
        [noticeKey]: {
          type: "error",
          message: event.message,
        },
      };
    }

    case "validationPassed": {
      const noticeKey = event.destination === "github" ? "githubNotice" : "convexNotice";
      return {
        ...state,
        saveOperation: {
          ...state.saveOperation,
          phase: "verifying-credentials",
        },
        [noticeKey]: {
          type: "pending",
          message: "Verifying credentials...",
        },
      };
    }

    case "credentialsVerified": {
      const dest = state.saveOperation.destination;
      if (!dest || state.saveOperation.phase !== "verifying-credentials") {
        return state;
      }

      const noticeKey = dest === "github" ? "githubNotice" : "convexNotice";
      const targetLabel = dest === "github" ? "Archiving to GitHub" : "Saving to Convex";

      return {
        ...nextEffect(state, { kind: "save", destination: dest }),
        resolvedSubmitterKey: event.credentials.key,
        saveOperation: {
          ...state.saveOperation,
          phase: "executing",
        },
        [noticeKey]: {
          type: "pending",
          message: `Credentials verified for ${event.credentials.key}. ${targetLabel}...`,
        },
      };
    }

    case "credentialsFailed": {
      const dest = state.saveOperation.destination;
      const noticeKey = dest === "github" ? "githubNotice" : "convexNotice";
      return {
        ...state,
        saveOperation: {
          destination: null,
          phase: "idle",
          error: event.message,
        },
        pendingEffect: null,
        [noticeKey]: {
          type: "error",
          message: event.message,
        },
      };
    }

    case "saveSucceeded": {
      const dest = state.saveOperation.destination;
      const noticeKey = dest === "github" ? "githubNotice" : "convexNotice";

      let notice: SaveNotice;
      if (dest === "github") {
        notice = {
          type: "success",
          message: "Archived to GitHub.",
          actionHref: event.result.actionHref,
          actionLabel: event.result.actionLabel,
        };
      } else {
        if (event.result.savedItems.length === 0) {
          notice = {
            type: "error",
            message: "No Convex-compatible changes to save.",
          };
        } else if (event.result.warnings.length > 0) {
          notice = {
            type: "error",
            message: `Saved ${event.result.savedItems.join(" and ")} to Convex as ${event.result.resolvedSubmitterKey}, but ${event.result.warnings.length} issue(s) occurred.`,
          };
        } else {
          notice = {
            type: "success",
            message: `Saved ${event.result.savedItems.join(" and ")} to Convex as ${event.result.resolvedSubmitterKey}.`,
          };
        }
      }

      return {
        ...state,
        saveOperation: {
          destination: null,
          phase: "idle",
          error: null,
        },
        pendingEffect: null,
        resolvedSubmitterKey: event.result.resolvedSubmitterKey,
        [noticeKey]: notice,
      };
    }

    case "saveFailed": {
      const noticeKey = event.destination === "github" ? "githubNotice" : "convexNotice";
      return {
        ...state,
        saveOperation: {
          destination: null,
          phase: "idle",
          error: event.message,
        },
        pendingEffect: null,
        [noticeKey]: {
          type: "error",
          message: event.message,
        },
      };
    }

    case "setNotice": {
      const noticeKey = event.channel === "github" ? "githubNotice" : "convexNotice";
      return {
        ...state,
        [noticeKey]: event.notice,
      };
    }

    case "clearNotices": {
      if (state.githubNotice === null && state.convexNotice === null) {
        return state;
      }
      return {
        ...state,
        githubNotice: null,
        convexNotice: null,
      };
    }

    case "clearNotice": {
      const noticeKey = event.channel === "github" ? "githubNotice" : "convexNotice";
      return {
        ...state,
        [noticeKey]: null,
      };
    }

    case "effectCompleted": {
      if (state.pendingEffect?.id !== event.effectId) {
        return state;
      }
      return {
        ...state,
        pendingEffect: null,
      };
    }

    case "effectFailed": {
      if (state.pendingEffect?.id !== event.effectId) {
        return state;
      }
      const dest = state.saveOperation.destination;
      const noticeKey = dest === "github" ? "githubNotice" : "convexNotice";
      return {
        ...state,
        saveOperation: {
          destination: null,
          phase: "idle",
          error: event.message,
        },
        pendingEffect: null,
        [noticeKey]: {
          type: "error",
          message: event.message,
        },
      };
    }

    default:
      return state;
  }
}

// -----------------------------------------------------------------------------
// Orchestrator Class (dispatch/getState/subscribe pattern)
// -----------------------------------------------------------------------------

export type SaveOrchestratorSubscriber = (state: DevModeSaveOrchestratorState) => void;

export class DevModeSaveOrchestrator {
  private state: DevModeSaveOrchestratorState;
  private subscribers: Set<SaveOrchestratorSubscriber>;

  constructor(initialState?: DevModeSaveOrchestratorState) {
    this.state = initialState ?? createInitialSaveOrchestratorState();
    this.subscribers = new Set();
  }

  getState(): DevModeSaveOrchestratorState {
    return this.state;
  }

  dispatch(event: DevModeSaveOrchestratorEvent): SaveOrchestratorEffect | null {
    const prevState = this.state;
    this.state = saveOrchestratorReducer(this.state, event);

    if (this.state !== prevState) {
      this.notifySubscribers();
    }

    // Return the pending effect if one was scheduled by this dispatch
    return this.state.pendingEffect;
  }

  subscribe(fn: SaveOrchestratorSubscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private notifySubscribers(): void {
    const currentState = this.state;
    this.subscribers.forEach((fn) => fn(currentState));
  }
}

// -----------------------------------------------------------------------------
// Selector Helpers
// -----------------------------------------------------------------------------

export function selectIsSaving(state: DevModeSaveOrchestratorState): boolean {
  return state.saveOperation.phase !== "idle";
}

export function selectIsConvexSaving(state: DevModeSaveOrchestratorState): boolean {
  return (
    state.saveOperation.destination === "convex" &&
    state.saveOperation.phase !== "idle"
  );
}

export function selectIsGitHubSaving(state: DevModeSaveOrchestratorState): boolean {
  return (
    state.saveOperation.destination === "github" &&
    state.saveOperation.phase !== "idle"
  );
}

export function selectPrimaryNotice(
  state: DevModeSaveOrchestratorState,
  convexEnabled: boolean,
): SaveNotice | null {
  return convexEnabled ? state.convexNotice : state.githubNotice;
}
