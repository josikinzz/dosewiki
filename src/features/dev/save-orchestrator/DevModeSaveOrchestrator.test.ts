import { describe, expect, it } from "vitest";
import { createInitialSaveOrchestratorState, saveOrchestratorReducer } from "./DevModeSaveOrchestrator";

describe("saveOrchestratorReducer", () => {
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
      const warnings = ["Revalidation failed", "Newer edits are still waiting for review"];
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
          warnings,
          resolvedSubmitterKey: "ADMIN",
          changelogEntry: null,
          markChangesSaved: false,
        },
      });

      expect(state.notice?.type).toBe("error");
      for (const warning of warnings) expect(state.notice?.message).toContain(warning);
      expect(state.saveOperation).toEqual({ phase: "idle", error: null });
      expect(state.pendingEffect).toBeNull();
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

