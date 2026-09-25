import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CORRECTION_STATES,
  CORRECTION_STATE_LABEL,
  FEEDBACK_OUTCOMES,
  FEEDBACK_OUTCOME_LABEL,
  FEEDBACK_OUTCOME_STATUS,
  correctionHref,
  isCompletedCorrection,
  linkedChangesOf,
  readCorrectionParams,
  readCorrectionReturn,
  readFeedbackRef,
  resolveCorrections,
} from "./feedbackCorrection";
import { INTAKE_STATUSES } from "./intakeStatus";

const at = "2026-03-02T00:00:00.000Z";
const proposal = (id: string, status: string, extra: Record<string, string> = {}) => ({
  _id: id,
  status,
  summary: `Summary ${id}`,
  createdAt: at,
  ...extra,
});
const revision = (id: string, changeId: string, extra: Record<string, string> = {}) => ({
  _id: id,
  changeId,
  summary: `Revision ${id}`,
  createdAt: at,
  ...extra,
});

function resolveOne(change: { kind: "proposal" | "revision"; id: string }, facts: Partial<Parameters<typeof resolveCorrections>[1]>) {
  return resolveCorrections([{ change, at }], { slug: "lsd", proposals: [], revisions: [], ...facts })[0];
}

describe("resolveCorrections", () => {
  it("reads a waiting proposal as pending and a returned one as returned", () => {
    expect(resolveOne({ kind: "proposal", id: "p1" }, { proposals: [proposal("p1", "submitted")] }).state).toBe("pending");
    expect(resolveOne({ kind: "proposal", id: "p1" }, { proposals: [proposal("p1", "changes_requested")] }).state).toBe("returned");
  });

  it("names the revision an applied proposal published", () => {
    const resolved = resolveOne(
      { kind: "proposal", id: "p1" },
      { proposals: [proposal("p1", "applied")], revisions: [revision("r1", "proposal-p1:lsd")] },
    );
    expect(resolved).toMatchObject({ state: "published", revision: { id: "r1", summary: "Revision r1" } });
  });

  it("never reads a rejected, withdrawn, reverted or missing change as completed", () => {
    const states = [
      resolveOne({ kind: "proposal", id: "p1" }, { proposals: [proposal("p1", "rejected")] }),
      resolveOne({ kind: "proposal", id: "p1" }, { proposals: [proposal("p1", "superseded")] }),
      resolveOne(
        { kind: "proposal", id: "p1" },
        { proposals: [proposal("p1", "reverted")], revisions: [revision("r1", "proposal-p1:lsd"), revision("r2", "revert-p1:lsd")] },
      ),
      resolveOne({ kind: "proposal", id: "gone" }, {}),
      resolveOne({ kind: "revision", id: "r1" }, { revisions: [revision("r1", "change-1"), revision("r2", "undo", { restoredFrom: "r1" })] }),
    ].map((resolved) => resolved.state);
    expect(states).toEqual(["rejected", "withdrawn", "reverted", "unavailable", "reverted"]);
    expect(states.some(isCompletedCorrection)).toBe(false);
  });

  it("follows a superseded proposal to the revision that replaced it", () => {
    const resolved = resolveOne(
      { kind: "proposal", id: "p1" },
      {
        proposals: [proposal("p1", "superseded"), proposal("p2", "superseded", { revisionOf: "p1" }), proposal("p3", "applied", { revisionOf: "p2" })],
        revisions: [revision("r3", "proposal-p3:lsd")],
      },
    );
    expect(resolved).toMatchObject({ state: "published", revisedFrom: "p1", proposal: { id: "p3" }, revision: { id: "r3" } });
  });
});

describe("linkedChangesOf", () => {
  it("lists each linked change once, oldest first, and skips plain decisions", () => {
    const links = linkedChangesOf([
      { at: "1", actor: "a", from: "new", to: "new", linked_change: { kind: "proposal", id: "p1" } },
      { at: "2", actor: "a", from: "new", to: "reviewing" },
      { at: "3", actor: "b", from: "reviewing", to: "reviewing", linked_change: { kind: "proposal", id: "p1" } },
      { at: "4", actor: "b", from: "reviewing", to: "reviewing", linked_change: { kind: "revision", id: "r1" } },
    ]);
    expect(links).toEqual([
      { change: { kind: "proposal", id: "p1" }, at: "1", actor: "a" },
      { change: { kind: "revision", id: "r1" }, at: "4", actor: "b" },
    ]);
  });
});

describe("the feedback reference", () => {
  it("round-trips through the Start correction link", () => {
    const href = correctionHref("lsd", "fb-0001", "dosage");
    expect(href).toBe("/lsd?feedback=fb-0001&section=dosage");
    expect(readCorrectionParams(href.slice(href.indexOf("?")))).toEqual({ id: "fb-0001", section: "dosage" });
    expect(readCorrectionParams("?other=1")).toBeNull();
  });

  it("carries the feedback task link back, and only a /dev path on this site", () => {
    const back = "/dev/article-feedback/fb-0001?source=article&status=unresolved";
    const href = correctionHref("lsd", "fb-0001", null, back);
    expect(readCorrectionReturn(href.slice(href.indexOf("?")))).toBe(back);
    expect(readCorrectionParams(href.slice(href.indexOf("?")))).toEqual({ id: "fb-0001" });
    for (const hostile of ["https://evil.example/dev/x", "//evil.example/dev/", "/\\evil.example", "/lsd", "javascript:alert(1)"]) {
      expect(readCorrectionReturn(`?returnTo=${encodeURIComponent(hostile)}`)).toBeNull();
      expect(correctionHref("lsd", "fb-0001", null, hostile)).toBe("/lsd?feedback=fb-0001");
    }
  });

  it("keeps only the id and section", () => {
    expect(readFeedbackRef({ id: "fb-1", section: "dosage", contact_email: "reader@example.org", details: "words" })).toEqual({
      id: "fb-1",
      section: "dosage",
    });
    expect(readFeedbackRef({ id: "reader@example.org" })).toBeUndefined();
  });
});

describe("outcome and correction words", () => {
  const glossary = readFileSync(join(process.cwd(), "docs/glossary.md"), "utf8");

  it("closes every outcome with a shared intake status", () => {
    for (const outcome of FEEDBACK_OUTCOMES) {
      expect(INTAKE_STATUSES).toContain(FEEDBACK_OUTCOME_STATUS[outcome]);
    }
  });

  it("records every outcome and correction state in the glossary", () => {
    for (const outcome of FEEDBACK_OUTCOMES) expect(glossary).toContain(`**${FEEDBACK_OUTCOME_LABEL[outcome]}**`);
    for (const state of CORRECTION_STATES) expect(glossary).toContain(`**${CORRECTION_STATE_LABEL[state]}**`);
  });
});
