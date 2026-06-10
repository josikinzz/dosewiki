import { describe, expect, it } from "vitest";
import {
  computeHasPendingChanges,
  createInitialSaveOrchestratorState,
  DevModeSaveOrchestrator,
  saveOrchestratorReducer,
  selectIsConvexSaving,
  selectIsGitHubSaving,
  selectIsSaving,
  selectPrimaryNotice,
  type ChangelogSources,
  type DevModeSaveOrchestratorState,
} from "./DevModeSaveOrchestrator";

const emptyChangelogSources: ChangelogSources = {
  datasetChangelog: { sections: [], markdown: "", articles: [] },
  psychoactiveManualChangelog: { markdown: "", hasChanges: false },
  chemicalManualChangelog: { markdown: "", hasChanges: false },
  mechanismManualChangelog: { markdown: "", hasChanges: false },
  aboutMarkdownChangelog: { markdown: "", hasChanges: false },
  aboutSubtitleChangelog: { markdown: "", hasChanges: false },
  aboutFounderChangelog: { markdown: "", hasChanges: false },
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

const withAboutMarkdownChanges: ChangelogSources = {
  ...emptyChangelogSources,
  aboutMarkdownChangelog: { markdown: "# About\n+ change", hasChanges: true },
};

const withAboutMetaChanges: ChangelogSources = {
  ...emptyChangelogSources,
  aboutSubtitleChangelog: { markdown: "# Subtitle\n+ change", hasChanges: true },
};

describe("computeHasPendingChanges", () => {
  it("returns false when no sources have changes", () => {
    const result = computeHasPendingChanges(emptyChangelogSources);
    expect(result.hasPendingChanges).toBe(false);
    expect(result.hasArticleDatasetChanges).toBe(false);
    expect(result.hasManualLayoutChanges).toBe(false);
    expect(result.hasAboutMarkdownChanges).toBe(false);
    expect(result.hasAboutMetaChanges).toBe(false);
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

  it("detects about markdown changes (source 3)", () => {
    const result = computeHasPendingChanges(withAboutMarkdownChanges);
    expect(result.hasPendingChanges).toBe(true);
    expect(result.hasAboutMarkdownChanges).toBe(true);
  });

  it("detects about meta changes (source 4)", () => {
    const result = computeHasPendingChanges(withAboutMetaChanges);
    expect(result.hasPendingChanges).toBe(true);
    expect(result.hasAboutMetaChanges).toBe(true);
  });

  it("aggregates multiple sources", () => {
    const sources: ChangelogSources = {
      ...emptyChangelogSources,
      datasetChangelog: {
        sections: [{ index: 0, heading: "Test", markdown: "# Test\n+ change" }],
        markdown: "# Test\n+ change",
        articles: [],
      },
      aboutFounderChangelog: { markdown: "# Founders\n+ change", hasChanges: true },
    };
    const result = computeHasPendingChanges(sources);
    expect(result.hasPendingChanges).toBe(true);
    expect(result.hasArticleDatasetChanges).toBe(true);
    expect(result.hasAboutMetaChanges).toBe(true);
  });
});

describe("saveOrchestratorReducer", () => {
  it("creates initial state with no pending changes", () => {
    const state = createInitialSaveOrchestratorState();
    expect(state.hasPendingChanges).toBe(false);
    expect(state.saveOperation.phase).toBe("idle");
    expect(state.githubNotice).toBeNull();
    expect(state.convexNotice).toBeNull();
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

  describe("GitHub save flow", () => {
    it("transitions through save phases", () => {
      let state = createInitialSaveOrchestratorState();

      // Request save
      state = saveOrchestratorReducer(state, { type: "saveToGitHubRequested" });
      expect(state.saveOperation.destination).toBe("github");
      expect(state.saveOperation.phase).toBe("validating");
      expect(state.pendingEffect?.kind).toBe("verifyCredentials");

      // Validation passes
      state = saveOrchestratorReducer(state, {
        type: "validationPassed",
        destination: "github",
      });
      expect(state.saveOperation.phase).toBe("verifying-credentials");
      expect(state.githubNotice?.type).toBe("pending");

      // Credentials verified
      state = saveOrchestratorReducer(state, {
        type: "credentialsVerified",
        credentials: { username: "test", password: "pass", key: "TEST" },
      });
      expect(state.saveOperation.phase).toBe("executing");
      expect(state.resolvedSubmitterKey).toBe("TEST");
      expect(state.pendingEffect?.kind).toBe("save");

      // Save succeeds
      state = saveOrchestratorReducer(state, {
        type: "saveSucceeded",
        result: {
          destination: "github",
          savedItems: ["GitHub"],
          warnings: [],
          resolvedSubmitterKey: "TEST",
          changelogEntry: null,
          markChangesSaved: false,
          actionHref: "https://github.com/commit/abc",
          actionLabel: "Open commit",
        },
      });
      expect(state.saveOperation.phase).toBe("idle");
      expect(state.githubNotice?.type).toBe("success");
      expect(state.githubNotice?.actionHref).toBe("https://github.com/commit/abc");
    });

    it("handles validation failure", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, { type: "saveToGitHubRequested" });
      state = saveOrchestratorReducer(state, {
        type: "validationFailed",
        destination: "github",
        message: "No changes to archive",
      });

      expect(state.saveOperation.phase).toBe("idle");
      expect(state.githubNotice?.type).toBe("error");
      expect(state.githubNotice?.message).toBe("No changes to archive");
    });

    it("handles credential failure", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, { type: "saveToGitHubRequested" });
      state = saveOrchestratorReducer(state, {
        type: "validationPassed",
        destination: "github",
      });
      state = saveOrchestratorReducer(state, {
        type: "credentialsFailed",
        message: "Invalid credentials",
      });

      expect(state.saveOperation.phase).toBe("idle");
      expect(state.githubNotice?.type).toBe("error");
    });

    it("handles save failure", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, { type: "saveToGitHubRequested" });
      state = saveOrchestratorReducer(state, {
        type: "validationPassed",
        destination: "github",
      });
      state = saveOrchestratorReducer(state, {
        type: "credentialsVerified",
        credentials: { username: "test", password: "pass", key: "TEST" },
      });
      state = saveOrchestratorReducer(state, {
        type: "saveFailed",
        destination: "github",
        message: "Network error",
      });

      expect(state.saveOperation.phase).toBe("idle");
      expect(state.githubNotice?.type).toBe("error");
      expect(state.githubNotice?.message).toBe("Network error");
    });
  });

  describe("Convex save flow", () => {
    it("transitions through save phases", () => {
      let state = createInitialSaveOrchestratorState();

      state = saveOrchestratorReducer(state, { type: "saveToConvexRequested" });
      expect(state.saveOperation.destination).toBe("convex");
      expect(state.saveOperation.phase).toBe("validating");

      state = saveOrchestratorReducer(state, {
        type: "validationPassed",
        destination: "convex",
      });
      state = saveOrchestratorReducer(state, {
        type: "credentialsVerified",
        credentials: { username: "test", password: "pass", key: "ADMIN" },
      });
      expect(state.saveOperation.phase).toBe("executing");
      expect(state.convexNotice?.message).toContain("Saving to Convex");

      state = saveOrchestratorReducer(state, {
        type: "saveSucceeded",
        result: {
          destination: "convex",
          savedItems: ["articles", "about"],
          warnings: [],
          resolvedSubmitterKey: "ADMIN",
          changelogEntry: null,
          markChangesSaved: true,
        },
      });
      expect(state.convexNotice?.type).toBe("success");
      expect(state.convexNotice?.message).toContain("articles and about");
    });

    it("handles Convex save with warnings", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, { type: "saveToConvexRequested" });
      state = saveOrchestratorReducer(state, {
        type: "validationPassed",
        destination: "convex",
      });
      state = saveOrchestratorReducer(state, {
        type: "credentialsVerified",
        credentials: { username: "test", password: "pass", key: "ADMIN" },
      });
      state = saveOrchestratorReducer(state, {
        type: "saveSucceeded",
        result: {
          destination: "convex",
          savedItems: ["articles"],
          warnings: ["Revalidation failed"],
          resolvedSubmitterKey: "ADMIN",
          changelogEntry: null,
          markChangesSaved: false,
        },
      });

      expect(state.convexNotice?.type).toBe("error");
      expect(state.convexNotice?.message).toContain("1 issue(s) occurred");
    });

    it("handles empty Convex save result", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, { type: "saveToConvexRequested" });
      state = saveOrchestratorReducer(state, {
        type: "validationPassed",
        destination: "convex",
      });
      state = saveOrchestratorReducer(state, {
        type: "credentialsVerified",
        credentials: { username: "test", password: "pass", key: "ADMIN" },
      });
      state = saveOrchestratorReducer(state, {
        type: "saveSucceeded",
        result: {
          destination: "convex",
          savedItems: [],
          warnings: [],
          resolvedSubmitterKey: "ADMIN",
          changelogEntry: null,
          markChangesSaved: false,
        },
      });

      expect(state.convexNotice?.type).toBe("error");
      expect(state.convexNotice?.message).toBe("No Convex-compatible changes to save.");
    });
  });

  describe("notice management", () => {
    it("sets and clears individual notices", () => {
      let state = createInitialSaveOrchestratorState();

      state = saveOrchestratorReducer(state, {
        type: "setNotice",
        channel: "github",
        notice: { type: "success", message: "Done!" },
      });
      expect(state.githubNotice?.message).toBe("Done!");
      expect(state.convexNotice).toBeNull();

      state = saveOrchestratorReducer(state, {
        type: "clearNotice",
        channel: "github",
      });
      expect(state.githubNotice).toBeNull();
    });

    it("clears all notices", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, {
        type: "setNotice",
        channel: "github",
        notice: { type: "success", message: "GitHub done" },
      });
      state = saveOrchestratorReducer(state, {
        type: "setNotice",
        channel: "convex",
        notice: { type: "success", message: "Convex done" },
      });

      state = saveOrchestratorReducer(state, { type: "clearNotices" });
      expect(state.githubNotice).toBeNull();
      expect(state.convexNotice).toBeNull();
    });
  });

  describe("concurrent save prevention", () => {
    it("ignores save requests while already saving", () => {
      let state = createInitialSaveOrchestratorState();
      state = saveOrchestratorReducer(state, { type: "saveToGitHubRequested" });
      const prevState = state;

      state = saveOrchestratorReducer(state, { type: "saveToConvexRequested" });
      expect(state).toBe(prevState); // No change

      state = saveOrchestratorReducer(state, { type: "saveToGitHubRequested" });
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

  it("returns pending effect from dispatch", () => {
    const orchestrator = new DevModeSaveOrchestrator();
    const effect = orchestrator.dispatch({ type: "saveToGitHubRequested" });

    expect(effect?.kind).toBe("verifyCredentials");
    expect(effect?.destination).toBe("github");
  });

  it("does not notify subscribers when state unchanged", () => {
    const orchestrator = new DevModeSaveOrchestrator();
    const states: DevModeSaveOrchestratorState[] = [];
    orchestrator.subscribe((state) => states.push(state));

    // Dispatch event that doesn't change state
    orchestrator.dispatch({ type: "clearNotices" }); // Already null
    expect(states).toHaveLength(0);
  });
});

describe("selectors", () => {
  it("selectIsSaving returns true during any save phase", () => {
    let state = createInitialSaveOrchestratorState();
    expect(selectIsSaving(state)).toBe(false);

    state = saveOrchestratorReducer(state, { type: "saveToGitHubRequested" });
    expect(selectIsSaving(state)).toBe(true);
  });

  it("selectIsConvexSaving/selectIsGitHubSaving are destination-specific", () => {
    let state = createInitialSaveOrchestratorState();

    state = saveOrchestratorReducer(state, { type: "saveToGitHubRequested" });
    expect(selectIsGitHubSaving(state)).toBe(true);
    expect(selectIsConvexSaving(state)).toBe(false);

    state = createInitialSaveOrchestratorState();
    state = saveOrchestratorReducer(state, { type: "saveToConvexRequested" });
    expect(selectIsGitHubSaving(state)).toBe(false);
    expect(selectIsConvexSaving(state)).toBe(true);
  });

  it("selectPrimaryNotice picks based on convexEnabled", () => {
    let state = createInitialSaveOrchestratorState();
    state = saveOrchestratorReducer(state, {
      type: "setNotice",
      channel: "github",
      notice: { type: "success", message: "GitHub" },
    });
    state = saveOrchestratorReducer(state, {
      type: "setNotice",
      channel: "convex",
      notice: { type: "success", message: "Convex" },
    });

    expect(selectPrimaryNotice(state, false)?.message).toBe("GitHub");
    expect(selectPrimaryNotice(state, true)?.message).toBe("Convex");
  });
});
