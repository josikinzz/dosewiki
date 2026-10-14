import { describe, expect, it } from "vitest";

import { assertDataOpsWriteAllowed, createDataOpsRunContext } from "./data-ops-run-context.mjs";

describe("data ops run context", () => {
  it("blocks dry-run writes through the shared policy", () => {
    const context = createDataOpsRunContext({
      operation: "local prepopulate", intent: "local-prepopulate", argv: ["--dry-run"], loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres" }, sourceUrlKeys: [],
    });
    expect(() => assertDataOpsWriteAllowed(context)).toThrow(/dry-run mode/);
  });

  it("requires destructive confirmation, operation phrase, and exact target identity", () => {
    const options = {
      operation: "production sync", intent: "production-sync", loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres", TARGET_POSTGRES_URL: "postgres://prod.example/db" },
      confirmationFlag: "--confirm-production-sync", destructive: true,
    };
    const steps = [
      { argv: ["--write"], error: /--confirm-production-sync/ },
      { argv: ["--write", "--confirm-production-sync"], error: /--confirm-write/ },
      { argv: ["--write", "--confirm-production-sync", "--confirm-write=production-sync"], error: /--expected-deployment/ },
      { argv: ["--write", "--confirm-production-sync", "--confirm-write=production-sync", "--expected-deployment=other.example/db"], error: /does not match/ },
    ];
    for (const { argv, error } of steps) expect(() => assertDataOpsWriteAllowed(createDataOpsRunContext({ ...options, argv }))).toThrow(error);
  });

  it("does not authorize application fallback URLs or absent targets", () => {
    for (const env of [
      { DATA_BACKEND: "postgres", POSTGRES_POOLED_URL: "postgres://prod.example/db" },
      { DATA_BACKEND: "postgres", LEGACY_BACKEND_URL: "https://legacy.example.invalid" },
    ]) {
      const context = createDataOpsRunContext({ operation: "copy", argv: ["--write"], loadsEnvLocal: false, env });
      expect(() => assertDataOpsWriteAllowed(context)).toThrow(/explicit|TARGET_POSTGRES_URL/);
    }
  });

  it("does not let local target opt-ins bypass the common confirmation ceremony", () => {
    const context = createDataOpsRunContext({
      operation: "local replication import", argv: ["--execute", "--write"], loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres", TARGET_POSTGRES_URL: "postgres://localhost/db" },
      requiresExecute: true,
    });
    expect(() => assertDataOpsWriteAllowed(context)).toThrow(/--confirm-write/);
  });

  it("rejects invalid explicit source and target selections without fallback", () => {
    for (const env of [
      { DATA_BACKEND: "postgres", TARGET_POSTGRES_URL: "https://legacy.example.invalid" },
      { DATA_BACKEND: "postgres", SOURCE_POSTGRES_URL: "", POSTGRES_POOLED_URL: "postgres://localhost/db" },
    ]) expect(() => createDataOpsRunContext({ operation: "copy", argv: [], loadsEnvLocal: false, env })).toThrow(/Postgres/);
  });
});
