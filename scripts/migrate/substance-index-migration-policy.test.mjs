import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSubstanceIndexReplaceModeRetired,
  RETIRED_REPLACE_MODE_MESSAGE,
} from "./substance-index-migration-policy.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const migrationScript = join(testDirectory, "migrate-substance-index-to-data.mjs");
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("substance index migration replacement policy", () => {
  it("rejects replace mode while leaving ordinary and dry-run arguments allowed", () => {
    expect(() => assertSubstanceIndexReplaceModeRetired(["--replace"])).toThrow(
      RETIRED_REPLACE_MODE_MESSAGE,
    );
    expect(() => assertSubstanceIndexReplaceModeRetired(["--dry-run"])).not.toThrow();
    expect(() => assertSubstanceIndexReplaceModeRetired([])).not.toThrow();
  });

  it("fails replace mode before target resolution, local input reads, or client mutation", () => {
    const emptyWorkingDirectory = mkdtempSync(join(tmpdir(), "dosewiki-retired-replace-"));
    temporaryDirectories.push(emptyWorkingDirectory);
    const result = spawnSync(process.execPath, [migrationScript, "--replace", "--confirm-replace"], {
      cwd: emptyWorkingDirectory,
      encoding: "utf8",
      env: {},
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(RETIRED_REPLACE_MODE_MESSAGE);
    expect(result.stderr).not.toContain("Postgres project");
    expect(result.stderr).not.toContain("ENOENT");
    expect(result.stdout).not.toContain("Reading SubstanceIndex.json");
  });
});
