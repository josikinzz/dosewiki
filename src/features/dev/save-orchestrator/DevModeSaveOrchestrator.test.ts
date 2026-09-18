import { describe, expect, it } from "vitest";
import {
  computeHasPendingChanges,
  createInitialSaveOrchestratorState,
  DevModeSaveOrchestrator,
  saveOrchestratorReducer,
  selectIsSaving,
  type ChangelogSources,
  type DevModeSaveOrchestratorState,
} from "./DevModeSaveOrchestrator";

const emptyChangelogSources: ChangelogSources = {
  datasetChangelog: { sections: [], markdown: "", articles: [] },
  psychoactiveManualChangelog: { markdown: "", hasChanges: false },
  chemicalManualChangelog: { markdown: "", hasChanges: false },
  mechanismManualChangelog: { markdown: "", hasChanges: false },
};

const withDatasetChanges: ChangelogSources = {
  ...emptyChangelogSources,
  datasetChangelog: {
    sections: [{ index: 0, heading: "Test", markdown: "# Test\n+ change" }],
    markdown: "# Test\n+ change",
    articles: [],
  },
};

const withManualLayoutChanges: ChangelogSources = {
  ...emptyChangelogSources,
  psychoactiveManualChangelog: { markdown: "# Psychoactive\n+ change", hasChanges: true },
};

describe("computeHasPendingChanges", () => {
  it("returns false when no sources have changes", () => {
    const result = computeHasPendingChanges(emptyChangelogSources);
    expect(result.hasPendingChanges).toBe(false);
    expect(result.hasArticleDatasetChanges).toBe(false);
    expect(result.hasManualLayoutChanges).toBe(false);
  });

  it("detects dataset changes (source 1)", () => {
    const result = computeHasPendingChanges(withDatasetChanges);
    expect(result.hasPendingChanges).toBe(true);
    expect(result.hasArticleDatasetChanges).toBe(true);
  });

  it("detects manual layout changes (source 2)", () => {
    const result = computeHasPendingChanges(withManualLayoutChanges);
    expect(result.hasPendingChanges).toBe(true);
    expect(result.hasManualLayoutChanges).toBe(true);
  });

  it("aggregates multiple sources", () => {
    const sources: ChangelogSources = {
      ...emptyChangelogSources,
      datasetChangelog: {
        sections: [{ index: 0, heading: "Test", markdown: "# Test\n+ change" }],
        markdown: "# Test\n+ change",
        articles: [],
      },
      mechanismManualChangelog: { markdown: "# Mechanism\n+ change", hasChanges: true },
    };
    const result = computeHasPendingChanges(sources);
    expect(result.hasPendingChanges).toBe(true);
    expect(result.hasArticleDatasetChanges).toBe(true);
    expect(result.hasManualLayoutChanges).toBe(true);
  });
});

