import { describe, expect, it } from "vitest";
import {
  OPEN_PROPOSAL_STATUSES,
  PROPOSAL_STATUSES,
  PROPOSAL_TRANSITIONS,
  canTransition,
  type ProposalStatus,
} from "./proposalStatus";

describe("proposal status transitions", () => {
  it("covers every status exactly once and only names known statuses", () => {
    expect(Object.keys(PROPOSAL_TRANSITIONS).sort()).toEqual([...PROPOSAL_STATUSES].sort());
    for (const targets of Object.values(PROPOSAL_TRANSITIONS)) {
      for (const target of targets) {
        expect(PROPOSAL_STATUSES).toContain(target);
      }
    }
  });

  it("walks the happy path: submitted, applied, reverted, with no resting approved state", () => {
    expect(canTransition("submitted", "applied")).toBe(true);
    expect(canTransition("applied", "reverted")).toBe(true);
    expect(PROPOSAL_STATUSES).not.toContain("approved");
    expect(OPEN_PROPOSAL_STATUSES).toEqual(["submitted"]);
  });

  it("lets a review send a proposal back and the editor resubmit", () => {
    expect(canTransition("submitted", "changes_requested")).toBe(true);
    expect(canTransition("changes_requested", "submitted")).toBe(true);
    expect(canTransition("submitted", "superseded")).toBe(true);
  });

  it("treats rejected, superseded, and reverted as terminal", () => {
    for (const from of ["rejected", "superseded", "reverted"] as const) {
      for (const to of PROPOSAL_STATUSES) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it("never allows a self transition or reopening an applied proposal", () => {
    for (const status of PROPOSAL_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
    const reopen: ProposalStatus[] = ["submitted", "changes_requested", "rejected"];
    for (const to of reopen) {
      expect(canTransition("applied", to)).toBe(false);
    }
  });
});
