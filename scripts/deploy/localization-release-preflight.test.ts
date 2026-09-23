import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  environmentFailures,
  migrationLedger,
  privilegeMatrix,
  runtimeTableNames,
  snapshotColumns,
} from "./localization-release-preflight";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = "scripts/deploy/localization-release-preflight.ts";
const PLACEHOLDER_URL = ["postgres:", "", "runtime:placeholder@db.example.invalid:6432", "dosewiki"].join("/");

describe("localization release preflight", () => {
  it.each(["editor", "public"] as const)("grants only tables in the runtime schema on the %s surface", (surface) => {
    const tables = new Set(runtimeTableNames());
    const granted = Object.keys(privilegeMatrix(surface));
    expect(granted.length).toBeGreaterThan(0);
    expect(granted.filter((table) => !tables.has(table))).toEqual([]);
  });

  it("holds the editor to a reviewed grant for every runtime table", () => {
    expect(Object.keys(privilegeMatrix("editor")).sort()).toEqual([...runtimeTableNames()].sort());
  });

  it("verifies migrations from the journal and the latest snapshot", () => {
    const ledger = migrationLedger();
    const journal = JSON.parse(readFileSync(path.join(ROOT, "lib/postgres/migrations/meta/_journal.json"), "utf8")) as { entries: unknown[] };
    expect(ledger).toHaveLength(journal.entries.length);
    expect(ledger.every(({ hash }) => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
    const columns = snapshotColumns();
    expect(Object.keys(columns).sort()).toEqual([...runtimeTableNames()].sort());
    expect(columns.documentIds).toEqual(expect.arrayContaining(["_id", "table"]));
  });

  it("takes required variables from the deployment env contract", () => {
    const base = { DATA_BACKEND: "postgres", REPLICATION_MEDIA_BASE_URL: "https://media.example.invalid" };
    expect(environmentFailures("public", base)).toEqual([]);
    expect(environmentFailures("public", { ...base, REPLICATION_MEDIA_BASE_URL: undefined })).toEqual([
      expect.stringMatching(/REPLICATION_MEDIA_BASE_URL/),
    ]);
    // The public surface may carry only the create-only intake token.
    expect(environmentFailures("public", { ...base, DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE: "placeholder" })).toEqual([]);
    expect(environmentFailures("public", { ...base, DATA_ADMIN_KEY: "placeholder" })).toEqual([
      expect.stringMatching(/forbidden credential variable DATA_ADMIN_KEY/),
    ]);
    // The editor needs the writer variables, and never the public intake token.
    expect(environmentFailures("editor", base)).toEqual([
      expect.stringMatching(/DATA_ADMIN_KEY, GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT/),
    ]);
    expect(environmentFailures("editor", { ...base, DATA_ADMIN_KEY: "placeholder", GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT: "placeholder" })).toEqual([]);
  });

  it("carries no retired backend variables and no hardcoded migration numbers", () => {
    const source = readFileSync(path.join(ROOT, SCRIPT), "utf8");
    expect(source).not.toMatch(/CONVEX/i);
    expect(source).not.toMatch(/\b0\d{3}\b/);
    expect(source).not.toMatch(/SITE_FEEDBACK_IP_HASH_SECRET/);
  });

  it("is a package command that loads no env file", () => {
    const scripts = (JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(Object.values(scripts)).toContain(`bun --no-env-file ${SCRIPT}`);
  });

  it("exits nonzero and names the missing target when only the app URLs are set", () => {
    const result = spawnSync("bun", ["--no-env-file", SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "test",
        DATA_BACKEND: "postgres",
        DOSEWIKI_BUILD_SURFACE: "editor",
        POSTGRES_POOLED_URL: PLACEHOLDER_URL,
        POSTGRES_DIRECT_URL: PLACEHOLDER_URL,
      },
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/Postgres target is required: pass --target <url> or set TARGET_POSTGRES_URL/);
    expect(`${result.stdout}${result.stderr}`).not.toContain("placeholder@");
  });
});
