import { describe, expect, it } from "vitest";

import { publicReasonOf, type DecisionLogged } from "./decisionLog";

const row = (overrides: Partial<DecisionLogged>): DecisionLogged => ({
  status: "rejected",
  created_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("publicReasonOf", () => {
  it("reads the public reason on the decision that still stands", () => {
    expect(
      publicReasonOf(
        row({
          decision_log: [
            {
              at: "2026-01-02T00:00:00.000Z",
              actor: "admin@example.com",
              from: "submitted",
              to: "rejected",
              note: "Private.",
              public_reason: "No dose given.",
            },
          ],
        }),
      ),
    ).toBe("No dose given.");
  });

  it("hides a reason once a later decision replaced it", () => {
    expect(
      publicReasonOf(
        row({
          status: "reviewing",
          decision_log: [
            { at: "2026-01-02T00:00:00.000Z", actor: "a", from: "submitted", to: "rejected", public_reason: "No dose given." },
            { at: "2026-01-03T00:00:00.000Z", actor: "a", from: "rejected", to: "reviewing" },
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it("never falls back to the private review note", () => {
    expect(publicReasonOf(row({ review_notes: "Private.", reviewed_by: "admin@example.com" }))).toBeUndefined();
    expect(publicReasonOf(row({}))).toBeUndefined();
  });
});
