import { afterEach, describe, expect, it } from "vitest";

import { readInboxNotes, writeInboxNotes } from "./inboxNotes";

afterEach(() => window.localStorage.clear());

describe("inbox review notes", () => {
  it("keeps typed notes per reviewer and drops blank ones", () => {
    expect(writeInboxNotes("Ada@example.com", { "feedback:1": "Checked the source.", "feedback:2": "  " })).toBe(true);

    expect(readInboxNotes("ada@example.com")).toEqual({ "feedback:1": "Checked the source." });
    expect(readInboxNotes("ben@example.com")).toEqual({});
  });

  it("clears storage once every note is sent or discarded", () => {
    writeInboxNotes("ada@example.com", { "feedback:1": "Draft" });
    writeInboxNotes("ada@example.com", {});

    expect(window.localStorage.length).toBe(0);
  });

  it("keeps nothing without a signed-in reviewer, and ignores a damaged entry", () => {
    expect(writeInboxNotes(null, { "feedback:1": "Draft" })).toBe(false);
    window.localStorage.setItem("dosewiki:inbox-notes:v1:ada@example.com", "not json");

    expect(readInboxNotes("ada@example.com")).toEqual({});
  });
});