describe("saveOrchestratorReducer", () => {
  it("creates initial state with no pending changes", () => {
    const state = createInitialSaveOrchestratorState();
    expect(state.hasPendingChanges).toBe(false);
    expect(state.saveOperation.phase).toBe("idle");
    expect(state.notice).toBeNull();
  });

  it("updates hasPendingChanges when sources change", () => {
    let state = createInitialSaveOrchestratorState();
    state = saveOrchestratorReducer(state, {
      type: "changelogSourcesUpdated",
      sources: withDatasetChanges,
    });
    expect(state.hasPendingChanges).toBe(true);
    expect(state.hasArticleDatasetChanges).toBe(true);
  });

  describe("save flow", () => {
    it("transitions through save phases", () => {
      let state = createInitialSaveOrchestratorState();

      state = saveOrchestratorReducer(state, { type: "saveRequested" });
      expect(state.saveOperation.phase).toBe("validating");
      expect(state.pendingEffect?.kind).toBe("verifyCredentials");

      state = saveOrchestratorReducer(state, { type: "validationPassed" });
      expect(state.saveOperation.phase).toBe("verifying-credentials");
      expect(state.notice?.type).toBe("pending");

      state = saveOrchestratorReducer(state, {
        type: "credentialsVerified",
        credentials: { key: "ADMIN" },
      });
      expect(state.saveOperation.phase).toBe("executing");
      expect(state.pendingEffect?.kind).toBe("save");
      expect(state.resolvedSubmitterKey).toBe("ADMIN");
      expect(state.notice?.message).toContain("Committing to production");

      state = saveOrchestratorReducer(state, {
        type: "saveSucceeded",
        result: {
          destination: "production",
          savedItems: ["articles", "about"],
          warnings: [],
          resolvedSubmitterKey: "ADMIN",
          changelogEntry: null,
          markChangesSaved: true,
        },
      });
      expect(state.saveOperation.phase).toBe("idle");
      expect(state.pendingEffect).toBeNull();
      expect(state.notice?.type).toBe("success");
      expect(state.notice?.message).toContain("articles and about");
    });

    it("ignores credentialsVerified outside the verifying phase", () => {
      const state = createInitialSaveOrchestratorState();
      expect(
        saveOrchestratorReducer(state, { type: "credentialsVerified", credentials: { key: "ADMIN" } }),
      ).toBe(state);
    });

    it("handles validation failure", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, { type: "saveRequested" });
      state = saveOrchestratorReducer(state, {
        type: "validationFailed",
        message: "No changes to save",
      });

      expect(state.saveOperation.phase).toBe("idle");
      expect(state.saveOperation.error).toBe("No changes to save");
      expect(state.pendingEffect).toBeNull();
      expect(state.notice).toEqual({ type: "error", message: "No changes to save" });
    });

    it("handles credential failure", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, { type: "saveRequested" });
      state = saveOrchestratorReducer(state, { type: "validationPassed" });
      state = saveOrchestratorReducer(state, {
        type: "credentialsFailed",
        message: "Sign in before continuing.",
      });

      expect(state.saveOperation.phase).toBe("idle");
      expect(state.notice?.type).toBe("error");
    });

    it("handles save failure", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, { type: "saveRequested" });
      state = saveOrchestratorReducer(state, { type: "validationPassed" });
      state = saveOrchestratorReducer(state, {
        type: "credentialsVerified",
        credentials: { key: "ADMIN" },
      });
      state = saveOrchestratorReducer(state, {
        type: "saveFailed",
        message: "Network error",
      });

      expect(state.saveOperation.phase).toBe("idle");
      expect(state.notice?.type).toBe("error");
      expect(state.notice?.message).toBe("Network error");
    });

    it("handles a save with warnings", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, { type: "saveRequested" });
      state = saveOrchestratorReducer(state, { type: "validationPassed" });
      state = saveOrchestratorReducer(state, {
        type: "credentialsVerified",
        credentials: { key: "ADMIN" },
      });
      state = saveOrchestratorReducer(state, {
        type: "saveSucceeded",
        result: {
          destination: "production",
          savedItems: ["articles"],
          warnings: ["Revalidation failed"],
          resolvedSubmitterKey: "ADMIN",
          changelogEntry: null,
          markChangesSaved: false,
        },
      });

      expect(state.notice?.type).toBe("error");
      expect(state.notice?.message).toContain("1 issue(s) occurred");
    });

    it("handles an empty save result", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, { type: "saveRequested" });
      state = saveOrchestratorReducer(state, { type: "validationPassed" });
      state = saveOrchestratorReducer(state, {
        type: "credentialsVerified",
        credentials: { key: "ADMIN" },
      });
      state = saveOrchestratorReducer(state, {
        type: "saveSucceeded",
        result: {
          destination: "production",
          savedItems: [],
          warnings: [],
          resolvedSubmitterKey: "ADMIN",
          changelogEntry: null,
          markChangesSaved: false,
        },
      });

      expect(state.notice?.type).toBe("error");
      expect(state.notice?.message).toBe("Nothing in the draft can be committed.");
    });

    it("phrases a proposal submission as held for review and carries the queue link", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, { type: "saveRequested" });
      state = saveOrchestratorReducer(state, { type: "validationPassed" });
      state = saveOrchestratorReducer(state, {
        type: "credentialsVerified",
        credentials: { key: "EDITOR" },
        message: "Submitting for review as EDITOR...",
      });
      expect(state.notice?.message).toBe("Submitting for review as EDITOR...");

      state = saveOrchestratorReducer(state, {
        type: "saveSucceeded",
        result: {
          destination: "proposal",
          savedItems: ["Proposal #abc123"],
          warnings: [],
          resolvedSubmitterKey: "EDITOR",
          changelogEntry: null,
          markChangesSaved: true,
          actionHref: "/dev/queue",
          actionLabel: "View in queue",
        },
      });

      expect(state.notice).toEqual({
        type: "success",
        message: "Submitted Proposal #abc123 for review as EDITOR.",
        actionHref: "/dev/queue",
        actionLabel: "View in queue",
      });
    });
  });

  describe("notice management", () => {
    it("sets and clears the notice", () => {
      let state = createInitialSaveOrchestratorState();

      state = saveOrchestratorReducer(state, {
        type: "setNotice",
        notice: { type: "success", message: "Done!" },
      });
      expect(state.notice?.message).toBe("Done!");

      state = saveOrchestratorReducer(state, { type: "clearNotice" });
      expect(state.notice).toBeNull();
    });
  });

  describe("effect lifecycle", () => {
    it("only acknowledges the effect it scheduled", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, { type: "saveRequested" });
      const effectId = state.pendingEffect!.id;

      expect(saveOrchestratorReducer(state, { type: "effectCompleted", effectId: effectId + 1 })).toBe(state);
      expect(saveOrchestratorReducer(state, { type: "effectFailed", effectId: effectId + 1, message: "x" })).toBe(
        state,
      );

      const failed = saveOrchestratorReducer(state, { type: "effectFailed", effectId, message: "boom" });
      expect(failed.saveOperation.phase).toBe("idle");
      expect(failed.notice).toEqual({ type: "error", message: "boom" });
    });
  });

  describe("concurrent save prevention", () => {
    it("ignores save requests while already saving", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, { type: "saveRequested" });
      const prevState = state;

      state = saveOrchestratorReducer(state, { type: "saveRequested" });
      expect(state).toBe(prevState); // No change
    });
  });
});

