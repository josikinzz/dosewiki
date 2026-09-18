import { describe, expect, it, vi } from "vitest";
import { createProductionWriteCommand, executeProductionWrite } from "./production-write-command.mjs";

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
    await expect(executeProductionWrite(selected, mutation)).rejects.toThrow(/TARGET_POSTGRES_URL/);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("runs only the exact operation and database confirmation", async () => {
    const mutation = vi.fn(async () => ({ updated: 3 }));
    await expect(executeProductionWrite(command(["--write", `--confirm-write=${operation}`, "--expected-deployment=db.example/dosewiki"]), mutation)).resolves.toEqual({ updated: 3 });
    expect(mutation).toHaveBeenCalledOnce();
  });

  it("rejects an invalid explicit CLI target rather than using the valid environment", () => {
    expect(() => command(["--target=https://legacy.example.invalid"])).toThrow(/Postgres/);
    expect(() => command(["--target"])).toThrow(/--target/);
  });
});
