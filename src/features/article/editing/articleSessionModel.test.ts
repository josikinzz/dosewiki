import { describe, expect, it } from "vitest";
import {
  changedSections,
  classifyLifecycleFailure,
  describeChangedSections,
  describeDraftState,
  describeLifecycleFailure,
  safetyChanges,
} from "./articleSessionModel";

const change = (path: string) => ({ path, before: 1, after: 2 });

describe("article session words", () => {
  it("classifies refused writes by status and code", () => {
    expect(classifyLifecycleFailure(503, "DATA_WRITES_FROZEN")).toBe("frozen");
    expect(classifyLifecycleFailure(409, "ARTICLE_CONFLICT")).toBe("conflict");
    expect(classifyLifecycleFailure(400, "ARTICLE_UNCHANGED")).toBe("refused");
    expect(classifyLifecycleFailure(503, undefined)).toBeNull();
    expect(classifyLifecycleFailure(500, undefined)).toBeNull();
  });

  it("says what a refusal means for the action", () => {
    expect(describeLifecycleFailure({ kind: "frozen", action: "publish", message: "x" })).toBe("Writes are paused, so your changes were not published. Your edits stay here.");
    expect(describeLifecycleFailure({ kind: "conflict", action: "submit", message: "x" })).toBe("Someone published this article after you opened it, so your changes were not submitted. Your edits stay here.");
    expect(describeLifecycleFailure({ kind: "conflict", action: "saveDraft", message: "x" })).toMatch(/^Your private draft changed in another tab/);
    expect(describeLifecycleFailure({ kind: "refused", action: "publish", message: "No article content changed." })).toBe("No article content changed.");
  });

  it("names the changed sections and picks out the safety-critical changes", () => {
    const changes = [change("dosage.routes[0].dose_ranges.moderate"), change("duration.routes[0].stages.onset"), change("summary"), change("interactions.dangerous")];
    expect(changedSections(changes)).toEqual(["Dosage and duration", "Summary", "Interactions"]);
    expect(describeChangedSections(changes)).toBe("You changed Dosage and duration, Summary and Interactions.");
    expect(safetyChanges(changes).map((entry) => entry.path)).toEqual([
      "dosage.routes[0].dose_ranges.moderate", "duration.routes[0].stages.onset", "interactions.dangerous",
    ]);
  });

  it("gives one phrase for the draft", () => {
    expect(describeDraftState({ busy: null, localDirty: true, hasDraft: false, changeCount: 2 })).toEqual({ text: "Unsaved edits, 2 changes from the live article", unsaved: true });
    expect(describeDraftState({ busy: null, localDirty: false, hasDraft: true, changeCount: 1 }).text).toBe("Draft saved, 1 change not live yet");
    expect(describeDraftState({ busy: null, localDirty: false, hasDraft: false, changeCount: 0 }).text).toBe("No changes yet");
    expect(describeDraftState({ busy: "Publishing", localDirty: true, hasDraft: false, changeCount: 1 }).text).toBe("Publishing");
  });
});