describe("DevModeSaveOrchestrator class", () => {
  it("provides dispatch/getState/subscribe interface", () => {
    const orchestrator = new DevModeSaveOrchestrator();
    expect(orchestrator.getState().hasPendingChanges).toBe(false);

    const states: DevModeSaveOrchestratorState[] = [];
    const unsubscribe = orchestrator.subscribe((state) => states.push(state));

    orchestrator.dispatch({
      type: "changelogSourcesUpdated",
      sources: withDatasetChanges,
    });

    expect(orchestrator.getState().hasPendingChanges).toBe(true);
    expect(states).toHaveLength(1);
    expect(states[0].hasPendingChanges).toBe(true);

    unsubscribe();
    orchestrator.dispatch({
      type: "changelogSourcesUpdated",
      sources: emptyChangelogSources,
    });
    expect(states).toHaveLength(1); // No new notifications after unsubscribe
  });

  it("returns the effect only from the dispatch that scheduled it", () => {
    const orchestrator = new DevModeSaveOrchestrator();
    const effect = orchestrator.dispatch({ type: "saveRequested" });

    expect(effect?.kind).toBe("verifyCredentials");
    expect(orchestrator.dispatch({ type: "saveRequested" })).toBeNull();
  });

  it("does not notify subscribers when state unchanged", () => {
    const orchestrator = new DevModeSaveOrchestrator();
    const states: DevModeSaveOrchestratorState[] = [];
    orchestrator.subscribe((state) => states.push(state));

    // Dispatch event that doesn't change state
    orchestrator.dispatch({ type: "clearNotice" }); // Already null
    expect(states).toHaveLength(0);
  });
});

describe("selectors", () => {
  it("selectIsSaving returns true during any save phase", () => {
    let state = createInitialSaveOrchestratorState();
    expect(selectIsSaving(state)).toBe(false);

    state = saveOrchestratorReducer(state, { type: "saveRequested" });
    expect(selectIsSaving(state)).toBe(true);
  });
});
