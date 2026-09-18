import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  classifyLocalArtifactPath,
  directCleanupPolicies,
  evaluateGeneratedExportRetention,
  isProtectedLocalArtifactPath,
  LOCAL_ARTIFACT_HYGIENE_POLICIES,
  renderLocalArtifactPolicyMarkdownTable,
} from "./local-artifact-hygiene-policy.mjs";
import {
  collectTargets,
  runHygiene,
  walkForDsStore,
} from "../util/clean-local-artifacts.mjs";

const tmpRoots = [];
const repoRoot = process.cwd();

async function makeTmpRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dosewiki-hygiene-"));
  tmpRoots.push(root);
  return root;
}

async function touch(pathname) {
  await mkdir(path.dirname(pathname), { recursive: true });
  await writeFile(pathname, "local\n");
}

function captureLogger() {
  const lines = [];
  return {
    lines,
    logger: {
      log(message = "") {
        lines.push(message);
      },
    },
  };
}

afterEach(async () => {
  await Promise.all(tmpRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("local artifact hygiene policy", () => {
  it("classifies approved cleanup targets without broadening unknown paths", () => {
    expect(classifyLocalArtifactPath(".next")).toMatchObject({
      classification: "generated-output-boundary",
      cleanupBehavior: "manual-review-only",
    });
    expect(classifyLocalArtifactPath("coverage")).toMatchObject({
      classification: "generated-output",
      cleanupBehavior: "delete-recursively-when-present",
    });
    expect(classifyLocalArtifactPath("nested/.DS_Store")).toMatchObject({
      classification: "macos-metadata",
    });
    expect(classifyLocalArtifactPath("api/_utils")).toMatchObject({
      classification: "retired-empty-directory",
      cleanupBehavior: "delete-only-when-empty",
    });
    expect(classifyLocalArtifactPath("notes-and-plans/exports/batch/progress.json")).toMatchObject({
      classification: "generated-export-boundary",
      cleanupBehavior: "manual-review-only",
    });
    expect(classifyLocalArtifactPath("archive")).toBeNull();
    expect(classifyLocalArtifactPath("notes-and-plans")).toBeNull();
  });

  it("requires tracked generated exports to have retention metadata", () => {
    const report = evaluateGeneratedExportRetention([
      "notes-and-plans/exports/batch/batch-history-culture-progress.json",
      "notes-and-plans/exports/unclassified/scratch.json",
      "notes-and-plans/plans/ordinary-plan.md",
    ]);

    expect(report.retained).toEqual([
      expect.objectContaining({
        path: "notes-and-plans/exports/batch/batch-history-culture-progress.json",
        role: "run-output",
        owner: "data-workflow-maintainers",
        retention: expect.any(String),
        reviewDate: "2026-05-28",
      }),
    ]);
    expect(report.unclassified).toEqual([
      "notes-and-plans/exports/unclassified/scratch.json",
    ]);
  });

  it("marks protected directory subtrees as out of traversal scope", () => {
    expect(isProtectedLocalArtifactPath(".git")).toBe(true);
    expect(isProtectedLocalArtifactPath(".git/hooks")).toBe(true);
    expect(isProtectedLocalArtifactPath("nested/node_modules/pkg")).toBe(true);
    expect(isProtectedLocalArtifactPath(".next/cache/webpack")).toBe(true);
    expect(isProtectedLocalArtifactPath("tmp/recovery/session.json")).toBe(true);
    expect(isProtectedLocalArtifactPath("src/data")).toBe(false);
  });

  it("walks for .DS_Store files while skipping protected directories", async () => {
    const root = await makeTmpRepo();
    await touch(path.join(root, ".DS_Store"));
    await touch(path.join(root, "src", ".DS_Store"));
    await touch(path.join(root, ".git", ".DS_Store"));
    await touch(path.join(root, "node_modules", "pkg", ".DS_Store"));

    expect(walkForDsStore(root, { rootDir: root }).map((pathname) => path.relative(root, pathname)).sort()).toEqual([
      ".DS_Store",
      path.join("src", ".DS_Store"),
    ]);
  });

  it("collects only empty retired directories and never non-empty retired directories", async () => {
    const root = await makeTmpRepo();
    await mkdir(path.join(root, "api", "_utils"), { recursive: true });
    await touch(path.join(root, "api", "keep.js"));

    expect(collectTargets({ rootDir: root }).map((target) => path.relative(root, target.path))).toEqual([
      path.join("api", "_utils"),
    ]);
  });

  it("reports only automatically approved artifacts in check mode without deleting them", async () => {
    const root = await makeTmpRepo();
    await mkdir(path.join(root, ".next"), { recursive: true });
    await mkdir(path.join(root, "coverage"), { recursive: true });
    await touch(path.join(root, "coverage", "lcov.info"));
    const { logger, lines } = captureLogger();

    runHygiene({ rootDir: root, logger, validateLineage: false });

    expect(lines.join("\n")).toContain("1 approved local artifact path(s) found");
    expect(lines.join("\n")).toContain("coverage");
    expect(lines.join("\n")).not.toContain(".next (");
    expect(lines.join("\n")).toContain("Run `npm run hygiene:clean`");
    expect(existsSync(path.join(root, ".next"))).toBe(true);
    expect(existsSync(path.join(root, "coverage", "lcov.info"))).toBe(true);
  });

  it("removes approved artifacts while preserving the entire .next and tmp roots", async () => {
    const root = await makeTmpRepo();
    await touch(path.join(root, ".next", "cache", "webpack", "cache.bin"));
    await touch(path.join(root, ".next", "server", "recovery.json"));
    await touch(path.join(root, "tmp", "housecleaning", "recovery.json"));
    await touch(path.join(root, ".generated", "disposable.txt"));
    await touch(path.join(root, ".DS_Store"));
    await touch(path.join(root, ".env.local"));
    await touch(path.join(root, "archive", "keep.md"));
    await mkdir(path.join(root, "api", "_utils"), { recursive: true });

    runHygiene({ rootDir: root, shouldClean: true, logger: captureLogger().logger, validateLineage: false });

    expect(existsSync(path.join(root, ".next", "cache", "webpack", "cache.bin"))).toBe(true);
    expect(existsSync(path.join(root, ".next", "server", "recovery.json"))).toBe(true);
    expect(existsSync(path.join(root, "tmp", "housecleaning", "recovery.json"))).toBe(true);
    expect(existsSync(path.join(root, ".generated"))).toBe(false);
    expect(existsSync(path.join(root, ".DS_Store"))).toBe(false);
    expect(existsSync(path.join(root, "api", "_utils"))).toBe(false);
    expect(readdirSync(path.join(root, "api"))).toEqual([]);
    expect(existsSync(path.join(root, ".env.local"))).toBe(true);
    expect(existsSync(path.join(root, "archive", "keep.md"))).toBe(true);
  });

  it("does not delete generated export boundaries during local artifact cleanup", async () => {
    const root = await makeTmpRepo();
    await touch(path.join(root, "notes-and-plans", "exports", "batch", "progress.json"));

    runHygiene({ rootDir: root, shouldClean: true, logger: captureLogger().logger, validateLineage: false });

    expect(existsSync(path.join(root, "notes-and-plans", "exports", "batch", "progress.json"))).toBe(true);
  });

  it("keeps the project layout ignored artifact list aligned with policy", async () => {
    const projectLayout = await readFile(path.join(repoRoot, "docs/architecture/project-layout.md"), "utf8");
    const documentedList = projectLayout.match(/## Ignored Local Artifacts[\s\S]*?Use:/)?.[0] ?? "";

    const documentedPolicies = directCleanupPolicies()
      .filter((policy) => policy.classification !== "retired-empty-directory")
      .map((policy) => policy.path);

    for (const policyPath of [...documentedPolicies, ".DS_Store"]) {
      expect(documentedList, policyPath).toContain(`\`${policyPath}`);
    }
  });

  it("renders a docs table from every policy entry", () => {
    const table = renderLocalArtifactPolicyMarkdownTable();

    for (const policy of LOCAL_ARTIFACT_HYGIENE_POLICIES) {
      expect(table).toContain(`\`${policy.path}\``);
      expect(table).toContain(policy.cleanupBehavior);
    }
  });
});
