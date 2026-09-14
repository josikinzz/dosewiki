import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  collectFeatureReachabilityFailures,
  createFeatureReachabilityReport,
} from "./feature-reachability.mjs";

const tmpRoots = [];

async function makeTmpRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dosewiki-feature-reachability-"));
  tmpRoots.push(root);
  return root;
}

async function touch(root, pathname, content = "") {
  const target = path.join(root, pathname);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

afterEach(async () => {
  await Promise.all(tmpRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("feature reachability", () => {
  it("fails unreachable compiled feature folders unless they have explicit dormant metadata", async () => {
    const root = await makeTmpRepo();
    await touch(root, "src/features/active/index.ts", "export const active = true;\n");
    await touch(root, "src/features/dormant/index.ts", "export const dormant = true;\n");
    await touch(root, "src/features/unowned/index.ts", "export const unowned = true;\n");
    await touch(root, "src/app/page.tsx", 'import "@/features/active";\n');
    await touch(
      root,
      "docs/architecture/feature-reachability.json",
      JSON.stringify({
        dormantFeatures: {
          dormant: {
            owner: "product",
            since: "2026-05-28",
            deleteTrigger: "Delete if no route ships by 2026-06-28.",
          },
        },
      }),
    );
    await touch(root, "package.json", JSON.stringify({ dependencies: {}, devDependencies: {} }));

    const report = createFeatureReachabilityReport({ repoRoot: root });

    expect(report.features).toEqual([
      expect.objectContaining({ name: "active", status: "active" }),
      expect.objectContaining({ name: "dormant", status: "dormant" }),
      expect.objectContaining({ name: "unowned", status: "unreachable" }),
    ]);
    expect(collectFeatureReachabilityFailures(report)).toEqual([
      expect.objectContaining({
        feature: "unowned",
        kind: "unreachable-feature",
      }),
    ]);
  });

  it("follows routed feature dependencies without activating disconnected cycles", async () => {
    const root = await makeTmpRepo();
    await touch(root, "src/app/page.tsx", 'import "@/features/shell";');
    await touch(root, "src/features/shell/index.ts", 'import "@/features/shared";');
    await touch(root, "src/features/shared/index.ts", 'import "@/features/leaf";');
    await touch(root, "src/features/leaf/index.ts", "export const leaf = true;");
    await touch(root, "src/features/cycle-a/index.ts", 'import "@/features/cycle-b";');
    await touch(root, "src/features/cycle-b/index.ts", 'import "@/features/cycle-a";');

    const report = createFeatureReachabilityReport({ repoRoot: root });
    expect(report.features.filter((feature) => feature.status === "active").map((feature) => feature.name))
      .toEqual(["leaf", "shared", "shell"]);
    expect(collectFeatureReachabilityFailures(report).map((failure) => failure.feature))
      .toEqual(["cycle-a", "cycle-b"]);
  });

});
