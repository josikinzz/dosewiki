import { describe, expect, it, vi } from "vitest";
import { authorizeProductionWrite, createProductionWriteCommand, executeProductionWrite } from "./production-write-command.mjs";

const TARGET = "postgres://operator:private-password@db.example/dosewiki";
const operation = "migrate-pharmacology-schema";
function command(argv, env = {}) {
  return createProductionWriteCommand({ operation, argv, env: { DATA_BACKEND: "postgres", TARGET_POSTGRES_URL: TARGET, ...env }, loadsEnvLocal: false });
}

describe("production Postgres write boundary", () => {
  it("does not invoke a mutation without explicit write intent", async () => {
    const mutation = vi.fn();
    expect(await executeProductionWrite(command([]), mutation)).toEqual({ status: "dry-run", wrote: false });
    expect(mutation).not.toHaveBeenCalled();
  });

  it.each([
    ["--write", "--dry-run"],
    ["--write"],
    ["--write", `--confirm-write=${operation}`],
    ["--write", `--confirm-write=${operation}`, "--expected-deployment=other.example/dosewiki"],
  ])("blocks incomplete or contradictory confirmation %j", async (...argv) => {
    const mutation = vi.fn();
    await expect(executeProductionWrite(command(argv), mutation)).rejects.toThrow();
    expect(mutation).not.toHaveBeenCalled();
  });

  it("ignores application fallback targets for privileged writes", async () => {
    const mutation = vi.fn();
    const selected = command(["--write", `--confirm-write=${operation}`, "--expected-deployment=db.example/dosewiki"], { TARGET_POSTGRES_URL: undefined, POSTGRES_POOLED_URL: TARGET });
    await expect(executeProductionWrite(selected, mutation, { env: {} })).rejects.toThrow(/TARGET_POSTGRES_URL/);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("runs only the exact operation, database confirmation, and host guard", async () => {
    const mutation = vi.fn(async () => ({ updated: 3 }));
    const confirmed = command(["--write", `--confirm-write=${operation}`, "--expected-deployment=db.example/dosewiki", "--allow-remote"]);
    await expect(executeProductionWrite(confirmed, mutation, { env: { POSTGRES_IMPORT_CONFIRM: "db.example" } })).resolves.toEqual({ updated: 3 });
    expect(mutation).toHaveBeenCalledOnce();
  });

  it.each([
    ["the write freeze", [], { DATA_WRITES_FROZEN: "1", POSTGRES_IMPORT_CONFIRM: "db.example" }, /DATA_WRITES_FROZEN/],
    ["a remote host without --allow-remote", [], { POSTGRES_IMPORT_CONFIRM: "db.example" }, /--allow-remote/],
    ["a remote host without POSTGRES_IMPORT_CONFIRM", ["--allow-remote"], {}, /POSTGRES_IMPORT_CONFIRM/],
  ])("refuses a confirmed mutation under %s", async (_label, extraArgv, env, expected) => {
    const mutation = vi.fn();
    const confirmed = command(["--write", `--confirm-write=${operation}`, "--expected-deployment=db.example/dosewiki", ...extraArgv]);
    await expect(executeProductionWrite(confirmed, mutation, { env })).rejects.toThrow(expected);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("rejects an invalid explicit CLI target rather than using the valid environment", () => {
    expect(() => command(["--target=https://legacy.example.invalid"])).toThrow(/Postgres/);
    expect(() => command(["--target"])).toThrow(/--target/);
  });
});

describe("production write authorization", () => {
  const LOCAL = "postgres://operator:private-password@127.0.0.1:5432/dosewiki";
  const confirmed = (deployment) => ["--write", `--confirm-write=${operation}`, `--expected-deployment=${deployment}`];

  it("returns the confirmed target for a complete loopback ceremony", () => {
    const env = { TARGET_POSTGRES_URL: LOCAL };
    expect(authorizeProductionWrite(command(confirmed("127.0.0.1/dosewiki"), env), { env })).toBe(LOCAL);
  });

  it("refuses under the freeze before reporting any missing confirmation", () => {
    const env = { DATA_WRITES_FROZEN: "1" };
    expect(() => authorizeProductionWrite(command(["--write"], env), { env })).toThrow(/DATA_WRITES_FROZEN/);
  });

  it("holds a confirmed remote target to the host guard", () => {
    expect(() => authorizeProductionWrite(command(confirmed("db.example/dosewiki")), { env: {} })).toThrow(/--allow-remote/);
    const remote = command([...confirmed("db.example/dosewiki"), "--allow-remote"]);
    expect(() => authorizeProductionWrite(remote, { env: { POSTGRES_IMPORT_CONFIRM: "other.example" } })).toThrow(/POSTGRES_IMPORT_CONFIRM/);
    expect(authorizeProductionWrite(remote, { env: { POSTGRES_IMPORT_CONFIRM: "db.example" } })).toBe(TARGET);
  });

  it("checks confirmation before the host guard, so a remote write names its missing phrase", () => {
    expect(() => authorizeProductionWrite(command(["--write"]), { env: {} })).toThrow(/--confirm-write=/);
  });

  it("refuses a blank TARGET_POSTGRES_URL instead of reading it as unset", () => {
    expect(() => command(confirmed("db.example/dosewiki"), { TARGET_POSTGRES_URL: "  " })).toThrow(/TARGET_POSTGRES_URL/);
  });
});
