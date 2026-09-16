import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts/admin/data-admin.mjs");
const target = "postgresql://localhost/dosewiki";

function run(args, env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      DATA_BACKEND: "postgres",
      ...env,
    },
  });
}

describe("data admin command", () => {
  it("describes a mutation as a dry-run without contacting Postgres", () => {
    const result = run(
      [
        "tripReports:deleteById",
        '{"id":"example"}',
        `--target=${target}`,
      ],
      { DATA_ADMIN_KEY: "must-not-appear" },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Mode: dry-run");
    expect(result.stdout).toContain("Dry run only");
    expect(`${result.stdout}${result.stderr}`).not.toContain("must-not-appear");
  });

  it("fails incomplete write confirmation before credential or network use", () => {
    const result = run([
      "tripReports:deleteById",
      '{"id":"example"}',
      `--target=${target}`,
      "--write",
      "--expected-deployment=localhost/dosewiki",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "--confirm-write=data-admin-tripreports-deletebyid",
    );
    expect(result.stderr).not.toContain("fetch failed");
  });

  it("rejects credentials embedded in args-json", () => {
    const result = run([
      "tripReports:deleteById",
      '{"id":"example","apiKey":"do-not-log-this"}',
      `--target=${target}`,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Do not pass apiKey in args-json");
    expect(`${result.stdout}${result.stderr}`).not.toContain("do-not-log-this");
  });

  it("redacts nested secret-shaped arguments from dry-run output", () => {
    const result = run([
      "custom:operation",
      '{"config":{"password":"nested-secret"}}',
      `--target=${target}`,
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[REDACTED]");
    expect(result.stdout).not.toContain("nested-secret");
  });
});
