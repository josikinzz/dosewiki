import { describe, expect, it } from "vitest";
import {
  assertAgentReviewFlagInput,
  addHumanReviewFlag,
  deleteReviewFlagByIdentity,
  preserveEditorialReviewWithFlags,
  replaceAgentReviewFlags,
} from "../../../server/lib/reviewFlags";

const createdAt = "2026-08-02T12:00:00.000Z";

describe("replaceAgentReviewFlags", () => {
  it("replaces every agent flag while preserving human flags", () => {
    const human = {
      label: "Human note",
      severity: "note" as const,
      note: "Keep this.",
      source: "human" as const,
      created_at: createdAt,
      created_by: "editor@example.com",
    };
    const result = replaceAgentReviewFlags(
      [human, { label: "Old agent", severity: "minor", note: "Old", source: "agent", run_id: "old", created_at: createdAt }],
      [{ label: "New finding", severity: "major", note: "New", section: "summary" }],
      "new-run",
      createdAt,
    );
    expect(result).toEqual([
      human,
      { label: "New finding", severity: "major", note: "New", section: "summary", source: "agent", run_id: "new-run", created_at: createdAt },
    ]);
  });

  it("rejects payload fields that could touch review status", () => {
    expect(() => assertAgentReviewFlagInput({
      label: "Bad payload",
      severity: "major",
      note: "",
      status: "completed",
    })).toThrow("cannot include status");
  });

  it("rejects invalid labels and severity", () => {
    expect(() => assertAgentReviewFlagInput({ label: "too many label words", severity: "major", note: "" })).toThrow("1–3 words");
    expect(() => assertAgentReviewFlagInput({ label: "Short", severity: "blocking", note: "" })).toThrow("major, minor, or note");
  });
});

describe("human Review Flag changes", () => {
  it("stamps source and creator while preserving existing flags", () => {
    const existing = [{ label: "Old", severity: "note" as const, note: "", source: "agent" as const, created_at: createdAt }];
    expect(addHumanReviewFlag(existing, { label: "skinny", severity: "minor", note: "Expand it." }, createdAt, "editor@example.com")).toEqual([
      existing[0],
      { label: "skinny", severity: "minor", note: "Expand it.", source: "human", created_at: createdAt, created_by: "editor@example.com" },
    ]);
  });

  it("deletes exactly the first flag matching created_at, label, and source", () => {
    const match = { label: "skinny", severity: "minor" as const, note: "First", source: "human" as const, created_at: createdAt };
    const duplicate = { ...match, note: "Second" };
    const other = { ...match, source: "agent" as const };
    expect(deleteReviewFlagByIdentity([match, duplicate, other], { created_at: createdAt, label: "skinny", source: "human" })).toEqual([duplicate, other]);
  });

  it("errors when the exact flag identity is absent", () => {
    expect(() => deleteReviewFlagByIdentity([], { created_at: createdAt, label: "skinny", source: "human" })).toThrow("FLAG_NOT_FOUND");
  });

  it("preserves every other editorial_review key", () => {
    const existing = { status: "completed", notes: "Keep", reviewed_by: "reviewer@example.com", reviewed_at: createdAt, future_key: { nested: true }, flags: [] };
    expect(preserveEditorialReviewWithFlags(existing, [])).toEqual(existing);
  });
});
