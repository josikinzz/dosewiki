import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { environmentFailures } from "./localization-release-preflight";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = "scripts/deploy/localization-release-preflight.ts";
const PLACEHOLDER_URL = ["postgres:", "", "runtime:placeholder@db.example.invalid:6432", "dosewiki"].join("/");

describe("localization release preflight", () => {
  it("rejects the main admin key on the public surface", () => {
    const base = { DATA_BACKEND: "postgres", REPLICATION_MEDIA_BASE_URL: "https://media.example.invalid" };
    expect(environmentFailures("public", { ...base, DATA_ADMIN_KEY: "placeholder" })).toEqual([
      expect.stringMatching(/forbidden credential variable DATA_ADMIN_KEY/),
    ]);
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
