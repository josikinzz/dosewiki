import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  ARTIFACT_LINEAGE_RUN_DIR,
  buildArtifactLineageRecord,
  collectArtifactLineageVerification,
  collectArtifactLineageWarnings,
  findArtifactLineageEntry,
  listArtifactLineagePathMatches,
  validateArtifactLineageManifest,
  writeArtifactLineageSidecar,
} from "./data-artifact-lineage.mjs";

const tmpRoots = [];
const repoRoot = process.cwd();

async function makeTmpRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dosewiki-lineage-"));
  tmpRoots.push(root);
  return root;
}

function trackedArtifacts() {
  const sectionPromptDir = path.join(repoRoot, "content/prompts/sections");

  return [
    "data/lineage.json",
    "content/prompts/generator.md",
    "data/contributors/userProfiles.json",
    "data/chemistry/iupacSmilesMap.json",
    ...readdirSync(sectionPromptDir)
      .filter((file) => file.endsWith(".md"))
      .map((file) => `content/prompts/sections/${file}`),
  ].filter((artifactPath) => existsSync(path.join(repoRoot, artifactPath)));
}

afterEach(async () => {
  await Promise.all(tmpRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("data artifact lineage", () => {
  it("covers operational JSON and markdown data artifacts with role, producer, consumer, and edit policy", () => {
    const errors = validateArtifactLineageManifest({ rootDir: repoRoot });
    expect(errors).toEqual([]);

    for (const artifactPath of trackedArtifacts()) {
      const entry = findArtifactLineageEntry(artifactPath, { rootDir: repoRoot });
      expect(entry, artifactPath).toBeTruthy();
      expect(entry.role, artifactPath).toBeTruthy();
      expect(entry.producer, artifactPath).toBeTruthy();
      expect(entry.consumers?.length, artifactPath).toBeGreaterThan(0);
      expect(entry.inputs?.length, artifactPath).toBeGreaterThan(0);
      expect(entry.editPolicy, artifactPath).toBeTruthy();
      expect(entry.refreshCommand, artifactPath).toBeTruthy();
    }
  });

  it("keeps tracked generated exports classified without lineage errors", () => {
    const report = collectArtifactLineageVerification({ rootDir: repoRoot });
    expect(report.errors).toEqual([]);
    expect(report.generatedExports.unclassified).toEqual([]);
  });

  it("does not treat published remote asset URLs as missing local outputs", () => {
    const report = collectArtifactLineageVerification({
      rootDir: repoRoot,
      manifest: {
        artifacts: [
          {
            id: "remote-social-card-images",
            path: "https://media.example.test/sha256/**/*.jpg",
            role: "published-static-assets",
            producer: "scripts/build/publishSocialCardsToR2.mjs",
            consumers: ["Open Graph metadata"],
            inputs: ["generated manifest"],
            freshnessRule: "Published by the explicit refresh workflow.",
            editPolicy: "do-not-edit-by-hand",
            refreshCommand: "npm run refresh:social-cards",
          },
        ],
      },
      docsPaths: [],
      trackedGeneratedExports: [],
    });

    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it("flags tracked generated exports that are outside retention policy", () => {
    const report = collectArtifactLineageVerification({
      rootDir: repoRoot,
      trackedGeneratedExports: [
        "notes-and-plans/exports/batch/batch-history-culture-progress.json",
        "notes-and-plans/exports/unclassified/scratch.json",
      ],
    });

    expect(report.generatedExports).toMatchObject({
      tracked: 2,
      retained: 1,
      unclassified: ["notes-and-plans/exports/unclassified/scratch.json"],
    });
    expect(report.errors).toContain(
      "tracked generated export lacks retention policy: notes-and-plans/exports/unclassified/scratch.json",
    );
  });

  it("matches generated artifact wildcard paths", () => {
    expect(listArtifactLineagePathMatches("src/data/schema/*.generated*.ts", { rootDir: repoRoot })).toEqual(
      expect.arrayContaining([
        "src/data/schema/defaults.generated.ts",
        "src/data/schema/fieldRegistry.generated.ts",
      ]),
    );
  });

  it("fails manifest validation when SubstanceIndex exports/backups are not pinned to the references-era schema", () => {
    const errors = validateArtifactLineageManifest({
      rootDir: repoRoot,
      manifest: {
        artifacts: [
          {
            id: "substance-index-export",
            path: "src/data/SubstanceIndex.json",
            role: "derived-export",
            producer: "scripts/data-ops/export-data-to-json.mjs",
            consumers: ["scripts/data-ops/import-to-data.mjs"],
            inputs: ["Postgres substance records"],
            freshnessRule: "Refresh from Postgres before builds.",
            schemaVersion: "legacy/schema.ts",
            editPolicy: "do-not-edit-by-hand",
            refreshCommand: "npm run data:export",
          },
        ],
      },
    });

    expect(errors).toContain(
      "substance-index-export must declare schemaVersion src/schema/substance.schema.ts so local exports and backups stay pinned to the references-era article contract",
    );
  });

  it("builds sidecar metadata with command, deployment labels, schema, and content hash", async () => {
    const rootDir = await makeTmpRoot();
    const artifactPath = path.join(rootDir, "src/data/parsed-sources.json");
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, "{\"ok\":true}\n");

    const manifest = {
      artifacts: [
        {
          id: "parsed-sources",
          path: "src/data/parsed-sources.json",
          role: "derived",
          producer: "scripts/parse-sources.ts",
          consumers: ["scripts/prepopulate/*.mjs"],
          freshnessRule: "Refresh after parser changes.",
          editPolicy: "generated-with-manual-preservation",
          refreshCommand: "npm run parse:sources",
        },
      ],
    };

    const { outputPath, record } = writeArtifactLineageSidecar({
      artifactPath,
      rootDir,
      manifest,
      command: "bun scripts/parse-sources.ts --stats",
      generatedAt: "2026-04-26T00:00:00.000Z",
      sourceDeployment: "src/data/article-sources",
      schemaVersion: "scripts/parsers/types.ts",
    });

    expect(outputPath).toContain(ARTIFACT_LINEAGE_RUN_DIR);
    expect(record).toMatchObject({
      artifact: "src/data/parsed-sources.json",
      role: "derived",
      command: "bun scripts/parse-sources.ts --stats",
      generatedAt: "2026-04-26T00:00:00.000Z",
      sourceDeployment: "src/data/article-sources",
      schemaVersion: "scripts/parsers/types.ts",
      file: {
        exists: true,
        byteSize: 12,
      },
    });

    const sidecar = JSON.parse(await readFile(outputPath, "utf-8"));
    expect(sidecar.file.contentSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("warns when a tracked artifact changes after its latest sidecar was emitted", async () => {
    const rootDir = await makeTmpRoot();
    const artifactPath = path.join(rootDir, "src/data/parsed-sources.json");
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, "{\"version\":1}\n");

    const manifest = {
      artifacts: [
        {
          id: "parsed-sources",
          path: "src/data/parsed-sources.json",
          role: "derived",
          producer: "scripts/parse-sources.ts",
          consumers: ["scripts/prepopulate/*.mjs"],
          freshnessRule: "Refresh after parser changes.",
          editPolicy: "generated-with-manual-preservation",
          refreshCommand: "npm run parse:sources",
        },
      ],
    };

    buildArtifactLineageRecord({ artifactPath, rootDir, manifest });
    writeArtifactLineageSidecar({ artifactPath, rootDir, manifest });
    await writeFile(artifactPath, "{\"version\":2}\n");

    expect(collectArtifactLineageWarnings({ rootDir })).toEqual([
      "src/data/parsed-sources.json changed after its latest lineage sidecar was emitted",
    ]);
  });
});
