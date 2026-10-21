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

  describe("write freeze and host guard", () => {
    const REMOTE = "postgres://operator:private-password@db.example/dosewiki";
    const LOCAL = "postgres://operator:private-password@127.0.0.1:5432/dosewiki";
    const ceremony = (deployment) => ["--write", "--confirm-write=sync-fixture", `--expected-deployment=${deployment}`];
    const context = (argv, env) => createDataOpsRunContext({
      operation: "sync fixture", argv, loadsEnvLocal: false, env: { DATA_BACKEND: "postgres", ...env },
    });

    it("allows a complete loopback ceremony with writes open", () => {
      expect(() => assertDataOpsWriteAllowed(context(ceremony("127.0.0.1/dosewiki"), { TARGET_POSTGRES_URL: LOCAL }))).not.toThrow();
    });

    it("refuses under the freeze before reporting any missing confirmation", () => {
      const frozen = { TARGET_POSTGRES_URL: LOCAL, DATA_WRITES_FROZEN: "1" };
      expect(() => assertDataOpsWriteAllowed(context(["--write"], frozen))).toThrow(/DATA_WRITES_FROZEN/);
      expect(() => assertDataOpsWriteAllowed(context(ceremony("127.0.0.1/dosewiki"), frozen))).toThrow(/DATA_WRITES_FROZEN/);
    });

    it("holds a confirmed remote target to --allow-remote and POSTGRES_IMPORT_CONFIRM", () => {
      expect(() => assertDataOpsWriteAllowed(context(ceremony("db.example/dosewiki"), { TARGET_POSTGRES_URL: REMOTE, POSTGRES_IMPORT_CONFIRM: "db.example" })))
        .toThrow(/--allow-remote/);
      const remote = [...ceremony("db.example/dosewiki"), "--allow-remote"];
      expect(() => assertDataOpsWriteAllowed(context(remote, { TARGET_POSTGRES_URL: REMOTE, POSTGRES_IMPORT_CONFIRM: "other.example" })))
        .toThrow(/POSTGRES_IMPORT_CONFIRM/);
      expect(() => assertDataOpsWriteAllowed(context(remote, { TARGET_POSTGRES_URL: REMOTE, POSTGRES_IMPORT_CONFIRM: "db.example" }))).not.toThrow();
    });

    it("checks confirmation before the host guard, so a remote write names its missing phrase", () => {
      expect(() => assertDataOpsWriteAllowed(context(["--write"], { TARGET_POSTGRES_URL: REMOTE }))).toThrow(/--confirm-write=sync-fixture/);
    });
  });

  it("rejects invalid explicit source and target selections without fallback", () => {
    for (const env of [
      { DATA_BACKEND: "postgres", TARGET_POSTGRES_URL: "https://legacy.example.invalid" },
      { DATA_BACKEND: "postgres", SOURCE_POSTGRES_URL: "", POSTGRES_POOLED_URL: "postgres://localhost/db" },
    ]) expect(() => createDataOpsRunContext({ operation: "copy", argv: [], loadsEnvLocal: false, env })).toThrow(/Postgres/);
  });
});
