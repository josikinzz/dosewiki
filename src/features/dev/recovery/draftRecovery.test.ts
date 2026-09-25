import { beforeEach, describe, expect, it } from "vitest";

import {
  clearDraftRecovery,
  createDraftRecoveryStore,
  DRAFT_RECOVERY_MAX_AGE_MS,
  DRAFT_RECOVERY_PREFIX,
  recoveryActorKey,
  type RecoverableTool,
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

  it("keeps no checkpoint for a tool outside the contract", () => {
    const store = createDraftRecoveryStore(first);
    const intake = "trip-reports" as RecoverableTool;
    expect(store.write({ tool: intake, record: "submission:1", baseline: "", draft: { email: "reader@example.com" } })).toBeNull();
    expect(keys()).toEqual([]);
  });

  it("drops a checkpoint past its age", () => {
    let now = 1_000;
    const store = createDraftRecoveryStore(first, { now: () => now });
    store.write({ tool: "writing", record: "new", baseline: "r", draft: {} });
    now += DRAFT_RECOVERY_MAX_AGE_MS + 1;
    expect(store.read("writing", "new")).toBeNull();
    expect(keys()).toEqual([]);
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

  it("answers null when the browser refuses the write", () => {
    const full = {
      ...window.localStorage,
      length: 0,
      key: () => null,
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    } as unknown as Storage;
    expect(createDraftRecoveryStore(first, { storage: full }).write({ tool: "writing", record: "new", baseline: "r", draft: {} })).toBeNull();
  });
});
