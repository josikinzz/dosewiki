import { beforeEach, describe, expect, it } from "vitest";

import {
  clearDraftRecovery,
  createDraftRecoveryStore,
  DRAFT_RECOVERY_PREFIX,
  recoveryActorKey,
} from "./draftRecovery";

const first = recoveryActorKey("First@Example.com ")!;
const second = recoveryActorKey("second@example.com")!;

function keys(): string[] {
  return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index) ?? "");
}

describe("draft recovery", () => {
  beforeEach(() => window.localStorage.clear());

  it("names an account by a stable hash, never the address", () => {
    expect(first).toBe(recoveryActorKey("first@example.com"));
    expect(first).not.toContain("example");
    expect(recoveryActorKey("")).toBeNull();
    expect(recoveryActorKey(null)).toBeNull();
  });

  it("reads a checkpoint back only for the account, tool and record that wrote it", () => {
    const store = createDraftRecoveryStore(first);
    const savedAt = store.write({ tool: "writing", record: "row:a", baseline: "rev-1", draft: { title: "A" } });
    expect(savedAt).toEqual(expect.any(Number));

    expect(store.read("writing", "row:a")).toMatchObject({ baseline: "rev-1", draft: { title: "A" }, savedAt });
    expect(store.read("writing", "row:b")).toBeNull();
    expect(store.read("staged-articles", "row:a")).toBeNull();
    expect(createDraftRecoveryStore(second).read("writing", "row:a")).toBeNull();
  });

  it("refuses a value copied under another account's key", () => {
    createDraftRecoveryStore(first).write({ tool: "writing", record: "row:a", baseline: "rev-1", draft: {} });
    const [key] = keys();
    window.localStorage.setItem(key.replace(first, second), window.localStorage.getItem(key)!);

    expect(createDraftRecoveryStore(second).read("writing", "row:a")).toBeNull();
  });

  it("clears everything on sign-out, and only other accounts' copies when one signs in", () => {
    createDraftRecoveryStore(first).write({ tool: "writing", record: "new", baseline: "r", draft: {} });
    createDraftRecoveryStore(second).write({ tool: "writing", record: "new", baseline: "r", draft: {} });
    window.localStorage.setItem("dosewiki-theme", "dark");

    clearDraftRecovery({ keepActor: second });
    expect(createDraftRecoveryStore(first).read("writing", "new")).toBeNull();
    expect(createDraftRecoveryStore(second).read("writing", "new")).not.toBeNull();

    clearDraftRecovery();
    expect(keys().filter((key) => key.startsWith(DRAFT_RECOVERY_PREFIX))).toEqual([]);
    expect(window.localStorage.getItem("dosewiki-theme")).toBe("dark");
  });
});
