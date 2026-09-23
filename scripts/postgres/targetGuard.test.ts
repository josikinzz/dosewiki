import { describe, expect, it } from "vitest";
import { guardTarget, resolveTarget } from "./targetGuard";

const LOCAL = "postgres://localhost:5432/dosewiki";
const REMOTE = "postgres://db.example.test:5432/dosewiki";

describe("resolveTarget", () => {
  it("refuses the app connection variables and names the missing explicit target", () => {
    const env = { POSTGRES_DIRECT_URL: REMOTE, POSTGRES_POOLED_URL: REMOTE };
    expect(() => resolveTarget([], env)).toThrow(/--target.*TARGET_POSTGRES_URL/);
  });

  it("has no localhost default", () => {
    expect(() => resolveTarget([], {})).toThrow(/Postgres target is required/);
  });

  it("accepts --target in both spellings before TARGET_POSTGRES_URL", () => {
    const env = { TARGET_POSTGRES_URL: REMOTE };
    expect(resolveTarget(["--target", LOCAL], env)).toBe(LOCAL);
    expect(resolveTarget([`--target=${LOCAL}`], env)).toBe(LOCAL);
    expect(resolveTarget([], env)).toBe(REMOTE);
  });

  it("refuses a --target flag without a value", () => {
    expect(() => resolveTarget(["--target"], { TARGET_POSTGRES_URL: LOCAL })).toThrow(/--target requires/);
    expect(() => resolveTarget(["--target", "--allow-remote"], {})).toThrow(/--target requires/);
  });
});

describe("guardTarget", () => {
  it.each([
    "postgres://localhost:5432/x",
    "postgres://127.0.0.1:5432/x",
    "postgres://[::1]:5432/x",
  ])("treats %s as local", (target) => {
    expect(() => guardTarget(target, false, {})).not.toThrow();
  });

  it("refuses a remote host without --allow-remote and the matching confirmation", () => {
    expect(() => guardTarget(REMOTE, false, {})).toThrow(/Refusing non-local target db\.example\.test/);
    expect(() => guardTarget(REMOTE, true, { POSTGRES_IMPORT_CONFIRM: "other.example.test" })).toThrow(/POSTGRES_IMPORT_CONFIRM must equal/);
    expect(() => guardTarget(REMOTE, true, { POSTGRES_IMPORT_CONFIRM: "db.example.test" })).not.toThrow();
  });
});
