import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  applySuccessfulUpdates,
  createArticlePersistence,
  refreshLocalJsonExport,
} from "./persistence-artifacts.mjs";

const tmpRoots = [];

async function makeTmpPath() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dosewiki-batch-export-"));
  tmpRoots.push(root);
  return path.join(root, "SubstanceIndex.json");
}

afterEach(async () => {
  await Promise.all(tmpRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("batch persistence artifacts", () => {
  it("rejects implicit local export mutation from per-result Convex persistence", () => {
    expect(() =>
      createArticlePersistence({
        convexClient: { mutation: async () => ({ created: 0, updated: 1 }) },
        adminKey: "secret",
        applyUpdate: (article) => article,
        updateLocalJson: true,
      }),
    ).toThrow(/separate local export refresh/i);
  });

  it("rejects implicit local export mutation from bulk Convex persistence", async () => {
    await expect(
      applySuccessfulUpdates({
        results: { successfulUpdates: [{ title: "LSD", summary: "updated" }] },
        allArticles: [{ title: "LSD" }],
        convexClient: { mutation: async () => ({ created: 0, updated: 1 }) },
        adminKey: "secret",
        applyUpdate: (article, update) => Object.assign(article, update),
        updateLocalJson: true,
      }),
    ).rejects.toThrow(/separate local export refresh/i);
  });

  it("refreshes local JSON export only through an explicit export phase", async () => {
    const articlesFile = await makeTmpPath();

    expect(() =>
      refreshLocalJsonExport({
        articles: [{ title: "LSD" }],
        articlesFile,
      }),
    ).toThrow(/confirmLocalExportRefresh/);

    refreshLocalJsonExport({
      articles: [{ title: "LSD" }],
      articlesFile,
      confirmLocalExportRefresh: true,
    });

    await expect(readFile(articlesFile, "utf8")).resolves.toContain('"title": "LSD"');
  });
});
