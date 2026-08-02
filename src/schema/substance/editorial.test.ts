import { describe, expect, it } from "vitest";
import { editorialReviewSchema } from "./editorial";

const flag = {
  label: "Missing section",
  severity: "major" as const,
  note: "Add the absent section.",
  section: "pharmacology" as const,
  source: "agent" as const,
  run_id: "review-2026-08-02",
  created_at: "2026-08-02T12:00:00.000Z",
};

describe("editorialReviewSchema Review Flags", () => {
  it("round-trips review metadata with and without flags", () => {
    const withFlags = { status: "in_progress" as const, notes: "Check", flags: [flag] };
    expect(editorialReviewSchema.parse(withFlags)).toEqual(withFlags);
    expect(editorialReviewSchema.parse({ status: "needed", notes: "" })).toEqual({
      status: "needed",
      notes: "",
    });
  });

  it("keeps legacy objects valid", () => {
    expect(editorialReviewSchema.safeParse({}).success).toBe(true);
    expect(editorialReviewSchema.safeParse({ status: "completed", notes: "Legacy" }).success).toBe(true);
  });

  it("rejects invalid severity and labels outside 1–3 words", () => {
    expect(editorialReviewSchema.safeParse({ flags: [{ ...flag, severity: "blocking" }] }).success).toBe(false);
    expect(editorialReviewSchema.safeParse({ flags: [{ ...flag, label: "" }] }).success).toBe(false);
    expect(editorialReviewSchema.safeParse({ flags: [{ ...flag, label: "one two three four" }] }).success).toBe(false);
  });
});
