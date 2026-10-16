import type { DatasetChangelogResult } from "@/utils/data/changelog";
import type { DevSaveCommandResult, DevSaveCredentials } from "../pages/devSaveCommand";

type MarkdownChange = {
  markdown: string;
  hasChanges: boolean;
};

export type ChangelogSources = {
  datasetChangelog: DatasetChangelogResult;
  psychoactiveManualChangelog: MarkdownChange;
  chemicalManualChangelog: MarkdownChange;
  mechanismManualChangelog: MarkdownChange;
};

type SaveNoticeType = "pending" | "success" | "error";

type SaveNotice = {
  type: SaveNoticeType;
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

type SavePhase =
  | "idle"
  | "validating"
  | "verifying-credentials"
  | "executing";

type SaveOperationState = {
  phase: SavePhase;
  error: string | null;
}

export type DevModeSaveOrchestratorState = {
  hasPendingChanges: boolean;

  hasArticleDatasetChanges: boolean;
  hasManualLayoutChanges: boolean;

  saveOperation: SaveOperationState;

  notice: SaveNotice | null;

  resolvedSubmitterKey: string | null;

  pendingEffect: SaveOrchestratorEffect | null;
  effectSequence: number;
};

export type SaveOrchestratorEffect =
  | { kind: "save"; id: number }
  | { kind: "verifyCredentials"; id: number };

export type DevModeSaveOrchestratorEvent =
  | { type: "changelogSourcesUpdated"; sources: ChangelogSources }

  | { type: "saveRequested" }

  | { type: "validationFailed"; message: string }
  | { type: "validationPassed" }

  | { type: "credentialsVerified"; credentials: DevSaveCredentials; message?: string }
  | { type: "credentialsFailed"; message: string }

  | { type: "saveSucceeded"; result: DevSaveCommandResult }
  | { type: "saveFailed"; message: string }

  | { type: "setNotice"; notice: SaveNotice | null }
  | { type: "clearNotice" }

  | { type: "effectCompleted"; effectId: number }
  | { type: "effectFailed"; effectId: number; message: string };

export function createInitialSaveOrchestratorState(): DevModeSaveOrchestratorState {
  return {
    hasPendingChanges: false,
    hasArticleDatasetChanges: false,
    hasManualLayoutChanges: false,
    saveOperation: {
      phase: "idle",
      error: null,
    },
    notice: null,
    resolvedSubmitterKey: null,
    pendingEffect: null,
    effectSequence: 0,
  };
}

export function computeHasPendingChanges(sources: ChangelogSources): {
  hasPendingChanges: boolean;
  hasArticleDatasetChanges: boolean;
  hasManualLayoutChanges: boolean;
} {
  const hasArticleDatasetChanges =
    sources.datasetChangelog.sections.length > 0 &&
    sources.datasetChangelog.markdown.trim().length > 0;

  const hasManualLayoutChanges =
    sources.psychoactiveManualChangelog.hasChanges ||
    sources.chemicalManualChangelog.hasChanges ||
    sources.mechanismManualChangelog.hasChanges;

  return {
    hasPendingChanges: hasArticleDatasetChanges || hasManualLayoutChanges,
    hasArticleDatasetChanges,
    hasManualLayoutChanges,
  };
}

function nextEffect(
  state: DevModeSaveOrchestratorState,
  kind: SaveOrchestratorEffect["kind"],
): DevModeSaveOrchestratorState {
  const id = state.effectSequence + 1;
  return {
    ...state,
    effectSequence: id,
    pendingEffect: { kind, id },
  };
}

function failOperation(
  state: DevModeSaveOrchestratorState,
  message: string,
): DevModeSaveOrchestratorState {
  return {
    ...state,
    saveOperation: { phase: "idle", error: message },
    pendingEffect: null,
    notice: { type: "error", message },
  };
}

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

    case "saveRequested": {
      if (state.saveOperation.phase !== "idle") {
        return state;
      }
      return {
        ...nextEffect(state, "verifyCredentials"),
        saveOperation: { phase: "validating", error: null },
        notice: null,
      };
    }

    case "validationFailed":
      return failOperation(state, event.message);

    case "validationPassed": {
      return {
        ...state,
        saveOperation: {
          ...state.saveOperation,
          phase: "verifying-credentials",
        },
        notice: {
          type: "pending",
          message: "Verifying credentials...",
        },
      };
    }

    case "credentialsVerified": {
      if (state.saveOperation.phase !== "verifying-credentials") {
        return state;
      }

      return {
        ...nextEffect(state, "save"),
        resolvedSubmitterKey: event.credentials.key,
        saveOperation: {
          ...state.saveOperation,
          phase: "executing",
        },
        notice: {
          type: "pending",
          message: event.message ?? `Committing to production as ${event.credentials.key}...`,
        },
      };
    }

    case "credentialsFailed":
      return failOperation(state, event.message);

    case "saveSucceeded": {
      const { result } = event;
      const items = result.savedItems.join(" and ");
      const link = result.actionHref
        ? { actionHref: result.actionHref, actionLabel: result.actionLabel }
        : {};
      let notice: SaveNotice;
      if (result.savedItems.length === 0) {
        notice = {
          type: "error",
          message: "Nothing in the draft can be committed.",
        };
      } else if (result.destination === "proposal") {
        notice = {
          type: "success",
          message: `Submitted ${items} for review as ${result.resolvedSubmitterKey}.`,
          ...link,
        };
      } else if (result.warnings.length > 0) {
        notice = {
          type: "error",
          message: `Committed ${items} to production as ${result.resolvedSubmitterKey}. ${result.warnings.join(" ")}`,
        };
      } else {
        notice = {
          type: "success",
          message: `Committed ${items} to production as ${result.resolvedSubmitterKey}.`,
          ...link,
        };
      }

      return {
        ...state,
        saveOperation: { phase: "idle", error: null },
        pendingEffect: null,
        resolvedSubmitterKey: event.result.resolvedSubmitterKey,
        notice,
      };
    }

    case "saveFailed":
      return failOperation(state, event.message);

    case "setNotice": {
      return {
        ...state,
        notice: event.notice,
      };
    }

    case "clearNotice": {
      if (state.notice === null) {
        return state;
      }
      return {
        ...state,
        notice: null,
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
      return failOperation(state, event.message);
    }

    default:
      return state;
  }
}

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

    return this.state.pendingEffect !== prevState.pendingEffect ? this.state.pendingEffect : null;
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

export function selectIsSaving(state: DevModeSaveOrchestratorState): boolean {
  return state.saveOperation.phase !== "idle";
}
